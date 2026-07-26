"""Decay-based memory ranking + the shared dated prompt formatter.

Read-time score = importance weight x exponential recency decay (updatedAt).
Health is decay-exempt (salience floor: injuries never fade or floor-drop),
goals decay on the slower half-life, and memories under memory_score_floor are
not injected. memory_decay_enabled=False must reproduce the legacy
importance-then-recency order.
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

import app.core.agents.services.memory_service as memory_service_module
from app.core.agents.services.memory_service import (
    IMPORTANCE_WEIGHTS,
    MemoryService,
    score_memory,
)

USER_ID = str(ObjectId())
NOW = datetime(2026, 7, 26)


def _mem(content, category="general", importance="medium",
         created=None, updated=None):
    m = {
        "_id": ObjectId(),
        "content": content,
        "category": category,
        "importance": importance,
        "isActive": True,
        "createdAt": created or NOW,
    }
    if updated:
        m["updatedAt"] = updated
    return m


def _db_with_memories(memories):
    db = MagicMock()
    db.usermemories.find_one = AsyncMock(
        return_value={"user": ObjectId(USER_ID), "memories": memories}
    )
    return db


def _settings(decay_enabled=True):
    s = MagicMock()
    s.memory_decay_enabled = decay_enabled
    s.memory_decay_half_life_days = 60.0
    s.memory_decay_half_life_goal_days = 120.0
    s.memory_decay_exempt_set = {"health"}
    s.memory_score_floor = 0.05
    return s


@pytest.fixture
def decay_settings(monkeypatch):
    settings = _settings(decay_enabled=True)
    monkeypatch.setattr(memory_service_module, "get_settings", lambda: settings)
    return settings


class TestScoreMemory:
    def test_health_is_exempt_from_decay(self):
        ancient = _mem("Knee injury", category="health", importance="low",
                       created=NOW - timedelta(days=1000))
        assert score_memory(ancient, NOW, 60.0, 120.0, {"health"}) == IMPORTANCE_WEIGHTS["low"]

    def test_decay_halves_per_half_life(self):
        m = _mem("Prefers mornings", category="preference", importance="high",
                 created=NOW - timedelta(days=60))
        assert score_memory(m, NOW, 60.0, 120.0, {"health"}) == pytest.approx(0.5)

    def test_goal_uses_slower_half_life(self):
        goal = _mem("Wants a muscle-up", category="goal", importance="high",
                    created=NOW - timedelta(days=120))
        pref = _mem("Prefers mornings", category="preference", importance="high",
                    created=NOW - timedelta(days=120))
        assert score_memory(goal, NOW, 60.0, 120.0, {"health"}) == pytest.approx(0.5)
        assert score_memory(pref, NOW, 60.0, 120.0, {"health"}) == pytest.approx(0.25)

    def test_missing_timestamp_scores_as_fresh(self):
        m = {"content": "legacy", "category": "general", "importance": "medium"}
        assert score_memory(m, NOW, 60.0, 120.0, {"health"}) == IMPORTANCE_WEIGHTS["medium"]

    def test_updated_at_restarts_the_clock(self):
        m = _mem("Superseded fact", category="preference", importance="medium",
                 created=NOW - timedelta(days=300), updated=NOW)
        assert score_memory(m, NOW, 60.0, 120.0, {"health"}) == IMPORTANCE_WEIGHTS["medium"]


class TestGetUserMemoriesDecay:
    @pytest.mark.asyncio
    async def test_old_general_memory_floor_dropped_health_survives(self, decay_settings):
        old = NOW - timedelta(days=300)  # medium/60d at 300d ≈ 0.019 < floor
        db = _db_with_memories([
            _mem("One-off junk from March", category="general", created=old),
            _mem("Knee injury", category="health", importance="low", created=old),
        ])
        result = await MemoryService(db).get_user_memories(USER_ID)
        contents = [m["content"] for m in result]
        assert contents == ["Knee injury"]

    @pytest.mark.asyncio
    async def test_fresh_medium_outranks_stale_high(self, decay_settings):
        # high/60d at 240 days = 1.0 * 0.5^4 = 0.0625; fresh medium = 0.6
        db = _db_with_memories([
            _mem("Stale but high", category="preference", importance="high",
                 created=NOW - timedelta(days=240)),
            _mem("Fresh medium", category="preference", importance="medium",
                 created=NOW - timedelta(days=1)),
        ])
        result = await MemoryService(db).get_user_memories(USER_ID)
        assert [m["content"] for m in result] == ["Fresh medium", "Stale but high"]

    @pytest.mark.asyncio
    async def test_kill_switch_reproduces_legacy_order(self, monkeypatch):
        monkeypatch.setattr(
            memory_service_module, "get_settings",
            lambda: _settings(decay_enabled=False),
        )
        db = _db_with_memories([
            _mem("Old high", importance="high", created=NOW - timedelta(days=400)),
            _mem("Fresh low", importance="low", created=NOW),
        ])
        result = await MemoryService(db).get_user_memories(USER_ID)
        # Legacy: importance buckets win regardless of age
        assert [m["content"] for m in result] == ["Old high", "Fresh low"]

    @pytest.mark.asyncio
    async def test_settings_unavailable_falls_back_to_legacy(self, monkeypatch):
        def _boom():
            raise RuntimeError("no env")
        monkeypatch.setattr(memory_service_module, "get_settings", _boom)
        db = _db_with_memories([_mem("Still returned")])
        result = await MemoryService(db).get_user_memories(USER_ID)
        assert [m["content"] for m in result] == ["Still returned"]


class TestFormatForPrompt:
    def test_empty_returns_empty_string(self):
        assert MemoryService.format_for_prompt([]) == ""

    def test_lines_are_dated_and_high_priority_prefixed(self):
        current_year = datetime.utcnow().year
        mems = [
            _mem("Knee pain when running", category="health", importance="high",
                 created=datetime(current_year, 7, 12)),
            _mem("Prefers morning sessions", category="preference",
                 created=datetime(current_year - 1, 6, 3)),
        ]
        block = MemoryService.format_for_prompt(mems)
        assert "HIGH PRIORITY: [health, noted Jul 12] Knee pain when running" in block
        # Year shown only when not the current year
        assert f"- [preference, noted Jun 03 {current_year - 1}] Prefers morning sessions" in block

    def test_updated_at_wins_over_created_at(self):
        current_year = datetime.utcnow().year
        m = _mem("Superseded", category="preference",
                 created=datetime(current_year, 1, 1),
                 updated=datetime(current_year, 7, 20))
        assert "noted Jul 20" in MemoryService.format_for_prompt([m])

    def test_limit_respected(self):
        mems = [_mem(f"fact {i}") for i in range(20)]
        block = MemoryService.format_for_prompt(mems, limit=5)
        # header + 5 lines
        assert len(block.splitlines()) == 6

    def test_memory_without_timestamp_renders_undated(self):
        m = {"content": "legacy", "category": "general", "importance": "medium"}
        assert "- [general] legacy" in MemoryService.format_for_prompt([m])
