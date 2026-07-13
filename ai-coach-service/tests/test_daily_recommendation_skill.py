"""Tests for the get_daily_recommendation skill (TOR-19): fetch the persisted
Today's Pick, generate it lazily under the shared train-now lock, never
generate for past dates."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.v1 import train_now as train_now_module
from app.core.agents.skills.daily_recommendation_skill import get_daily_recommendation
from app.core.agents.skills.registry import get_skill_names

USER_ID = "6a50b08cfc7515275d6e0e68"
TODAY = "2026-07-13"


def _ctx():
    ctx = MagicMock()
    ctx.db = MagicMock()
    ctx.settings = MagicMock()
    return ctx


def _doc(name="Bodyweight Core + Mobility"):
    return {
        "suggestion": {"type": "workout", "name": name, "blocks": []},
        "generatedAt": datetime(2026, 7, 13, 6, 32),
    }


@pytest.fixture(autouse=True)
def _isolate_locks(monkeypatch):
    monkeypatch.setattr(train_now_module, "_generation_locks", {})


@pytest.fixture
def _local_date(monkeypatch):
    monkeypatch.setattr(
        train_now_module, "_get_user_local_date", AsyncMock(return_value=(TODAY, "Asia/Jerusalem"))
    )


def _mock_recommendation_service(monkeypatch, get_for_date_results):
    """Patch RecommendationService inside the skill module; get_for_date returns
    the given results in order (last one repeats)."""
    service = MagicMock()
    service.get_for_date = AsyncMock(side_effect=get_for_date_results)
    monkeypatch.setattr(
        "app.core.agents.skills.daily_recommendation_skill.RecommendationService",
        MagicMock(return_value=service),
    )
    return service


class TestGetDailyRecommendation:
    def test_skill_is_registered(self):
        assert "get_daily_recommendation" in get_skill_names()

    @pytest.mark.asyncio
    async def test_returns_persisted_pick_without_generating(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [_doc()])
        generate = AsyncMock()
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is True
        assert result["cached"] is True
        assert result["suggestion"]["name"] == "Bodyweight Core + Mobility"
        assert "Dashboard" in result["note"]
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_generates_when_missing_today(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None, None])
        generate = AsyncMock(return_value={"success": True, "suggestion": {"type": "workout", "name": "Fresh Pick"}})
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        ctx = _ctx()
        result = await get_daily_recommendation(ctx, USER_ID, {})

        assert result["success"] is True
        assert result["cached"] is False
        assert result["suggestion"]["name"] == "Fresh Pick"
        generate.assert_awaited_once()
        # Reuses the endpoint's per-user lock map so dashboard + chat share one generation
        assert USER_ID in train_now_module._generation_locks
        # user_context passed without email/username still works
        args = generate.await_args.args
        assert args[3] == USER_ID and args[4] == TODAY

    @pytest.mark.asyncio
    async def test_double_check_inside_lock_prevents_duplicate_generation(self, monkeypatch, _local_date):
        # First check (outside lock) misses; re-check inside the lock finds a doc
        # persisted by a concurrent dashboard request.
        _mock_recommendation_service(monkeypatch, [None, _doc("Raced Pick")])
        generate = AsyncMock()
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["suggestion"]["name"] == "Raced Pick"
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_past_date_never_generates(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None])
        generate = AsyncMock()
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {"date": "2026-07-10"})

        assert result["success"] is True
        assert result["suggestion"] is None
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_generate_if_missing_false_skips_generation(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None])
        generate = AsyncMock()
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {"generate_if_missing": False})

        assert result["success"] is True
        assert result["suggestion"] is None
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_date_rejected(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None])
        result = await get_daily_recommendation(_ctx(), USER_ID, {"date": "next tuesday"})
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_generation_failure_reported(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None, None])
        generate = AsyncMock(return_value={"success": False, "error": "LLM down"})
        monkeypatch.setattr(train_now_module, "_generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is False
        assert "LLM down" in result["message"]
