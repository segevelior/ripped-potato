"""Tombstone soft-delete for user memories + SKIP handling in the summarizer.

A user-deleted memory must stay deleted: it is tombstoned (deleted=True) rather
than removed, so promote_durable_facts' dedup — which reads the raw memories
array — can still see it and never re-learns the fact from old conversations.
Trivial conversations summarize to SKIP and produce no context entry.
"""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.agents.services.memory_service import MemoryService
from app.services.short_term_context_service import ShortTermContextService

USER_ID = str(ObjectId())


def _mem(content, deleted=False, is_active=True, category="health", importance="high"):
    m = {
        "_id": ObjectId(),
        "content": content,
        "category": category,
        "importance": importance,
        "isActive": is_active,
        "createdAt": datetime(2026, 7, 1),
    }
    if deleted:
        m["deleted"] = True
        m["deletedAt"] = datetime(2026, 7, 10)
        m["isActive"] = False
    return m


def _db_with_memories(memories):
    db = MagicMock()
    db.usermemories.find_one = AsyncMock(
        return_value={"user": ObjectId(USER_ID), "memories": memories}
    )
    db.usermemories.update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )
    return db


class TestGetUserMemories:
    @pytest.mark.asyncio
    async def test_filters_tombstoned_memories(self):
        db = _db_with_memories([
            _mem("Has a broken leg", deleted=True),
            _mem("Prefers morning workouts", category="preference"),
        ])
        result = await MemoryService(db).get_user_memories(USER_ID)
        contents = [m["content"] for m in result]
        assert contents == ["Prefers morning workouts"]

    @pytest.mark.asyncio
    async def test_legacy_memories_without_deleted_field_still_returned(self):
        db = _db_with_memories([_mem("Sore wrists")])
        result = await MemoryService(db).get_user_memories(USER_ID)
        assert len(result) == 1


class TestDeleteMemoryTombstones:
    @pytest.mark.asyncio
    async def test_delete_tombstones_instead_of_removing(self):
        memories = [_mem("Has a broken leg"), _mem("Prefers mornings", category="preference")]
        db = _db_with_memories(memories)

        result = await MemoryService(db).delete_memory(USER_ID, {"search_text": "broken leg"})

        assert result["success"] is True
        written = db.usermemories.update_one.call_args[0][1]["$set"]["memories"]
        assert len(written) == 2  # nothing spliced out
        tombstone = next(m for m in written if m["content"] == "Has a broken leg")
        assert tombstone["deleted"] is True
        assert tombstone["isActive"] is False
        assert isinstance(tombstone["deletedAt"], datetime)

    @pytest.mark.asyncio
    async def test_already_tombstoned_memory_is_not_matched(self):
        db = _db_with_memories([_mem("Has a broken leg", deleted=True)])
        result = await MemoryService(db).delete_memory(USER_ID, {"search_text": "broken leg"})
        assert result["success"] is False
        db.usermemories.update_one.assert_not_awaited()


class TestEnforceCapIgnoresTombstones:
    @pytest.mark.asyncio
    async def test_tombstones_dont_count_and_are_never_evicted(self):
        # 2 live + 3 tombstoned, cap of 2: live count is at the cap, so nothing
        # may be evicted even though the raw array exceeds it.
        memories = [
            _mem("old note 1", category="general", importance="low"),
            _mem("old note 2", category="general", importance="low"),
            _mem("deleted 1", deleted=True, category="general", importance="low"),
            _mem("deleted 2", deleted=True, category="general", importance="low"),
            _mem("deleted 3", deleted=True, category="general", importance="low"),
        ]
        db = _db_with_memories(memories)
        await MemoryService(db).enforce_cap(USER_ID, max_per_user=2)
        db.usermemories.update_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_overflow_evicts_live_low_value_but_not_tombstones(self):
        memories = [
            _mem("oldest live", category="general", importance="low"),
            _mem("newer live", category="general", importance="low"),
            _mem("deleted", deleted=True, category="general", importance="low"),
        ]
        memories[1]["createdAt"] = datetime(2026, 7, 5)
        db = _db_with_memories(memories)
        await MemoryService(db).enforce_cap(USER_ID, max_per_user=1)
        pulled_ids = db.usermemories.update_one.call_args[0][1]["$pull"]["memories"]["_id"]["$in"]
        assert pulled_ids == [memories[0]["_id"]]


def _openai_returning(content):
    client = MagicMock()
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=content))]
    client.chat.completions.create = AsyncMock(return_value=response)
    return client


def _settings():
    settings = MagicMock()
    settings.memory_auto_promote_enabled = True
    settings.memory_max_per_user = 60
    settings.openai_model_fast = "test-model"
    settings.llm_tuning_params = MagicMock(return_value={})
    return settings


class TestPromotionDedupsAgainstTombstones:
    @pytest.mark.asyncio
    async def test_deleted_fact_is_not_re_promoted(self):
        injury = "The athlete has a history of a sore back and a broken leg."
        db = _db_with_memories([_mem(injury, deleted=True)])
        db.users.find_one = AsyncMock(return_value={"_id": ObjectId(USER_ID)})
        service = ShortTermContextService(db)

        extractor_output = json.dumps(
            {"facts": [{"content": injury, "category": "health", "importance": "high"}]}
        )
        saved = await service.promote_durable_facts(
            USER_ID,
            source_text="Athlete: my back is sore\nCoach: noted",
            openai_client=_openai_returning(extractor_output),
            settings=_settings(),
        )

        assert saved == 0
        db.usermemories.update_one.assert_not_awaited()


class TestSummarizerSkip:
    def _service_with_stale_conversation(self, db):
        service = ShortTermContextService(db)
        conv = {
            "_id": ObjectId(),
            "conversation_id": "conv-1",
            "title": "Hey",
            "messages": [
                {"role": "human", "content": "hey"},
                {"role": "ai", "content": "Hey! How can I help?"},
            ],
        }
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[{"_id": conv["_id"]}])
        service.conversations = MagicMock()
        service.conversations.find.return_value = cursor
        service.conversations.find_one_and_update = AsyncMock(return_value=conv)
        service.conversations.update_one = AsyncMock()
        return service

    @pytest.mark.asyncio
    @pytest.mark.parametrize("skip_text", ["SKIP", "SKIP.", "skip"])
    async def test_skip_keeps_claim_and_writes_nothing(self, skip_text):
        db = MagicMock()
        service = self._service_with_stale_conversation(db)
        service.add_entry = AsyncMock()
        service.promote_durable_facts = AsyncMock()

        await service.summarize_stale_conversations(
            USER_ID, openai_client=_openai_returning(skip_text), settings=_settings()
        )

        service.add_entry.assert_not_awaited()
        service.promote_durable_facts.assert_not_awaited()
        # Claim must be kept — releasing it would retry the trivial chat forever
        service.conversations.update_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_real_summary_still_inserted(self):
        db = MagicMock()
        service = self._service_with_stale_conversation(db)
        service.add_entry = AsyncMock(return_value=True)
        service.promote_durable_facts = AsyncMock(return_value=0)

        await service.summarize_stale_conversations(
            USER_ID,
            openai_client=_openai_returning("The athlete scheduled a run for today."),
            settings=_settings(),
        )

        service.add_entry.assert_awaited_once()
        service.promote_durable_facts.assert_awaited_once()
        service.conversations.update_one.assert_not_awaited()
