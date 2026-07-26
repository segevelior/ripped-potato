"""ADD/UPDATE reconcile in promote_durable_facts + update_memory_by_id.

The extractor now returns decisions: UPDATE supersedes an existing memory in
place (positional _id update + history push), ADD persists a new one after the
dedup backstop. Deactivation states behave differently on restatement:
user-deleted tombstones are never re-added, script-retired (meta.retired)
memories are revived, and user-deactivated (Settings toggle, no meta.retired)
memories stay hidden.
"""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.agents.services.memory_service import MemoryService
from app.services.short_term_context_service import ShortTermContextService

USER_ID = str(ObjectId())


def _mem(content, category="general", importance="medium",
         deleted=False, is_active=True, meta=None):
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
        m["isActive"] = False
    if meta:
        m["meta"] = meta
    return m


def _db_with_memories(memories):
    db = MagicMock()
    db.usermemories.find_one = AsyncMock(
        return_value={"user": ObjectId(USER_ID), "memories": memories}
    )
    db.usermemories.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.users.find_one = AsyncMock(return_value={"_id": ObjectId(USER_ID)})
    return db


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


def _decisions(*decisions):
    return json.dumps({"decisions": list(decisions)})


def _mock_memory_service(monkeypatch):
    """Replace MemoryService inside promote_durable_facts with a recorder."""
    instance = MagicMock()
    instance.save_memory = AsyncMock(return_value={"success": True, "memory_id": "x"})
    instance.update_memory_by_id = AsyncMock(return_value={"success": True})
    instance.enforce_cap = AsyncMock()
    monkeypatch.setattr(
        "app.core.agents.services.memory_service.MemoryService",
        MagicMock(return_value=instance),
    )
    return instance


class TestReconcileDecisions:
    @pytest.mark.asyncio
    async def test_update_supersedes_targeted_memory(self, monkeypatch):
        knee = _mem("Knee pain when running", category="health", importance="high")
        db = _db_with_memories([knee])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: my knee has fully recovered",
            openai_client=_openai_returning(_decisions({
                "action": "UPDATE", "target": "m1",
                "content": "Knee fully recovered, running pain-free",
                "category": "health", "importance": "medium",
            })),
            settings=_settings(),
        )

        assert written == 1
        ms.update_memory_by_id.assert_awaited_once()
        args, kwargs = ms.update_memory_by_id.await_args
        assert args[1] == knee["_id"]  # ObjectId from THIS call's snapshot
        assert args[2] == "Knee fully recovered, running pain-free"
        assert kwargs.get("revive") is not True
        ms.save_memory.assert_not_awaited()
        ms.enforce_cap.assert_not_awaited()  # UPDATEs don't grow the array

    @pytest.mark.asyncio
    async def test_bracketed_target_label_still_resolves(self, monkeypatch):
        # Fast models sometimes echo the label as they saw it rendered:
        # "[m1]" instead of "m1". That must still hit the UPDATE path — a
        # miss would silently ADD a contradicting duplicate.
        knee = _mem("Knee pain when running", category="health", importance="high")
        db = _db_with_memories([knee])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: my knee has fully recovered",
            openai_client=_openai_returning(_decisions({
                "action": "UPDATE", "target": "[m1]",
                "content": "Knee fully recovered, running pain-free",
                "category": "health", "importance": "medium",
            })),
            settings=_settings(),
        )

        assert written == 1
        ms.update_memory_by_id.assert_awaited_once()
        assert ms.update_memory_by_id.await_args[0][1] == knee["_id"]
        ms.save_memory.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_failed_update_write_falls_through_to_add(self, monkeypatch):
        # Valid target but the write fails (e.g. concurrently tombstoned):
        # the fact must not be silently dropped — it falls through to ADD,
        # where the dedup backstop still applies.
        knee = _mem("Knee pain when running", category="health", importance="high")
        db = _db_with_memories([knee])
        ms = _mock_memory_service(monkeypatch)
        ms.update_memory_by_id = AsyncMock(return_value={"success": False})

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: my knee has fully recovered",
            openai_client=_openai_returning(_decisions({
                "action": "UPDATE", "target": "m1",
                "content": "Knee fully recovered, running pain-free",
                "category": "health", "importance": "medium",
            })),
            settings=_settings(),
        )

        assert written == 1
        ms.save_memory.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_bogus_target_degrades_to_add(self, monkeypatch):
        db = _db_with_memories([_mem("Prefers mornings", category="preference")])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: I train fasted at 6am",
            openai_client=_openai_returning(_decisions({
                "action": "UPDATE", "target": "m99",
                "content": "Trains fasted at 6am",
                "category": "lifestyle", "importance": "medium",
            })),
            settings=_settings(),
        )

        assert written == 1
        ms.update_memory_by_id.assert_not_awaited()
        ms.save_memory.assert_awaited_once()
        ms.enforce_cap.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_tombstoned_fact_never_re_added(self, monkeypatch):
        db = _db_with_memories([
            _mem("The athlete has a broken leg", category="health", deleted=True),
        ])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: my leg is broken",
            openai_client=_openai_returning(_decisions({
                "action": "ADD", "content": "The athlete has a broken leg",
                "category": "health", "importance": "high",
            })),
            settings=_settings(),
        )

        assert written == 0
        ms.save_memory.assert_not_awaited()
        ms.update_memory_by_id.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_script_retired_fact_is_revived_on_restatement(self, monkeypatch):
        retired = _mem(
            "Only has dumbbells at home", category="preference",
            is_active=False, meta={"retired": {"run": "rescore-2026-07"}},
        )
        db = _db_with_memories([retired])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: remember I only have dumbbells at home",
            openai_client=_openai_returning(_decisions({
                "action": "ADD", "content": "Only has dumbbells at home",
                "category": "preference", "importance": "medium",
            })),
            settings=_settings(),
        )

        assert written == 1
        ms.update_memory_by_id.assert_awaited_once()
        args, kwargs = ms.update_memory_by_id.await_args
        assert args[1] == retired["_id"]
        assert kwargs.get("revive") is True
        ms.save_memory.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_user_deactivated_fact_stays_hidden(self, monkeypatch):
        # Settings toggle: isActive False, no meta.retired — restatement must
        # NOT revive it (the user chose to hide it), just dedup-suppress.
        db = _db_with_memories([
            _mem("Hates burpees", category="preference", is_active=False),
        ])
        ms = _mock_memory_service(monkeypatch)

        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: I really hate burpees",
            openai_client=_openai_returning(_decisions({
                "action": "ADD", "content": "Hates burpees",
                "category": "preference", "importance": "low",
            })),
            settings=_settings(),
        )

        assert written == 0
        ms.update_memory_by_id.assert_not_awaited()
        ms.save_memory.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_garbage_llm_output_writes_nothing_and_never_raises(self, monkeypatch):
        db = _db_with_memories([])
        ms = _mock_memory_service(monkeypatch)
        written = await ShortTermContextService(db).promote_durable_facts(
            USER_ID, "Athlete: hello",
            openai_client=_openai_returning("not json at all"),
            settings=_settings(),
        )
        assert written == 0
        ms.save_memory.assert_not_awaited()


