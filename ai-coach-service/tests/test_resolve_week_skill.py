"""Tests for the resolve_week skill (pure target picking + handler)."""

from datetime import datetime

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.plan_builder import build_plan_weeks_from_skeleton, normalize_skeleton
from app.core.agents.skills.resolve_week_skill import (
    pick_target_week,
    resolve_week,
    weeks_since_last_deload,
)
from tests.test_plan_builder import _skeleton


class TestPickTargetWeek:
    def _weeks(self):
        return [
            {"weekNumber": 1, "resolved": True},
            {"weekNumber": 2, "resolved": True},
            {"weekNumber": 3, "resolved": False},
            {"weekNumber": 4, "resolved": False},
        ]

    def test_first_unresolved_within_horizon(self):
        assert pick_target_week(self._weeks(), current_week=2, horizon=2) == 3

    def test_none_when_horizon_already_resolved(self):
        assert pick_target_week(self._weeks(), current_week=1, horizon=2) is None

    def test_explicit_week_wins(self):
        assert pick_target_week(self._weeks(), 1, 2, explicit=4) == 4

    def test_explicit_resolved_week_is_none(self):
        assert pick_target_week(self._weeks(), 1, 2, explicit=1) is None

    def test_legacy_weeks_without_flag_never_picked(self):
        weeks = [{"weekNumber": 1}, {"weekNumber": 2}]
        assert pick_target_week(weeks, 1, 4) is None

    def test_weeks_since_last_deload(self):
        weeks = [{"weekNumber": 5, "deloadWeek": True}, {"weekNumber": 6}]
        assert weeks_since_last_deload(weeks, 8) == 3
        assert weeks_since_last_deload(weeks, 5) is None  # none BEFORE week 5


def _skeleton_plan(current_week=2, streak=0, status="active"):
    skeleton = normalize_skeleton(_skeleton(), 8, 2)
    weeks = build_plan_weeks_from_skeleton(skeleton, [1, 3], 8, horizon=2)
    return {
        "_id": ObjectId(),
        "userId": ObjectId(),
        "name": "Skeleton Plan",
        "status": status,
        "skeleton": skeleton,
        "weeks": weeks,
        "schedule": {"weeksTotal": 8, "workoutsPerWeek": 2, "preferredWorkoutDays": [1, 3]},
        "progress": {"currentWeek": current_week, "lowAdherenceStreak": streak},
    }


def _make_ctx(plan, events=None, memories=None):
    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    db.plans.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.users.find_one = AsyncMock(return_value={"profile": {"injuries": []}})

    find_result = MagicMock()
    find_result.to_list = AsyncMock(return_value=events or [])
    db.calendarevents.find = MagicMock(return_value=find_result)

    ctx = MagicMock()
    ctx.db = db
    ctx.memory_service.get_user_memories = AsyncMock(return_value=memories or [])
    return ctx


def _events(completed=5, missed=0, skipped=0):
    past = datetime(2020, 1, 1)
    evs = []
    evs += [{"type": "workout", "status": "completed", "date": past}] * completed
    evs += [{"type": "workout", "status": "scheduled", "date": past}] * missed
    evs += [{"type": "workout", "status": "skipped", "date": past}] * skipped
    return evs


class TestHandler:
    @pytest.mark.asyncio
    async def test_resolves_next_stub_week(self):
        plan = _skeleton_plan(current_week=2)
        ctx = _make_ctx(plan, events=_events(completed=5))
        result = await resolve_week(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        assert result["success"] is True and not result.get("noop")
        assert result["week_number"] == 3
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        week3 = next(w for w in update["weeks"] if w["weekNumber"] == 3)
        assert week3["resolved"] is True and week3["workouts"]

    @pytest.mark.asyncio
    async def test_legacy_plan_noops(self):
        plan = _skeleton_plan()
        plan.pop("skeleton")
        ctx = _make_ctx(plan)
        result = await resolve_week(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        assert result["success"] is True and result["noop"] is True
        ctx.db.plans.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_all_resolved_noops(self):
        plan = _skeleton_plan(current_week=1)  # weeks 1-2 already resolved
        ctx = _make_ctx(plan)
        result = await resolve_week(ctx, str(plan["userId"]),
                                    {"plan_id": str(plan["_id"]), "horizon": 2})
        assert result.get("noop") is True

    @pytest.mark.asyncio
    async def test_dry_run_writes_nothing(self):
        plan = _skeleton_plan(current_week=2)
        ctx = _make_ctx(plan, events=_events())
        result = await resolve_week(ctx, str(plan["userId"]),
                                    {"plan_id": str(plan["_id"]), "dry_run": True})
        assert result["dry_run"] is True
        ctx.db.plans.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_low_adherence_reduces_volume_with_note(self):
        plan = _skeleton_plan(current_week=2)
        ctx = _make_ctx(plan, events=_events(completed=1, missed=4))
        result = await resolve_week(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        assert result["success"] is True
        assert result["adaptation_note"]
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        assert update["progress.lowAdherenceStreak"] == 1  # streak increments
        # reduced volume: week 3 intent is 1.0, adapted 0.9 -> fewer sets than
        # the same week resolved at full volume
        week3 = next(w for w in update["weeks"] if w["weekNumber"] == 3)
        full = _skeleton_plan()  # reference at intent volume
        from app.core.agents.skills.plan_builder import materialize_week
        ref = materialize_week(full["skeleton"], 3, [1, 3])
        sets_adapted = sum(len(e["sets"]) for w in week3["workouts"]
                           for e in w["customWorkout"]["exercises"])
        sets_ref = sum(len(e["sets"]) for w in ref["workouts"]
                       for e in w["customWorkout"]["exercises"])
        assert sets_adapted <= sets_ref

    @pytest.mark.asyncio
    async def test_second_low_week_converts_to_deload(self):
        plan = _skeleton_plan(current_week=2, streak=1)  # already one low week
        ctx = _make_ctx(plan, events=_events(completed=1, missed=4))
        result = await resolve_week(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        assert result["converted_to_deload"] is True
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        week3 = next(w for w in update["weeks"] if w["weekNumber"] == 3)
        assert week3["deloadWeek"] is True
        assert update["progress.lowAdherenceStreak"] == 0  # reset after deload

    @pytest.mark.asyncio
    async def test_good_adherence_resets_streak(self):
        plan = _skeleton_plan(current_week=2, streak=1)
        ctx = _make_ctx(plan, events=_events(completed=10, missed=0))
        await resolve_week(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        update = ctx.db.plans.update_one.call_args.args[1]["$set"]
        assert update["progress.lowAdherenceStreak"] == 0

    @pytest.mark.asyncio
    async def test_missing_plan_errors(self):
        ctx = _make_ctx(None)
        result = await resolve_week(ctx, str(ObjectId()), {"plan_id": str(ObjectId())})
        assert result["success"] is False
