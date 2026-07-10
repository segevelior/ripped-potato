"""Tests for movement inference, substitute_exercise, and suggest_exercises."""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.knowledge.movement import infer_movement_pattern
from app.core.agents.skills.substitute_exercise_skill import (
    equipment_ok,
    score_substitute,
    substitute_exercise,
)
from app.core.agents.skills.suggest_exercises_skill import select_exercises, suggest_exercises


# ---------------------------- movement ----------------------------

class TestMovementInference:
    @pytest.mark.parametrize("name,expected", [
        ("Barbell Bench Press", "push"),
        ("Pull-up", "pull"),
        ("Back Squat", "squat"),
        ("Romanian Deadlift", "hinge"),
        ("Farmer Carry", "carry"),
        ("Plank", "core"),
        ("Treadmill Run", "cardio"),
    ])
    def test_by_name(self, name, expected):
        assert infer_movement_pattern({"name": name}) == expected

    def test_fallback_to_muscle(self):
        assert infer_movement_pattern({"name": "Mystery Move", "muscles": ["chest"]}) == "push"

    def test_unknown(self):
        assert infer_movement_pattern({"name": "Zzz", "muscles": []}) is None


# ---------------------------- substitute helpers ----------------------------

class TestEquipmentOk:
    def test_bodyweight_always_ok(self):
        assert equipment_ok([], {"barbell"}) is True
        assert equipment_ok(["bodyweight"], set()) is True

    def test_requires_all_available(self):
        assert equipment_ok(["barbell"], {"barbell", "bench"}) is True
        assert equipment_ok(["barbell", "cable"], {"barbell"}) is False


class TestScoreSubstitute:
    def test_same_pattern_and_muscle_scores_high(self):
        original = {"name": "Barbell Bench Press", "muscles": ["chest"], "strain": {"intensity": "high", "load": "heavy"}}
        near = {"name": "Dumbbell Bench Press", "muscles": ["chest"], "strain": {"intensity": "high", "load": "heavy"}}
        far = {"name": "Back Squat", "muscles": ["quads"], "strain": {"intensity": "high", "load": "heavy"}}
        assert score_substitute(original, near) > score_substitute(original, far)

    def test_muscle_overlap_contributes(self):
        original = {"name": "Row", "muscles": ["back", "biceps"]}
        c = {"name": "Chin-up", "muscles": ["back", "biceps"]}
        assert score_substitute(original, c) > 0


# ---------------------------- substitute handler ----------------------------

def _make_ctx(original=None, candidates=None, profile_equipment=None):
    db = MagicMock()
    db.exercises.find_one = AsyncMock(return_value=original)
    find_result = MagicMock()
    find_result.to_list = AsyncMock(return_value=candidates or [])
    db.exercises.find = MagicMock(return_value=find_result)
    db.users.find_one = AsyncMock(
        return_value={"profile": {"preferences": {"equipment": profile_equipment or []}}}
    )
    ctx = MagicMock()
    ctx.db = db
    ctx.memory_service.get_user_memories = AsyncMock(return_value=[])
    return ctx


class TestSubstituteHandler:
    @pytest.mark.asyncio
    async def test_pain_reason_routes_to_safety(self):
        ctx = _make_ctx()
        result = await substitute_exercise(ctx, str(ObjectId()), {"exercise_name": "Bench Press", "reason": "shoulder pain"})
        assert result["routed"] == "safety"
        ctx.db.exercises.find_one.assert_not_called()  # never even loads the exercise

    @pytest.mark.asyncio
    async def test_finds_best_substitute(self):
        original = {"_id": ObjectId(), "name": "Barbell Bench Press", "muscles": ["chest"],
                    "equipment": ["barbell"], "strain": {"intensity": "high", "load": "heavy"}}
        good = {"_id": ObjectId(), "name": "Push-up", "muscles": ["chest"], "equipment": [],
                "strain": {"intensity": "moderate", "load": "bodyweight"}}
        needs_gear = {"_id": ObjectId(), "name": "Cable Fly", "muscles": ["chest"], "equipment": ["cable"]}
        ctx = _make_ctx(original=original, candidates=[good, needs_gear], profile_equipment=[])
        result = await substitute_exercise(ctx, str(ObjectId()), {"exercise_id": str(original["_id"])})
        assert result["success"] is True
        assert result["substitute"]["name"] == "Push-up"  # cable filtered out (no cable)

    @pytest.mark.asyncio
    async def test_unknown_exercise(self):
        ctx = _make_ctx(original=None)
        result = await substitute_exercise(ctx, str(ObjectId()), {"exercise_name": "Nope"})
        assert result["success"] is False


# ---------------------------- suggest ----------------------------

class TestSelectExercises:
    def _pool(self):
        return [
            {"_id": ObjectId(), "name": "Push-up", "muscles": ["chest"], "equipment": [], "difficulty": "beginner"},
            {"_id": ObjectId(), "name": "Bench Press", "muscles": ["chest"], "equipment": ["barbell"], "difficulty": "advanced"},
            {"_id": ObjectId(), "name": "Squat", "muscles": ["quads"], "equipment": [], "difficulty": "intermediate"},
        ]

    def test_equipment_filter_and_easiest_first(self):
        picked = select_exercises(self._pool(), {"bodyweight"}, None, [], 10)
        names = [e["name"] for e in picked]
        assert "Bench Press" not in names  # needs barbell
        assert names[0] == "Push-up"  # beginner ranked first

    def test_movement_pattern_filter(self):
        picked = select_exercises(self._pool(), {"barbell", "bodyweight"}, "push", [], 10)
        assert {e["name"] for e in picked} == {"Push-up", "Bench Press"}

    def test_flagged_terms_excluded(self):
        picked = select_exercises(self._pool(), {"bodyweight"}, None, ["chest"], 10)
        assert all("chest" not in (e.get("muscles") or []) for e in picked)


def _make_suggest_ctx(candidates, health_memories=None, profile_equipment=None):
    db = MagicMock()
    find_result = MagicMock()
    find_result.to_list = AsyncMock(return_value=candidates)
    db.exercises.find = MagicMock(return_value=find_result)
    db.users.find_one = AsyncMock(return_value={"profile": {"preferences": {"equipment": profile_equipment or []}}})
    ctx = MagicMock()
    ctx.db = db
    ctx.memory_service.get_user_memories = AsyncMock(return_value=health_memories or [])
    return ctx


class TestSuggestHandler:
    @pytest.mark.asyncio
    async def test_skill_goal_points_to_progression(self):
        ctx = _make_suggest_ctx([])
        result = await suggest_exercises(ctx, str(ObjectId()), {"skill": "pull-up"})
        assert result["is_skill"] is True
        ctx.db.exercises.find.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_filtered_exercises(self):
        pool = [
            {"_id": ObjectId(), "name": "Push-up", "muscles": ["chest"], "equipment": [], "difficulty": "beginner"},
            {"_id": ObjectId(), "name": "Cable Fly", "muscles": ["chest"], "equipment": ["cable"], "difficulty": "intermediate"},
        ]
        ctx = _make_suggest_ctx(pool, profile_equipment=[])
        result = await suggest_exercises(ctx, str(ObjectId()), {"muscle_group": "chest"})
        names = [e["name"] for e in result["exercises"]]
        assert names == ["Push-up"]  # cable filtered out
