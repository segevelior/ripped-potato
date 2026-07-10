"""Tests for the validate_plan skill (pure validator + handler)."""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.validate_plan_skill import validate_plan, validate_plan_doc


def _custom_workout(day, wtype="strength", n_ex=4, sets_per=3):
    return {
        "dayOfWeek": day,
        "workoutType": "custom",
        "customWorkout": {
            "title": f"{wtype} day",
            "type": wtype,
            "exercises": [
                {"exerciseName": f"ex{i}", "sets": [{"reps": 8}] * sets_per}
                for i in range(n_ex)
            ],
        },
    }


def _good_strength_plan():
    # 4 weeks, 3 sessions/wk, ~12 sets/wk, rest days, a deload marked.
    weeks = []
    for wn in range(1, 5):
        weeks.append({
            "weekNumber": wn,
            "deloadWeek": wn == 4,
            "restDays": [0, 6],
            "workouts": [_custom_workout(1), _custom_workout(3), _custom_workout(5)],
        })
    return {"schedule": {"weeksTotal": 4}, "weeks": weeks}


class TestValidatePlanDoc:
    def test_valid_strength_plan(self):
        report = validate_plan_doc(_good_strength_plan(), "strength")
        assert report["valid"] is True
        assert report["violations"] == []
        assert report["metrics"]["avg_sessions_per_week"] == 3.0

    def test_empty_plan_invalid(self):
        report = validate_plan_doc({"schedule": {"weeksTotal": 4}, "weeks": []}, "strength")
        assert report["valid"] is False
        assert any("no workouts" in v.lower() for v in report["violations"])

    def test_underdosed_frequency_and_volume(self):
        weeks = [{"weekNumber": 1, "restDays": [0], "workouts": [_custom_workout(1, n_ex=1, sets_per=1)]}]
        report = validate_plan_doc({"schedule": {"weeksTotal": 1}, "weeks": weeks}, "strength")
        assert report["valid"] is False
        assert any("sessions/week" in v for v in report["violations"])
        assert any("working sets" in v for v in report["violations"])

    def test_aggressive_ramp_flagged(self):
        weeks = [
            {"weekNumber": 1, "restDays": [0], "workouts": [_custom_workout(1, n_ex=2, sets_per=3)]},
            {"weekNumber": 2, "restDays": [0], "workouts": [_custom_workout(1, n_ex=10, sets_per=5)]},
        ]
        report = validate_plan_doc({"schedule": {"weeksTotal": 2}, "weeks": weeks}, "strength")
        assert any("jumps" in v for v in report["violations"])

    def test_long_plan_without_deload_suggested(self):
        weeks = [
            {"weekNumber": wn, "deloadWeek": False, "restDays": [0, 6],
             "workouts": [_custom_workout(1), _custom_workout(3), _custom_workout(5)]}
            for wn in range(1, 9)
        ]
        report = validate_plan_doc({"schedule": {"weeksTotal": 8}, "weeks": weeks}, "strength")
        assert any("deload" in s.lower() for s in report["suggestions"])

    def test_endurance_goal_without_cardio_suggests_aerobic(self):
        report = validate_plan_doc(_good_strength_plan(), "endurance")
        assert any("aerobic" in s.lower() or "cardio" in s.lower() for s in report["suggestions"])


def _make_ctx(plan, goal=None):
    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    db.goals.find_one = AsyncMock(return_value=goal)
    ctx = MagicMock()
    ctx.db = db
    return ctx


class TestHandler:
    @pytest.mark.asyncio
    async def test_valid_plan_handler(self):
        plan = _good_strength_plan()
        plan["_id"] = ObjectId()
        plan["userId"] = ObjectId()
        ctx = _make_ctx(plan)
        result = await validate_plan(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        assert result["success"] is True
        assert result["valid"] is True

    @pytest.mark.asyncio
    async def test_unknown_plan(self):
        ctx = _make_ctx(plan=None)
        result = await validate_plan(ctx, str(ObjectId()), {"plan_id": str(ObjectId())})
        assert result["success"] is False
        assert "not found" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_goal_category_from_linked_goal(self):
        plan = _good_strength_plan()
        plan["_id"] = ObjectId()
        plan["userId"] = ObjectId()
        plan["goalId"] = ObjectId()
        ctx = _make_ctx(plan, goal={"category": "endurance"})
        result = await validate_plan(ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])})
        # endurance goal on a strength-only plan -> aerobic suggestion present
        assert any("aerobic" in s.lower() or "cardio" in s.lower() for s in result["suggestions"])
