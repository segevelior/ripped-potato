"""Tests for the generate_plan skill (pure builders + handler)."""

import json

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.generate_plan_skill import (
    build_plan_weeks,
    generate_plan,
    infer_category,
    pick_workout_days,
)


class TestPureHelpers:
    @pytest.mark.parametrize("text,expected", [
        ("get stronger and hit a squat PR", "strength"),
        ("run a 5k", "endurance"),
        ("first pull-up", "skill"),
        ("lose weight / fat loss", "weight"),
        ("just feel better, general fitness", "health"),
        ("something vague", "general"),
    ])
    def test_infer_category(self, text, expected):
        assert infer_category(text) == expected

    def test_pick_workout_days_prefers_user_days(self):
        assert pick_workout_days(3, [1, 3, 5]) == [1, 3, 5]

    def test_pick_workout_days_even_spread(self):
        days = pick_workout_days(3, None)
        assert len(days) == 3
        assert all(0 <= d <= 6 for d in days)

    def test_pick_workout_days_clamps(self):
        assert len(pick_workout_days(10, None)) == 7

    def test_build_plan_weeks_structure_and_deload(self):
        blueprints = [
            {"title": "A", "type": "strength", "durationMinutes": 45,
             "exercises": [{"exerciseName": "Squat", "sets": 5, "reps": 5}]},
        ]
        weeks = build_plan_weeks(blueprints, [1, 3, 5], 8)
        assert len(weeks) == 8
        # 3 workouts/week on the chosen days
        assert [w["dayOfWeek"] for w in weeks[0]["workouts"]] == [1, 3, 5]
        # off-days are NOT materialized as rest events (avoid calendar flood)
        assert weeks[0]["restDays"] == []
        # week 6 is a deload for an 8-week plan (every 6 weeks) -> reduced volume
        deload_week = weeks[5]
        assert deload_week["deloadWeek"] is True
        deload_sets = len(deload_week["workouts"][0]["customWorkout"]["exercises"][0]["sets"])
        normal_sets = len(weeks[0]["workouts"][0]["customWorkout"]["exercises"][0]["sets"])
        assert deload_sets < normal_sets


def _llm_response(workouts):
    msg = MagicMock()
    msg.content = json.dumps({"workouts": workouts})
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _make_ctx(profile=None, goal=None, create_ok=True, missing=None, workouts=None):
    profile = profile if profile is not None else {"fitnessLevel": "intermediate", "preferences": {"equipment": ["barbell"], "workoutDays": [1, 3, 5]}}
    workouts = workouts or [
        {"title": "Full Body A", "type": "strength", "durationMinutes": 45,
         "exercises": [{"exerciseName": "Squat", "sets": 4, "reps": 6},
                       {"exerciseName": "Bench Press", "sets": 4, "reps": 6},
                       {"exerciseName": "Row", "sets": 3, "reps": 10}]},
    ]

    db = MagicMock()
    db.users.find_one = AsyncMock(return_value={"profile": profile})
    db.goals.find_one = AsyncMock(return_value=goal)

    ctx = MagicMock()
    ctx.db = db
    ctx.settings.openai_model = "gpt-test"
    ctx.openai_client.chat.completions.create = AsyncMock(return_value=_llm_response(workouts))
    ctx.memory_service.get_user_memories = AsyncMock(return_value=[])
    ctx.exercise_service.grep_exercises = AsyncMock(return_value={"missing": missing or []})
    ctx.plan_service.create_plan = AsyncMock(
        return_value={"success": create_ok, "plan_id": str(ObjectId()) if create_ok else None,
                      "message": "" if create_ok else "fail"}
    )
    return ctx


class TestHandler:
    @pytest.mark.asyncio
    async def test_generates_and_persists_draft(self):
        ctx = _make_ctx()
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger", "weeks": 8})
        assert result["success"] is True
        assert result["dry_run"] is True
        assert result["plan_id"]
        assert result["weeks"] == 8
        # a draft plan was written via create_plan
        ctx.plan_service.create_plan.assert_awaited_once()
        create_args = ctx.plan_service.create_plan.call_args.args[1]
        assert create_args["schedule"]["weeksTotal"] == 8
        assert "draft" in create_args["tags"]

    @pytest.mark.asyncio
    async def test_missing_goal_asks(self):
        ctx = _make_ctx()
        result = await generate_plan(ctx, str(ObjectId()), {})
        assert result.get("needs_input") == "goal"
        ctx.plan_service.create_plan.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_linked_goal_category(self):
        ctx = _make_ctx(goal={"name": "Run 10k", "category": "endurance"})
        result = await generate_plan(ctx, str(ObjectId()), {"goal_id": str(ObjectId()), "weeks": 6})
        # strength-only blueprints on an endurance goal -> validation suggests aerobic
        assert any("aerobic" in s.lower() or "cardio" in s.lower() for s in result["validation"]["suggestions"])

    @pytest.mark.asyncio
    async def test_unverified_exercise_names_reported(self):
        ctx = _make_ctx(missing=["Bench Press"])
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert "Bench Press" in result["unverified_exercises"]

    @pytest.mark.asyncio
    async def test_create_failure_surfaced(self):
        ctx = _make_ctx(create_ok=False)
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert result["success"] is False
