"""Tests for review_progress, reschedule_session, adjust_plan."""

from datetime import datetime, timedelta

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.review_progress_skill import compute_adherence, review_progress
from app.core.agents.skills.reschedule_session_skill import resolve_reschedule, reschedule_session
from app.core.agents.skills.adjust_plan_skill import apply_adjustment, adjust_plan

TODAY = datetime(2026, 7, 10)


# ------------------------- review_progress -------------------------

class TestComputeAdherence:
    def test_counts_and_pct(self):
        events = [
            {"type": "workout", "status": "completed", "date": TODAY - timedelta(days=5)},
            {"type": "workout", "status": "completed", "date": TODAY - timedelta(days=3)},
            {"type": "workout", "status": "skipped", "date": TODAY - timedelta(days=2)},
            {"type": "workout", "status": "scheduled", "date": TODAY - timedelta(days=1)},  # missed
            {"type": "workout", "status": "scheduled", "date": TODAY + timedelta(days=1)},  # upcoming
            {"type": "rest", "status": "scheduled", "date": TODAY - timedelta(days=1)},     # ignored
        ]
        a = compute_adherence(events, TODAY)
        assert (a["completed"], a["skipped"], a["missed"], a["upcoming"]) == (2, 1, 1, 1)
        assert a["adherencePct"] == 50  # 2 / (2+1+1)

    def test_no_due_sessions(self):
        a = compute_adherence([{"type": "workout", "status": "scheduled", "date": TODAY + timedelta(days=2)}], TODAY)
        assert a["adherencePct"] is None

    @pytest.mark.asyncio
    async def test_handler(self):
        events = [{"type": "workout", "status": "completed", "date": TODAY - timedelta(days=1)}]
        db = MagicMock()
        fr = MagicMock(); fr.to_list = AsyncMock(return_value=events)
        db.calendarevents.find = MagicMock(return_value=fr)
        db.goals.find_one = AsyncMock(return_value=None)
        ctx = MagicMock(); ctx.db = db
        result = await review_progress(ctx, str(ObjectId()), {"window_days": 14})
        assert result["success"] is True
        assert result["adherencePct"] == 100


# ------------------------- reschedule_session -------------------------

class TestResolveReschedule:
    def test_skip(self):
        assert resolve_reschedule(TODAY, "skip", None, TODAY)["op"] == "skip"

    def test_shift_defaults_to_tomorrow(self):
        r = resolve_reschedule(TODAY, "shift", None, TODAY)
        assert r["op"] == "shift" and r["to_date"] == TODAY + timedelta(days=1)

    def test_auto_missed_shifts(self):
        r = resolve_reschedule(TODAY - timedelta(days=2), "auto", None, TODAY)
        assert r["op"] == "shift"

    def test_auto_future_skips(self):
        r = resolve_reschedule(TODAY + timedelta(days=2), "auto", None, TODAY)
        assert r["op"] == "skip"


def _resched_ctx(event):
    db = MagicMock()
    db.calendarevents.find_one = AsyncMock(return_value=event)
    db.calendarevents.update_one = AsyncMock()
    ctx = MagicMock(); ctx.db = db
    return ctx


class TestRescheduleHandler:
    @pytest.mark.asyncio
    async def test_dry_run_no_write(self):
        ev = {"_id": ObjectId(), "userId": ObjectId(), "title": "Legs", "date": datetime(2026, 7, 5)}
        ctx = _resched_ctx(ev)
        r = await reschedule_session(ctx, str(ev["userId"]), {"event_id": str(ev["_id"]), "action": "skip"})
        assert r["dry_run"] is True
        ctx.db.calendarevents.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_confirmed_skip_writes(self):
        ev = {"_id": ObjectId(), "userId": ObjectId(), "title": "Legs", "date": datetime(2026, 7, 5)}
        ctx = _resched_ctx(ev)
        r = await reschedule_session(ctx, str(ev["userId"]), {"event_id": str(ev["_id"]), "action": "skip", "dry_run": False})
        assert r["op"] == "skip"
        set_doc = ctx.db.calendarevents.update_one.call_args.args[1]["$set"]
        assert set_doc["status"] == "skipped"

    @pytest.mark.asyncio
    async def test_unknown_event(self):
        ctx = _resched_ctx(None)
        r = await reschedule_session(ctx, str(ObjectId()), {"event_id": str(ObjectId())})
        assert r["success"] is False


