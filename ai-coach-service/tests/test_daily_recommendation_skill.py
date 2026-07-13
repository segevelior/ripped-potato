"""Tests for the get_daily_recommendation skill and the shared
daily_pick_service (TOR-19): fetch the persisted Today's Pick, generate it
lazily under the shared lock, refresh on demand, never generate for past dates."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import daily_pick_service
from app.core.agents.skills import daily_recommendation_skill as skill_module
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
    monkeypatch.setattr(daily_pick_service, "generation_locks", {})


@pytest.fixture
def _local_date(monkeypatch):
    stub = AsyncMock(return_value=(TODAY, "Asia/Jerusalem"))
    # Patch both the service and the name the skill imported.
    monkeypatch.setattr(daily_pick_service, "get_user_local_date", stub)
    monkeypatch.setattr(skill_module, "get_user_local_date", stub)


def _mock_recommendation_service(monkeypatch, get_for_date_results, targets=(skill_module, daily_pick_service)):
    """Patch RecommendationService where it's used; get_for_date returns the
    given results in order."""
    service = MagicMock()
    service.get_for_date = AsyncMock(side_effect=get_for_date_results)
    for target in targets:
        monkeypatch.setattr(target, "RecommendationService", MagicMock(return_value=service))
    return service


class TestGetDailyRecommendation:
    def test_skill_is_registered_with_refresh_param(self):
        assert "get_daily_recommendation" in get_skill_names()
        from app.core.agents.skills import get_skill_definitions
        definition = next(
            d for d in get_skill_definitions()
            if d["function"]["name"] == "get_daily_recommendation"
        )
        assert "refresh" in definition["function"]["parameters"]["properties"]

    @pytest.mark.asyncio
    async def test_returns_persisted_pick_without_generating(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [_doc()])
        generate = AsyncMock()
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is True
        assert result["cached"] is True
        assert result["suggestion"]["name"] == "Bodyweight Core + Mobility"
        assert "Dashboard" in result["note"]
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_generates_when_missing_today(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None, None, None])
        generate = AsyncMock(return_value={"success": True, "suggestion": {"type": "workout", "name": "Fresh Pick"}, "cached": False})
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is True
        assert result["cached"] is False
        assert result["suggestion"]["name"] == "Fresh Pick"
        generate.assert_awaited_once()
        # Went through the shared service lock map (one entry per user)
        assert USER_ID in daily_pick_service.generation_locks
        assert generate.await_args.kwargs["refresh"] is False

    @pytest.mark.asyncio
    async def test_refresh_bypasses_cache_and_regenerates(self, monkeypatch, _local_date):
        # Cached doc exists, but refresh=True must skip it and regenerate.
        _mock_recommendation_service(monkeypatch, [_doc("Old Pick")] * 3)
        generate = AsyncMock(return_value={"success": True, "suggestion": {"type": "workout", "name": "New Pick"}, "cached": False})
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {"refresh": True})

        assert result["success"] is True
        assert result["suggestion"]["name"] == "New Pick"
        assert "REPLACES" in result["note"]
        generate.assert_awaited_once()
        assert generate.await_args.kwargs["refresh"] is True

    @pytest.mark.asyncio
    async def test_null_optionals_keep_defaults(self, monkeypatch, _local_date):
        # Models routinely pass null for optionals — null must NOT disable
        # generation or trigger refresh.
        _mock_recommendation_service(monkeypatch, [None, None, None])
        generate = AsyncMock(return_value={"success": True, "suggestion": {"type": "workout", "name": "Fresh Pick"}, "cached": False})
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(
            _ctx(), USER_ID, {"date": "today", "generate_if_missing": None, "refresh": None}
        )

        assert result["success"] is True
        assert result["suggestion"]["name"] == "Fresh Pick"
        generate.assert_awaited_once()
        assert generate.await_args.kwargs["refresh"] is False

    @pytest.mark.asyncio
    async def test_past_date_never_generates_even_with_refresh(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None])
        generate = AsyncMock()
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {"date": "2026-07-10", "refresh": True})

        assert result["success"] is True
        assert result["suggestion"] is None
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_generate_if_missing_false_skips_generation(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [None])
        generate = AsyncMock()
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

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
        _mock_recommendation_service(monkeypatch, [None, None, None])
        generate = AsyncMock(return_value={"success": False, "error": "LLM down"})
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is False
        assert "LLM down" in result["message"]

    @pytest.mark.asyncio
    async def test_string_generated_at_does_not_crash(self, monkeypatch, _local_date):
        # A manually seeded / migrated doc may hold a string generatedAt; the
        # endpoint guards this with isinstance — the skill must too.
        doc = _doc()
        doc["generatedAt"] = "2026-07-13T06:32:00Z"
        _mock_recommendation_service(monkeypatch, [doc])

        result = await get_daily_recommendation(_ctx(), USER_ID, {})

        assert result["success"] is True
        assert result["generated_at"] is None


class TestGetOrGenerateTodayPick:
    @pytest.mark.asyncio
    async def test_fast_path_returns_cached_without_lock_generation(self, monkeypatch, _local_date):
        _mock_recommendation_service(monkeypatch, [_doc()], targets=(daily_pick_service,))
        generate = AsyncMock()
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await daily_pick_service.get_or_generate_today_pick(MagicMock(), MagicMock(), USER_ID)

        assert result["cached"] is True
        assert result["suggestion"]["name"] == "Bodyweight Core + Mobility"
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_double_check_inside_lock_prevents_duplicate_generation(self, monkeypatch, _local_date):
        # First check (outside lock) misses; re-check inside the lock finds a
        # doc persisted by a concurrent request.
        _mock_recommendation_service(monkeypatch, [None, _doc("Raced Pick")], targets=(daily_pick_service,))
        generate = AsyncMock()
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await daily_pick_service.get_or_generate_today_pick(MagicMock(), MagicMock(), USER_ID)

        assert result["suggestion"]["name"] == "Raced Pick"
        generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_refresh_skips_both_cache_checks(self, monkeypatch, _local_date):
        service = _mock_recommendation_service(monkeypatch, [_doc("Old")] * 3, targets=(daily_pick_service,))
        generate = AsyncMock(return_value={"success": True, "suggestion": {"name": "New"}, "cached": False})
        monkeypatch.setattr(daily_pick_service, "generate_and_persist", generate)

        result = await daily_pick_service.get_or_generate_today_pick(
            MagicMock(), MagicMock(), USER_ID, refresh=True
        )

        assert result["suggestion"]["name"] == "New"
        generate.assert_awaited_once()
        assert generate.await_args.kwargs["refresh"] is True
        # No cache reads happened before generation on the refresh path
        service.get_for_date.assert_not_called()
