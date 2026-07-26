"""Real-LLM evals for promote_durable_facts (extract + reconcile).

Deterministic final-state checks against a scratch DB — no LLM judge. Each
scenario calls promote_durable_facts directly with the real extractor model:
1. One-off task chatter must NOT become a memory.
2. A contradiction must UPDATE (supersede) the existing memory, not duplicate it.
3. Genuine durables must be ADDed with sane categories, no near-duplicates.
4. A user-deleted (tombstoned) fact must never be re-added.

Run:  RUN_LLM_EVALS=1 EVAL_K=1 pytest evals/test_memory_promotion.py -x -q
"""
import os
from datetime import datetime, timedelta

from bson import ObjectId
from openai import AsyncOpenAI

from app.config import get_settings
from app.services.short_term_context_service import ShortTermContextService
from evals.scenarios import seed_user

EVAL_K = int(os.environ.get("EVAL_K", "2"))


def _client_and_settings():
    settings = get_settings()
    return AsyncOpenAI(api_key=settings.openai_api_key), settings


async def _active_memories(db, user_id):
    doc = await db.usermemories.find_one({"user": ObjectId(user_id)})
    return [
        m for m in (doc or {}).get("memories", [])
        if m.get("isActive", True) and not m.get("deleted")
    ]


async def _seed_memory(db, user_id, content, category="health", importance="high",
                       deleted=False, days_old=30):
    ts = datetime.utcnow() - timedelta(days=days_old)
    item = {
        "_id": ObjectId(),
        "content": content,
        "category": category,
        "importance": importance,
        "isActive": not deleted,
        "source": "sensei",
        "createdAt": ts,
        "updatedAt": ts,
    }
    if deleted:
        item["deleted"] = True
        item["deletedAt"] = ts
    await db.usermemories.update_one(
        {"user": ObjectId(user_id)},
        {"$push": {"memories": item}, "$setOnInsert": {"createdAt": ts}},
        upsert=True,
    )
    return item


async def test_one_off_chatter_is_not_promoted(scratch_db):
    client, settings = _client_and_settings()
    for _ in range(EVAL_K):
        user_id = await seed_user(scratch_db)
        await ShortTermContextService(scratch_db).promote_durable_facts(
            user_id,
            source_text=(
                'Athlete: "can you add pull-ups to my Friday workout?"\n'
                'Coach: "Done — I added 3x8 pull-ups to Friday\'s session."'
            ),
            openai_client=client,
            settings=settings,
        )
        memories = await _active_memories(scratch_db, user_id)
        assert memories == [], (
            f"one-off request leaked into long-term memory: "
            f"{[m['content'] for m in memories]}"
        )


async def test_contradiction_supersedes_instead_of_duplicating(scratch_db):
    client, settings = _client_and_settings()
    for _ in range(EVAL_K):
        user_id = await seed_user(scratch_db)
        seeded = await _seed_memory(
            scratch_db, user_id, "Knee pain when running", category="health"
        )
        await ShortTermContextService(scratch_db).promote_durable_facts(
            user_id,
            source_text=(
                'Athlete: "great news — my knee has fully recovered, I ran 10k '
                'yesterday completely pain-free"\n'
                'Coach: "Fantastic, let\'s build your running volume back up."'
            ),
            openai_client=client,
            settings=settings,
        )
        memories = await _active_memories(scratch_db, user_id)
        knee = [m for m in memories if "knee" in m.get("content", "").lower()]
        assert len(knee) == 1, (
            f"expected exactly one knee memory, got: "
            f"{[m['content'] for m in memories]}"
        )
        assert knee[0]["_id"] == seeded["_id"], "knee memory was duplicated, not superseded"
        assert knee[0]["content"] != "Knee pain when running", "content not replaced"
        assert knee[0].get("history"), "supersession must leave a history entry"
        assert knee[0]["updatedAt"] > seeded["updatedAt"], "updatedAt (decay clock) not refreshed"
        assert knee[0]["category"] == "health", "health category must be preserved"


async def test_genuine_durables_are_added(scratch_db):
    client, settings = _client_and_settings()
    for _ in range(EVAL_K):
        user_id = await seed_user(scratch_db)
        await ShortTermContextService(scratch_db).promote_durable_facts(
            user_id,
            source_text=(
                'Athlete: "for context: I only have dumbbells at home, and I '
                'always train fasted at 6am before work"\n'
                'Coach: "Noted — I\'ll plan dumbbell-only morning sessions."'
            ),
            openai_client=client,
            settings=settings,
        )
        memories = await _active_memories(scratch_db, user_id)
        assert 1 <= len(memories) <= 3, (
            f"expected 1-3 durable facts, got {len(memories)}: "
            f"{[m['content'] for m in memories]}"
        )
        assert all(
            m.get("category") in {"preference", "lifestyle", "general"}
            for m in memories
        ), f"unexpected categories: {[(m['content'], m['category']) for m in memories]}"
        contents = [m["content"].lower() for m in memories]
        assert len(set(contents)) == len(contents), f"near-duplicates saved: {contents}"


async def test_tombstoned_fact_is_never_relearned(scratch_db):
    client, settings = _client_and_settings()
    for _ in range(EVAL_K):
        user_id = await seed_user(scratch_db)
        await _seed_memory(
            scratch_db, user_id,
            "Trains fasted in the morning", category="lifestyle",
            importance="medium", deleted=True,
        )
        await ShortTermContextService(scratch_db).promote_durable_facts(
            user_id,
            source_text=(
                'Athlete: "reminder that I train fasted in the morning"\n'
                'Coach: "Understood."'
            ),
            openai_client=client,
            settings=settings,
        )
        memories = await _active_memories(scratch_db, user_id)
        fasted = [m for m in memories if "fasted" in m.get("content", "").lower()]
        assert fasted == [], (
            f"user-deleted fact was re-learned: {[m['content'] for m in fasted]}"
        )