# ------------------------- adjust_plan -------------------------

def _plan_weeks():
    def wk(n):
        return {"weekNumber": n, "restDays": [0, 6], "workouts": [
            {"dayOfWeek": 1, "workoutType": "custom", "customWorkout": {"type": "strength", "exercises": [
                {"exerciseName": "Squat", "sets": [{"reps": 5}, {"reps": 5}, {"reps": 5}]}]}},
            {"dayOfWeek": 3, "workoutType": "custom", "customWorkout": {"type": "strength", "exercises": [
                {"exerciseName": "Bench", "sets": [{"reps": 5}, {"reps": 5}, {"reps": 5}]}]}},
        ]}
    return [wk(1), wk(2)]


class TestApplyAdjustment:
    def test_volume_increase(self):
        weeks, desc = apply_adjustment(_plan_weeks(), "volume", "increase", 1)
        sets = weeks[0]["workouts"][0]["customWorkout"]["exercises"][0]["sets"]
        assert len(sets) == 4
        assert "increase" in desc

    def test_volume_decrease_keeps_at_least_one(self):
        weeks, _ = apply_adjustment(_plan_weeks(), "volume", "decrease", 10)
        sets = weeks[0]["workouts"][0]["customWorkout"]["exercises"][0]["sets"]
        assert len(sets) == 1

    def test_deload_marks_first_week(self):
        weeks, desc = apply_adjustment(_plan_weeks(), "deload", "", 1)
        assert weeks[0]["deloadWeek"] is True
        assert "deload" in desc

    def test_frequency_decrease(self):
        weeks, _ = apply_adjustment(_plan_weeks(), "frequency", "decrease", 1)
        assert len(weeks[0]["workouts"]) == 1

    def test_original_not_mutated(self):
        original = _plan_weeks()
        apply_adjustment(original, "volume", "increase", 5)
        assert len(original[0]["workouts"][0]["customWorkout"]["exercises"][0]["sets"]) == 3


def _adjust_ctx(plan):
    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    db.plans.update_one = AsyncMock()
    db.goals.find_one = AsyncMock(return_value=None)
    ctx = MagicMock(); ctx.db = db
    return ctx


class TestAdjustHandler:
    @pytest.mark.asyncio
    async def test_big_volume_jump_requires_override(self):
        plan = {"_id": ObjectId(), "userId": ObjectId(), "schedule": {"weeksTotal": 2}, "weeks": _plan_weeks()}
        ctx = _adjust_ctx(plan)
        r = await adjust_plan(ctx, str(plan["userId"]),
                              {"plan_id": str(plan["_id"]), "change_type": "volume", "direction": "increase",
                               "magnitude": 5, "dry_run": False})
        assert r.get("needs_confirmation") == "override"
        ctx.db.plans.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_override_applies_write(self):
        plan = {"_id": ObjectId(), "userId": ObjectId(), "schedule": {"weeksTotal": 2}, "weeks": _plan_weeks()}
        ctx = _adjust_ctx(plan)
        r = await adjust_plan(ctx, str(plan["userId"]),
                              {"plan_id": str(plan["_id"]), "change_type": "volume", "direction": "increase",
                               "magnitude": 5, "override": True, "dry_run": False})
        assert r["success"] is True and r["dry_run"] is False
        ctx.db.plans.update_one.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_dry_run_no_write(self):
        plan = {"_id": ObjectId(), "userId": ObjectId(), "schedule": {"weeksTotal": 2}, "weeks": _plan_weeks()}
        ctx = _adjust_ctx(plan)
        r = await adjust_plan(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"]), "change_type": "deload"})
        assert r["dry_run"] is True
        ctx.db.plans.update_one.assert_not_called()
