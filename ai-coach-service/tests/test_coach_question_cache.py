"""Tests for CoachQuestionService — the fingerprint cache behind the Today
dashboard's coach check-in question (serve only on an exact inputs-hash match,
diagnosable miss reasons, the max-age ceiling / kill switch, and
delete-on-answer invalidation)."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.llm_cache import PROMPT_VERSION
from app.services.coach_question_service import (
    DOC_TTL_DAYS,
    CoachQuestionService,
)

USER_ID = str(ObjectId())
HASH = "a" * 64


def _service(find_one_result=None, find_one_error=None):
    collection = MagicMock()
    if find_one_error is not None:
        collection.find_one = AsyncMock(side_effect=find_one_error)
    else:
        collection.find_one = AsyncMock(return_value=find_one_result)
    collection.replace_one = AsyncMock()
    collection.delete_one = AsyncMock()
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)
    return CoachQuestionService(db), collection


def _doc(generated_minutes_ago=1, local_date=None, timezone="UTC", inputs_hash=HASH):
    now = datetime.utcnow()
    doc = {
        "userId": ObjectId(USER_ID),
        "localDate": local_date or datetime.now(ZoneInfo(timezone)).strftime("%Y-%m-%d"),
        "timezone": timezone,
        "question": "How's the knee feeling before today's run?",
        "chips": ["Good", "A bit sore", "Bad"],
        "source": "knee injury note",
        "generatedAt": now - timedelta(minutes=generated_minutes_ago),
    }
    if inputs_hash is not None:
        doc["inputsHash"] = inputs_hash
    return doc


class TestGetMatching:
    @pytest.mark.asyncio
    async def test_matching_hash_is_served(self):
        service, _ = _service(find_one_result=_doc())
        lookup = await service.get_matching(USER_ID, HASH)
        assert lookup.reason == "hit"
        assert lookup.doc["question"] == "How's the knee feeling before today's run?"

    @pytest.mark.asyncio
    async def test_age_alone_does_not_expire_a_match(self):
        """The point of the change: an unchanged athlete keeps the same question
        well past the 45 minutes the old time TTL allowed."""
        service, _ = _service(find_one_result=_doc(generated_minutes_ago=120))
        lookup = await service.get_matching(USER_ID, HASH, max_age_minutes=240)
        assert lookup.reason == "hit"

    @pytest.mark.asyncio
    async def test_different_hash_misses(self):
        service, _ = _service(find_one_result=_doc(inputs_hash="b" * 64))
        lookup = await service.get_matching(USER_ID, HASH)
        assert lookup.doc is None
        assert lookup.reason == "hash_changed"
        # The stale hash reaches the caller so a prod miss is diagnosable.
        assert lookup.stored_hash == "b" * 64

    @pytest.mark.asyncio
    async def test_legacy_doc_without_hash_misses_once(self):
        """Migration contract: docs written before fingerprinting simply miss
        and get rewritten. No migration script needed."""
        service, _ = _service(find_one_result=_doc(inputs_hash=None))
        lookup = await service.get_matching(USER_ID, HASH)
        assert lookup.doc is None
        assert lookup.reason == "hash_changed"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("empty", [None, ""])
    async def test_no_hash_never_matches_even_a_hashless_doc(self, empty):
        """A doc saved without a hash (fingerprinting failed) exists only for
        get_pending_today — null must never match null."""
        service, collection = _service(find_one_result=_doc(inputs_hash=None))
        lookup = await service.get_matching(USER_ID, empty)
        assert lookup.doc is None
        assert lookup.reason == "no_hash"
        collection.find_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_doc_misses(self):
        service, _ = _service(find_one_result=None)
        lookup = await service.get_matching(USER_ID, HASH)
        assert lookup.doc is None
        assert lookup.reason == "no_doc"

    @pytest.mark.asyncio
    async def test_max_age_zero_disables_the_cache_without_a_read(self):
        """The env-only kill switch: no revert deploy needed if the cache
        misbehaves in prod."""
        service, collection = _service(find_one_result=_doc())
        lookup = await service.get_matching(USER_ID, HASH, max_age_minutes=0)
        assert lookup.doc is None
        assert lookup.reason == "disabled"
        collection.find_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_doc_older_than_ceiling_misses_despite_matching_hash(self):
        service, _ = _service(find_one_result=_doc(generated_minutes_ago=300))
        lookup = await service.get_matching(USER_ID, HASH, max_age_minutes=240)
        assert lookup.doc is None
        assert lookup.reason == "max_age"

    @pytest.mark.asyncio
    async def test_missing_generated_at_misses_when_a_ceiling_is_set(self):
        doc = _doc()
        doc.pop("generatedAt")
        service, _ = _service(find_one_result=doc)
        lookup = await service.get_matching(USER_ID, HASH, max_age_minutes=240)
        assert lookup.doc is None
        assert lookup.reason == "no_generated_at"

    @pytest.mark.asyncio
    async def test_no_ceiling_ignores_generated_at(self):
        doc = _doc(generated_minutes_ago=10_000)
        doc.pop("generatedAt")
        service, _ = _service(find_one_result=doc)
        lookup = await service.get_matching(USER_ID, HASH, max_age_minutes=None)
        assert lookup.reason == "hit"

    @pytest.mark.asyncio
    async def test_fetch_error_degrades_to_a_miss(self):
        service, _ = _service(find_one_error=RuntimeError("mongo down"))
        lookup = await service.get_matching(USER_ID, HASH)
        assert lookup.doc is None
        assert lookup.reason == "error"


class TestSave:
    @pytest.mark.asyncio
    async def test_save_upserts_one_doc_per_user(self):
        service, collection = _service()
        ok = await service.save(
            USER_ID, "2026-07-16", "UTC",
            "Ready for intervals?", ["Yes", "Ease it"], "your Tuesday plan",
            inputs_hash=HASH, part_of_day="morning",
        )
        assert ok is True
        filter_, doc = collection.replace_one.call_args[0]
        assert filter_ == {"userId": ObjectId(USER_ID)}
        assert doc["question"] == "Ready for intervals?"
        assert doc["inputsHash"] == HASH
        assert doc["partOfDay"] == "morning"
        assert doc["promptVersion"] == PROMPT_VERSION
        assert doc["expiresAt"] > doc["generatedAt"]
        assert collection.replace_one.call_args[1]["upsert"] is True

    @pytest.mark.asyncio
    async def test_save_writes_the_fields_get_pending_today_reads(self):
        """The real proof the save->read contract still satisfies the sensei's
        pending-check-in block (test_sensei_calendar_context mocks the read)."""
        service, collection = _service()
        await service.save(
            USER_ID, "2026-07-16", "UTC", "Ready?", ["Yes"], "src",
        )
        _, doc = collection.replace_one.call_args[0]
        assert doc["localDate"] == "2026-07-16"
        assert doc["question"] == "Ready?"
        assert doc["chips"] == ["Yes"]
        assert doc["source"] == "src"

    @pytest.mark.asyncio
    async def test_save_without_a_hash_stores_null(self):
        """Fingerprinting failed: the doc must still exist for
        get_pending_today, but must never serve a cache hit."""
        service, collection = _service()
        await service.save(USER_ID, "2026-07-16", "UTC", "Q?", ["A"], "src")
        _, doc = collection.replace_one.call_args[0]
        assert doc["inputsHash"] is None

    @pytest.mark.asyncio
    async def test_doc_ttl_matches_the_configured_days(self):
        service, collection = _service()
        await service.save(USER_ID, "2026-07-16", "UTC", "Q?", ["A"], "src")
        _, doc = collection.replace_one.call_args[0]
        assert doc["expiresAt"] - doc["generatedAt"] == timedelta(days=DOC_TTL_DAYS)

    @pytest.mark.asyncio
    async def test_save_retries_on_duplicate_key_race(self):
        service, collection = _service()
        collection.replace_one = AsyncMock(
            side_effect=[DuplicateKeyError("race"), MagicMock()]
        )
        ok = await service.save(USER_ID, "2026-07-16", "UTC", "Q?", ["A"], "src")
        assert ok is True
        assert collection.replace_one.call_count == 2

    @pytest.mark.asyncio
    async def test_save_error_returns_false(self):
        service, collection = _service()
        collection.replace_one = AsyncMock(side_effect=RuntimeError("mongo down"))
        ok = await service.save(USER_ID, "2026-07-16", "UTC", "Q?", ["A"], "src")
        assert ok is False


class TestGetPendingToday:
    @pytest.mark.asyncio
    async def test_serves_todays_doc_regardless_of_the_fingerprint(self):
        """An unanswered question stays on the dashboard even once its inputs
        have moved on and it can no longer serve the cache."""
        service, _ = _service(find_one_result=_doc(local_date="2026-07-26",
                                                   inputs_hash="stale"))
        assert await service.get_pending_today(USER_ID, "2026-07-26") is not None

    @pytest.mark.asyncio
    async def test_yesterdays_doc_is_not_pending(self):
        service, _ = _service(find_one_result=_doc(local_date="2026-07-25"))
        assert await service.get_pending_today(USER_ID, "2026-07-26") is None


class TestInvalidate:
    @pytest.mark.asyncio
    async def test_invalidate_deletes_the_user_doc(self):
        service, collection = _service()
        await service.invalidate(USER_ID)
        collection.delete_one.assert_awaited_once_with({"userId": ObjectId(USER_ID)})

    @pytest.mark.asyncio
    async def test_invalidate_swallows_errors(self):
        service, collection = _service()
        collection.delete_one = AsyncMock(side_effect=RuntimeError("mongo down"))
        # Must not raise — invalidation is best-effort inside the reply path.
        await service.invalidate(USER_ID)
