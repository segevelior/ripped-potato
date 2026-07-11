"""Tests for the generate_plan skill (skeleton-based generation + handler)."""

import json

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.generate_plan_skill import (
    generate_plan,
    infer_category,
    pick_workout_days,
)
from app.core.agents.skills.plan_builder import DEFAULT_HORIZON_WEEKS


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


def _sample_skeleton(weeks=8):
    return {
        "phases": [
            {"name": "Base", "startWeek": 1, "endWeek": weeks // 2,
             "focus": "base", "progression": "volume",
             "disciplines": [{"discipline": "strength", "sessionsPerWeek": 3}],
             "sessionBlueprints": [
                 {"title": "Full Body A", "type": "strength", "durationMinutes": 45, "dayHint": 1,
                  "exercises": [{"exerciseName": "Squat", "sets": 4, "reps": 6},
                                {"exerciseName": "Bench Press", "sets": 4, "reps": 6}]},
                 {"title": "Full Body B", "type": "strength", "durationMinutes": 45, "dayHint": 3,
                  "exercises": [{"exerciseName": "Row", "sets": 3, "reps": 10}]},
                 {"title": "Full Body C", "type": "strength", "durationMinutes": 45, "dayHint": 5,
                  "exercises": [{"exerciseName": "Deadlift", "sets": 3, "reps": 5}]},
             ]},
            {"name": "Build", "startWeek": weeks // 2 + 1, "endWeek": weeks,
             "focus": "intensity", "progression": "load",
             "disciplines": [{"discipline": "strength", "sessionsPerWeek": 3}],
             "sessionBlueprints": [
                 {"title": "Heavy A", "type": "strength", "durationMinutes": 45, "dayHint": 1,
                  "exercises": [{"exerciseName": "Squat", "sets": 5, "reps": 3}]},
                 {"title": "Heavy B", "type": "strength", "durationMinutes": 45, "dayHint": 3,
                  "exercises": [{"exerciseName": "Bench Press", "sets": 5, "reps": 3}]},
                 {"title": "Heavy C", "type": "strength", "durationMinutes": 45, "dayHint": 5,
                  "exercises": [{"exerciseName": "Deadlift", "sets": 4, "reps": 3}]},
             ]},
        ],
        "weekIntents": [{"weekNumber": w, "phase": "Base" if w <= weeks // 2 else "Build",
                         "focus": f"wk{w}", "deload": w == 6, "volumeMultiplier": 0.6 if w == 6 else 1.0}
                        for w in range(1, weeks + 1)],
        "deloadWeeks": [6],
        "milestones": [{"week": weeks // 2, "title": "Mid test", "criteria": "5RM check"}],
    }


def _llm_response(payload):
    msg = MagicMock()
    msg.content = json.dumps(payload)
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _make_ctx(profile=None, goal=None, create_ok=True, missing=None, skeleton=None,
              planner_model=None, existing_draft=None):
    profile = profile if profile is not None else {
        "fitnessLevel": "intermediate",
        "preferences": {"equipment": ["barbell"], "workoutDays": [1, 3, 5]},
    }
    skeleton = skeleton if skeleton is not None else _sample_skeleton()

    db = MagicMock()
    db.users.find_one = AsyncMock(return_value={"profile": profile})
    db.goals.find_one = AsyncMock(return_value=goal)
    # Dedupe guard looks here for a reusable draft (None = none exists).
    db.plans.find_one = AsyncMock(return_value=existing_draft)

    ctx = MagicMock()
    ctx.db = db
    ctx.settings.openai_model = "gpt-test"
    # MagicMock auto-attrs are truthy — set explicitly or the fallback test rots.
    ctx.settings.openai_model_planner = planner_model
    ctx.openai_client.chat.completions.create = AsyncMock(
        return_value=_llm_response({"skeleton": skeleton})
    )
    ctx.memory_service.get_user_memories = AsyncMock(return_value=[])
    ctx.exercise_service.grep_exercises = AsyncMock(return_value={"missing": missing or []})
    ctx.plan_service.create_plan = AsyncMock(
        return_value={"success": create_ok, "plan_id": str(ObjectId()) if create_ok else None,
                      "message": "" if create_ok else "fail"}
    )
    ctx.plan_service.update_plan_content = AsyncMock(
        return_value={"success": True, "plan_id": str((existing_draft or {}).get("_id", ObjectId()))}
    )
    return ctx


class TestHandler:
    @pytest.mark.asyncio
    async def test_generates_and_persists_skeleton_draft(self):
        ctx = _make_ctx()
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger", "weeks": 8})
        assert result["success"] is True
        assert result["dry_run"] is True
        assert result["plan_id"]
        assert result["weeks"] == 8
        expected_resolved = min(DEFAULT_HORIZON_WEEKS, 8)
        assert result["resolved_weeks"] == expected_resolved

        ctx.plan_service.create_plan.assert_awaited_once()
        create_args = ctx.plan_service.create_plan.call_args.args[1]
        assert create_args["schedule"]["weeksTotal"] == 8
        assert "draft" in create_args["tags"]
        # skeleton persisted alongside the weeks
        assert create_args["skeleton"]["phases"]
        # rolling horizon: weeks within the horizon materialized, the rest stubs
        weeks = create_args["weeks"]
        assert len(weeks) == 8
        assert weeks[0]["resolved"] is True and weeks[0]["workouts"]
        for w in weeks[:expected_resolved]:
            assert w["resolved"] is True and w["workouts"]
        for w in weeks[expected_resolved:]:
            assert w["resolved"] is False and not w["workouts"]

    @pytest.mark.asyncio
    async def test_planner_model_override_used(self):
        ctx = _make_ctx(planner_model="gpt-strong")
        await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert ctx.openai_client.chat.completions.create.call_args.kwargs["model"] == "gpt-strong"

    @pytest.mark.asyncio
    async def test_planner_model_falls_back_to_chat_model(self):
        ctx = _make_ctx(planner_model=None)
        await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert ctx.openai_client.chat.completions.create.call_args.kwargs["model"] == "gpt-test"

    @pytest.mark.asyncio
    async def test_missing_goal_asks(self):
        ctx = _make_ctx()
        result = await generate_plan(ctx, str(ObjectId()), {})
        assert result.get("needs_input") == "goal"
        ctx.plan_service.create_plan.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_skeleton_surfaces_error(self):
        ctx = _make_ctx(skeleton={})
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert result["success"] is False
        ctx.plan_service.create_plan.assert_not_called()

    @pytest.mark.asyncio
    async def test_prose_reps_from_model_coerced_to_ints(self):
        skeleton = _sample_skeleton()
        skeleton["phases"][0]["sessionBlueprints"][0]["exercises"][0]["reps"] = \
            "8 min at half marathon pace"
        ctx = _make_ctx(skeleton=skeleton)
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "run a half marathon"})
        assert result["success"] is True
        weeks = ctx.plan_service.create_plan.call_args.args[1]["weeks"]
        ex = weeks[0]["workouts"][0]["customWorkout"]["exercises"][0]
        assert all(isinstance(s.get("reps"), int) for s in ex["sets"])
        assert "half marathon pace" in ex.get("notes", "")

    @pytest.mark.asyncio
    async def test_unverified_exercise_names_reported(self):
        ctx = _make_ctx(missing=["Bench Press"])
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert "Bench Press" in result["unverified_exercises"]

    @pytest.mark.asyncio
    async def test_endurance_goal_without_aerobic_blueprints_flagged(self):
        ctx = _make_ctx(goal={"name": "Run 10k", "category": "endurance"})
        result = await generate_plan(ctx, str(ObjectId()), {"goal_id": str(ObjectId()), "weeks": 6})
        suggestions = (result["validation"]["suggestions"]
                       + result["skeleton_validation"]["suggestions"])
        assert any("aerobic" in s.lower() or "cardio" in s.lower() for s in suggestions)

    @pytest.mark.asyncio
    async def test_create_failure_surfaced(self):
        ctx = _make_ctx(create_ok=False)
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert result["success"] is False

    @pytest.mark.asyncio
    async def test_returns_layered_overview(self):
        ctx = _make_ctx()
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger", "weeks": 8})
        ov = result["overview"]
        assert [p["name"] for p in ov["phases"]] == ["Base", "Build"]
        assert len(ov["weeks"]) == 8
        assert ov["weeks"][0]["workoutTitles"]  # real content, not just counts

    @pytest.mark.asyncio
    async def test_dedupes_into_existing_draft(self):
        existing = {"_id": ObjectId(), "status": "draft", "tags": ["ai-generated", "draft"],
                    "description": "AI-generated draft for: get stronger"}
        ctx = _make_ctx(existing_draft=existing)
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger", "weeks": 8})
        assert result["success"] is True
        assert result["reused_existing_draft"] is True
        assert result["plan_id"] == str(existing["_id"])
        ctx.plan_service.update_plan_content.assert_awaited_once()
        ctx.plan_service.create_plan.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_existing_draft_creates_new(self):
        ctx = _make_ctx(existing_draft=None)
        result = await generate_plan(ctx, str(ObjectId()), {"goal_text": "get stronger"})
        assert result["reused_existing_draft"] is False
        ctx.plan_service.create_plan.assert_awaited_once()
        ctx.plan_service.update_plan_content.assert_not_called()
