"""Tests for the show_plan skill (read-only layered plan view)."""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.show_plan_skill import show_plan


def _plan():
    return {
        "_id": ObjectId(),
        "userId": ObjectId(),
        "name": "Beginner 10K Plan",
        "status": "draft",
        "schedule": {"weeksTotal": 8, "workoutsPerWeek": 3},
        "skeleton": {
            "phases": [{"name": "Base", "startWeek": 1, "endWeek": 8, "focus": "aerobic", "progression": "ramp"}],
            "milestones": [{"week": 8, "title": "10K", "criteria": "run 10k"}],
        },
        "weeks": [
            {"weekNumber": 1, "focus": "easy", "deloadWeek": False, "resolved": True,
             "workouts": [{"dayOfWeek": 0, "customWorkout": {
                 "title": "Easy Run", "type": "cardio", "durationMinutes": 40,
                 "exercises": [{"exerciseName": "Easy Run", "sets": [{"reps": 1, "time": 1800}], "notes": "zone2"}]}}]},
            {"weekNumber": 2, "focus": "build", "deloadWeek": False, "resolved": False, "workouts": []},
        ],
    }


def _ctx(plan):
    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    ctx = MagicMock()
    ctx.db = db
    return ctx


class TestShowPlan:
    @pytest.mark.asyncio
    async def test_overview_returns_phases(self):
        plan = _plan()
        ctx = _ctx(plan)
        res = await show_plan(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"]), "level": "overview"})
        assert res["success"] is True
        assert res["name"] == "Beginner 10K Plan"
        assert res["overview"]["phases"][0]["name"] == "Base"
        assert "weeks" not in res["overview"]

    @pytest.mark.asyncio
    async def test_weeks_level_lists_summaries(self):
        plan = _plan()
        res = await show_plan(_ctx(plan), str(plan["userId"]), {"level": "weeks"})
        assert len(res["overview"]["weeks"]) == 2
        assert res["overview"]["weeks"][0]["workoutTitles"] == ["Easy Run"]

    @pytest.mark.asyncio
    async def test_week_level_drills_to_exercises(self):
        plan = _plan()
        res = await show_plan(_ctx(plan), str(plan["userId"]), {"level": "week", "week_number": 1})
        wk = res["overview"]["week"]
        assert wk["workouts"][0]["exercises"][0]["exerciseName"] == "Easy Run"
        assert wk["workouts"][0]["exercises"][0]["timeSeconds"] == 1800

    @pytest.mark.asyncio
    async def test_workout_level_filters_by_day(self):
        plan = _plan()
        res = await show_plan(_ctx(plan), str(plan["userId"]),
                              {"level": "workout", "week_number": 1, "day_of_week": 0})
        assert len(res["overview"]["week"]["workouts"]) == 1
        assert res["overview"]["week"]["workouts"][0]["dayOfWeek"] == 0

    @pytest.mark.asyncio
    async def test_default_plan_used_when_no_id(self):
        plan = _plan()
        ctx = _ctx(plan)
        await show_plan(ctx, str(plan["userId"]), {})
        # queried for the user's most-recent non-completed plan
        assert ctx.db.plans.find_one.await_args.args[0]["status"]["$in"] == ["draft", "active", "paused"]

    @pytest.mark.asyncio
    async def test_no_plan_found_offers_to_build(self):
        res = await show_plan(_ctx(None), str(ObjectId()), {})
        assert res["success"] is True
        assert res.get("not_found") is True