class TestUpdateMemoryById:
    def _db_for_update(self, item):
        db = MagicMock()
        db.usermemories.find_one = AsyncMock(return_value={"memories": [item]})
        db.usermemories.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        return db

    @pytest.mark.asyncio
    async def test_positional_update_with_history_push(self):
        item = _mem("Knee pain when running", category="health", importance="high")
        db = self._db_for_update(item)

        result = await MemoryService(db).update_memory_by_id(
            USER_ID, item["_id"], "Knee fully recovered", importance="medium",
        )

        assert result["success"] is True
        filter_arg, update_arg = db.usermemories.update_one.call_args[0]
        # Atomic per-item update, guarded against tombstones via $elemMatch
        assert filter_arg["memories"]["$elemMatch"]["_id"] == item["_id"]
        assert update_arg["$set"]["memories.$.content"] == "Knee fully recovered"
        assert isinstance(update_arg["$set"]["memories.$.updatedAt"], datetime)
        history = update_arg["$push"]["memories.$.history"]
        # Same shape as the legacy update_memory audit trail
        assert history["content"] == "Knee pain when running"
        assert history["category"] == "health"
        assert history["importance"] == "high"
        assert isinstance(history["changedAt"], datetime)

    @pytest.mark.asyncio
    async def test_health_category_cannot_be_recategorized_away(self):
        item = _mem("Knee pain", category="health")
        db = self._db_for_update(item)
        await MemoryService(db).update_memory_by_id(
            USER_ID, item["_id"], "Knee improving", category="preference",
        )
        update_arg = db.usermemories.update_one.call_args[0][1]
        assert "memories.$.category" not in update_arg["$set"]

    @pytest.mark.asyncio
    async def test_revive_reactivates_and_clears_retired_flag(self):
        item = _mem("Only dumbbells", category="preference",
                    is_active=False, meta={"retired": {"run": "r1"}})
        db = self._db_for_update(item)
        await MemoryService(db).update_memory_by_id(
            USER_ID, item["_id"], "Only has dumbbells at home", revive=True,
        )
        update_arg = db.usermemories.update_one.call_args[0][1]
        assert update_arg["$set"]["memories.$.isActive"] is True
        assert update_arg["$unset"] == {"memories.$.meta.retired": ""}

    @pytest.mark.asyncio
    async def test_tombstoned_memory_is_not_updated(self):
        item = _mem("Deleted fact", deleted=True)
        db = self._db_for_update(item)
        result = await MemoryService(db).update_memory_by_id(
            USER_ID, item["_id"], "New content",
        )
        assert result["success"] is False
        db.usermemories.update_one.assert_not_awaited()


class TestShortTermCheckinGate:
    def _db_with_find(self):
        db = MagicMock()
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        db["shortTermContext"].find = MagicMock(return_value=cursor)
        return db

    @pytest.mark.asyncio
    async def test_no_gate_by_default(self):
        db = MagicMock()
        collection = MagicMock()
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        collection.find = MagicMock(return_value=cursor)
        db.__getitem__ = MagicMock(return_value=collection)

        service = ShortTermContextService(db)
        await service.get_recent(USER_ID)
        query = collection.find.call_args[0][0]
        assert "$or" not in query

    @pytest.mark.asyncio
    async def test_gate_excludes_old_checkins_but_keeps_summaries(self):
        db = MagicMock()
        collection = MagicMock()
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        collection.find = MagicMock(return_value=cursor)
        db.__getitem__ = MagicMock(return_value=collection)

        service = ShortTermContextService(db)
        await service.get_recent(USER_ID, checkin_max_age_days=3)
        query = collection.find.call_args[0][0]
        # Non-checkin kinds (conversation summaries) pass unconditionally;
        # checkins only within the age window.
        branches = query["$or"]
        assert {"kind": {"$ne": "checkin"}} in branches
        age_branch = next(b for b in branches if "createdAt" in b)
        cutoff = age_branch["createdAt"]["$gte"]
        assert isinstance(cutoff, datetime)
        assert (datetime.utcnow() - cutoff).days == 3
