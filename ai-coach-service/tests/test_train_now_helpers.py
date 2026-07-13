"""Tests for train-now plan loading (schema-correct query + week formatting)."""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.api.v1.train_now import format_plan_week, load_training_plans


def _plan(status="active", current_week=1, resolved=True, workouts=True):
    week = {
        "weekNumber": current_week,
        "focus": "Base",
        "workouts": [
            {"dayOfWeek": 1, "workoutType": "custom",
             "customWorkout": {"title": "Tempo Run", "type": "cardio",
                               "exercises": [{"exerciseName": "Tempo Run", "sets": [{"reps": 1}]}]}},
            {"dayOfWeek": 3, "workoutType": "custom",
             "customWorkout": {"title": "Pull Strength", "type": "strength",
                               "exercises": [{"exerciseName": "Pull-up", "sets": [{"reps": 6}] * 4}]}},
        ] if workouts else [],
    }
    if resolved is not None:
        week["resolved"] = resolved
    return {
        "_id": ObjectId(),
        "name": "Hybrid Plan",
        "description": "Half marathon + muscle-up",
        "status": status,
        "weeks": [week],
        "progress": {"currentWeek": current_week},
        "schedule": {"weeksTotal": 12, "workoutsPerWeek": 5},
    }


class TestFormatPlanWeek:
    def test_renders_current_week_sessions(self):
        out = format_plan_week(_plan())
        assert "Week 1 (Base)" in out
        assert "Monday: Tempo Run (cardio, 1 exercises)" in out
        assert "Wednesday: Pull Strength (strength, 1 exercises)" in out

    def test_unresolved_week_returns_none(self):
        assert format_plan_week(_plan(resolved=False, workouts=False)) is None

    def test_missing_week_returns_none(self):
        plan = _plan()
        plan["progress"]["currentWeek"] = 9
        assert format_plan_week(plan) is None

    def test_legacy_week_without_flag_renders(self):
        assert format_plan_week(_plan(resolved=None)) is not None


class TestLoadTrainingPlans:
    @pytest.mark.asyncio
    async def test_queries_status_not_isactive_and_maps_schema(self):
        plan = _plan()
        db = MagicMock()
        find_result = MagicMock()
        find_result.to_list = AsyncMock(return_value=[plan])
        db.plans.find = MagicMock(return_value=find_result)

        result = await load_training_plans(db, str(ObjectId()))

        query = db.plans.find.call_args.args[0]
        assert query["status"] == {"$in": ["active", "paused"]}
        assert "isActive" not in query

        assert len(result) == 1
        p = result[0]
        assert p["name"] == "Hybrid Plan"
        assert p["current_week"] == 1
        assert p["total_weeks"] == 12
        assert p["days_per_week"] == 5
        assert p["goal"] == "Half marathon + muscle-up"
        assert "Tempo Run" in p["current_week_detail"]

    @pytest.mark.asyncio
    async def test_error_returns_empty(self):
        db = MagicMock()
        db.plans.find = MagicMock(side_effect=RuntimeError("boom"))
        assert await load_training_plans(db, str(ObjectId())) == []


class TestFormatCalendarForLLM:
    """TOR-19: the generator must see actual exercises done, yesterday's
    outcome (incl. missed), not just event titles."""

    def _calendar(self, **overrides):
        from datetime import datetime
        data = {
            "today_events": [],
            "week_events": [],
            "recent_workouts": [],
            "yesterday_events": [],
            "today_date": "2026-07-13",
            "day_of_week": "Monday",
        }
        data.update(overrides)
        return data

    def test_recent_workouts_include_exercise_names(self):
        from datetime import datetime
        from app.api.v1.train_now import format_calendar_for_llm
        out = format_calendar_for_llm(self._calendar(recent_workouts=[{
            "date": datetime(2026, 7, 11),
            "title": "Push Day",
            "workoutDetails": {
                "type": "strength",
                "exercises": [
                    {"exerciseName": "Bench Press"},
                    {"exerciseName": "Overhead Press"},
                ],
            },
        }]))
        assert "COMPLETED WORKOUTS (last 14 days" in out
        assert "Push Day (strength)" in out
        assert "Exercises: Bench Press, Overhead Press" in out

    def test_recent_workout_exercise_names_capped_at_ten(self):
        from datetime import datetime
        from app.api.v1.train_now import format_calendar_for_llm
        out = format_calendar_for_llm(self._calendar(recent_workouts=[{
            "date": datetime(2026, 7, 11),
            "title": "Mega Day",
            "workoutDetails": {
                "type": "strength",
                "exercises": [{"exerciseName": f"Move {i}"} for i in range(15)],
            },
        }]))
        assert "Move 9" in out
        assert "Move 10" not in out
        assert "…" in out

    def test_yesterday_missed_workout_labelled(self):
        from datetime import datetime
        from app.api.v1.train_now import format_calendar_for_llm
        out = format_calendar_for_llm(self._calendar(yesterday_events=[
            {"date": datetime(2026, 7, 12), "title": "Endurance 1", "status": "scheduled"},
            {"date": datetime(2026, 7, 12), "title": "Core Blast", "status": "completed"},
        ]))
        assert "YESTERDAY:" in out
        assert "Endurance 1 (MISSED (was scheduled, never completed))" in out
        assert "Core Blast (completed)" in out

    def test_no_yesterday_section_when_empty(self):
        from app.api.v1.train_now import format_calendar_for_llm
        out = format_calendar_for_llm(self._calendar())
        assert "YESTERDAY:" not in out
        assert "NO WORKOUT SCHEDULED FOR TODAY" in out
