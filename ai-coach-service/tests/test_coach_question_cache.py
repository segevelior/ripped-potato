"""Tests for CoachQuestionService — the short-TTL cache behind the Today
dashboard's coach check-in question (serve fresh hits, miss on staleness or
date rollover, delete-on-answer invalidation)."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.services.coach_question_service import (
    CACHE_TTL_MINUTES,
    CoachQuestionService,
)

USER_ID = str(ObjectId())


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


def _doc(generated_minutes_ago=1, local_date=None, timezone="UTC"):
    now = datetime.utcnow()
    return {
        "userId": ObjectId(USER_ID),
        "localDate": local_date or datetime.now(ZoneInfo(timezone)).strftime("%Y-%m-%d"),
        "timezone": timezone,
        "question": "How's the knee feeling before today's run?",
        "chips": ["Good", "A bit sore", "Bad"],
        "source": "knee injury note",
        "generatedAt": now - timedelta(minutes=generated_minutes_ago),
    }


class TestGetFresh:
    @pytest.mark.asyncio
    async def test_fresh_doc_is_returned(self):
        service, _ = _service(find_one_result=_doc())
        doc = await service.get_fresh(USER_ID)
        assert doc is not None
        assert doc["question"] == "How's the knee feeling before today's run?"

    @pytest.mark.asyncio
    async def test_no_doc_returns_none(self):
        service, _ = _service(find_one_result=None)
        assert await service.get_fresh(USER_ID) is None

    @pytest.mark.asyncio
    async def test_stale_generated_at_misses(self):
        service, _ = _service(
            find_one_result=_doc(generated_minutes_ago=CACHE_TTL_MINUTES + 5)
        )
        assert await service.get_fresh(USER_ID) is None

    @pytest.mark.asyncio
    async def test_date_rollover_misses(self):
        # Generated moments ago but stamped with yesterday's local date
        # (e.g. cached just before the user's local midnight).
        yesterday = (datetime.now(ZoneInfo("UTC")) - timedelta(days=1)).strftime("%Y-%m-%d")
        service, _ = _service(find_one_result=_doc(local_date=yesterday))
        assert await service.get_fresh(USER_ID) is None

    @pytest.mark.asyncio
    async def test_missing_generated_at_misses(self):
        doc = _doc()
        doc.pop("generatedAt")
        service, _ = _service(find_one_result=doc)
        assert await service.get_fresh(USER_ID) is None

    @pytest.mark.asyncio
    async def test_bad_timezone_falls_back_to_utc(self):
        utc_today = datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d")
        service, _ = _service(
            find_one_result=_doc(local_date=utc_today, timezone="Not/AZone")
        )
        assert await service.get_fresh(USER_ID) is not None

    @pytest.mark.asyncio
    async def test_fetch_error_returns_none(self):
        service, _ = _service(find_one_error=RuntimeError("mongo down"))
        assert await service.get_fresh(USER_ID) is None


class TestSave:
    @pytest.mark.asyncio
    async def test_save_upserts_one_doc_per_user(self):
        service, collection = _service()
        ok = await service.save(
            USER_ID, "2026-07-16", "UTC",
            "Ready for intervals?", ["Yes", "Ease it"], "your Tuesday plan",
        )
        assert ok is True
        filter_, doc = collection.replace_one.call_args[0]
        assert filter_ == {"userId": ObjectId(USER_ID)}
        assert doc["question"] == "Ready for intervals?"
        assert doc["expiresAt"] > doc["generatedAt"]
        assert collection.replace_one.call_args[1]["upsert"] is True

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
