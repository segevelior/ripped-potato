"""
Tests for the schedule_plan_to_calendar skill.

Covers the pure date/expansion helpers and the handler (dry-run vs write,
dedup, plan activation, error paths) with a mocked SkillContext.
"""
from datetime import datetime

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.skills.schedule_plan_skill import (
    _build_events,
    _compute_event_date,
    _parse_start_date,
    _parse_volume,
    _resolve_workout_content,
    schedule_plan_to_calendar,
)

NOW = datetime(2026, 1, 1)
SUNDAY = datetime(2026, 7, 12)  # a Sunday


# --------------------------- pure helpers ---------------------------

class TestComputeEventDate:
    def test_sunday_anchor_every_other_day(self):
        # The real failing case: start Sunday Jul 12, days 0/2/4/6.
        assert _compute_event_date(SUNDAY, 1, 0) == datetime(2026, 7, 12)  # Sun
        assert _compute_event_date(SUNDAY, 1, 2) == datetime(2026, 7, 14)  # Tue
        assert _compute_event_date(SUNDAY, 1, 4) == datetime(2026, 7, 16)  # Thu
        assert _compute_event_date(SUNDAY, 1, 6) == datetime(2026, 7, 18)  # Sat

    def test_multi_week_offset(self):
        assert _compute_event_date(SUNDAY, 2, 0) == datetime(2026, 7, 19)
        assert _compute_event_date(SUNDAY, 8, 0) == datetime(2026, 8, 30)

    def test_midweek_start_never_before_start(self):
        wed = datetime(2026, 7, 15)  # Wednesday (dayOfWeek 3)
        # A Sunday (0) workout should land on the NEXT Sunday, not the prior one.
        d = _compute_event_date(wed, 1, 0)
        assert d >= wed
        assert d == datetime(2026, 7, 19)
        # Same-day (Wed=3) lands on the start date itself.
        assert _compute_event_date(wed, 1, 3) == wed


class TestParseVolume:
    @pytest.mark.parametrize("value,expected", [
        ("3x10", (3, 10)),
        ("3 x 8", (3, 8)),
        ("4X12", (4, 12)),
        ("3x8-12", (3, 8)),
        ("AMRAP", (3, 10)),
        (None, (3, 10)),
        ("", (3, 10)),
    ])
    def test_parse(self, value, expected):
        assert _parse_volume(value) == expected


class TestParseStartDate:
    def test_iso_and_ymd(self):
        assert _parse_start_date("2026-07-12") == datetime(2026, 7, 12)

    def test_datetime_passthrough_midnight(self):
        assert _parse_start_date(datetime(2026, 7, 12, 9, 30)) == datetime(2026, 7, 12)

    def test_bad_returns_none(self):
        assert _parse_start_date("not-a-date") is None
        assert _parse_start_date(None) is None


class TestResolveWorkoutContent:
    def test_custom_workout(self):
        workout = {
            "workoutType": "custom",
            "customWorkout": {
                "title": "Strength",
                "type": "strength",
                "durationMinutes": 50,
                "exercises": [{"exerciseName": "Squat", "sets": [{"reps": 5}, {"reps": 5}, {"reps": 5}]}],
            },
        }
        c = _resolve_workout_content(workout, {})
        assert c["title"] == "Strength"
        assert c["duration"] == 50
        assert c["template_id"] is None
        assert c["exercises"][0] == {"exerciseName": "Squat", "targetSets": 3, "targetReps": 5, "notes": ""}

    def test_predefined_resolution_parses_volume(self):
        tid = ObjectId()
        template_map = {
            str(tid): {
                "_id": tid,
                "name": "Push Day",
                "estimated_duration": 40,
                "blocks": [{"exercises": [
                    {"exercise_id": ObjectId(), "exercise_name": "Bench", "volume": "4x8"},
                ]}],
            }
        }
        workout = {"workoutType": "predefined", "predefinedWorkoutId": tid}
        c = _resolve_workout_content(workout, template_map)
        assert c["title"] == "Push Day"
        assert c["duration"] == 40
        assert c["template_id"] == tid
        assert c["exercises"][0]["exerciseName"] == "Bench"
        assert c["exercises"][0]["targetSets"] == 4
        assert c["exercises"][0]["targetReps"] == 8

    def test_missing_template_degrades(self):
        workout = {"workoutType": "predefined", "predefinedWorkoutId": ObjectId()}
        c = _resolve_workout_content(workout, {})
        assert c["title"] == "Workout"
        assert c["exercises"] == []


def _sample_plan():
    return {
        "_id": ObjectId(),
        "userId": ObjectId(),
        "name": "Test Plan",
        "schedule": {"weeksTotal": 2},
        "weeks": [
            {
                "weekNumber": 1, "deloadWeek": False, "restDays": [6],
                "workouts": [
                    {"dayOfWeek": 0, "workoutType": "custom",
                     "customWorkout": {"title": "S&C", "type": "strength", "exercises": []}},
                    {"dayOfWeek": 2, "workoutType": "custom",
                     "customWorkout": {"title": "Endurance", "type": "cardio", "exercises": []}},
                ],
            },
            {
                "weekNumber": 2, "deloadWeek": True, "restDays": [],
                "workouts": [
                    {"dayOfWeek": 0, "workoutType": "custom",
                     "customWorkout": {"title": "Deload", "type": "strength", "exercises": []}},
                ],
            },
        ],
    }


class TestBuildEvents:
    def test_expands_workouts_rests_and_deload(self):
        plan = _sample_plan()
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)

        # 3 workouts (2 week-1 + 1 deload) + 1 rest day = 4
        assert len(events) == 4
        by_title = {e["title"].split(" (")[0]: e for e in events}

        assert by_title["S&C"]["date"] == datetime(2026, 7, 12)
        assert by_title["S&C"]["type"] == "workout"
        assert by_title["S&C"]["planWeek"] == 1
        assert by_title["S&C"]["planDay"] == 0

        assert by_title["Deload"]["type"] == "deload"
        assert by_title["Deload"]["date"] == datetime(2026, 7, 19)

        rest = [e for e in events if e["type"] == "rest"][0]
        assert rest["date"] == datetime(2026, 7, 18)
        assert rest["planWeek"] == 1 and rest["planDay"] == 6

        # sorted chronologically
        assert events == sorted(events, key=lambda e: e["date"])

    def test_weeks_cap(self):
        plan = _sample_plan()
        events = _build_events(plan, SUNDAY, 1, {}, plan["userId"], plan["_id"], NOW)
        assert all(e["planWeek"] == 1 for e in events)


# --------------------------- handler ---------------------------

def _make_ctx(plan, existing_events=None, templates=None):
    """Build a SkillContext-like mock with an async Mongo db."""
    existing_events = existing_events or []
    templates = templates or []

    async def _template_iter():
        for t in templates:
            yield t

    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    db.plans.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.predefinedworkouts.find = MagicMock(return_value=_template_iter())

    find_result = MagicMock()
    find_result.to_list = AsyncMock(return_value=existing_events)
    db.calendarevents.find = MagicMock(return_value=find_result)

    async def _insert_many(docs, *a, **k):
        # inserted_ids must reflect the actual number of docs inserted.
        return MagicMock(inserted_ids=[ObjectId() for _ in docs])

    db.calendarevents.insert_many = AsyncMock(side_effect=_insert_many)
    db.calendarevents.delete_many = AsyncMock()

    ctx = MagicMock()
    ctx.db = db
    return ctx


class TestHandler:
    @pytest.mark.asyncio
    async def test_dry_run_writes_nothing(self):
        plan = _sample_plan()
        ctx = _make_ctx(plan)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]), {"plan_id": str(plan["_id"]), "start_date": "2026-07-12"}
        )
        assert result["dry_run"] is True
        assert result["proposed_count"] == 4
        assert len(result["proposed_events"]) == 4
        ctx.db.calendarevents.insert_many.assert_not_called()
        ctx.db.plans.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_confirmed_write_inserts_and_activates(self):
        plan = _sample_plan()
        ctx = _make_ctx(plan)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert result["written"] is True
        assert result["events_created"] == 4
        ctx.db.calendarevents.insert_many.assert_awaited_once()
        inserted = ctx.db.calendarevents.insert_many.call_args.args[0]
        assert len(inserted) == 4
        # plan activated
        ctx.db.plans.update_one.assert_awaited_once()
        set_doc = ctx.db.plans.update_one.call_args.args[1]["$set"]
        assert set_doc["status"] == "active"
        assert set_doc["startDate"] == datetime(2026, 7, 12)
        assert set_doc["progress.totalWorkouts"] == 3

    @pytest.mark.asyncio
    async def test_dedup_skips_already_scheduled_slots(self):
        plan = _sample_plan()
        # An event already exists for plan week 1 / day 0.
        existing = [{
            "planId": plan["_id"], "planWeek": 1, "planDay": 0,
            "date": datetime(2026, 7, 12), "title": "S&C (Jul 12)", "status": "scheduled",
        }]
        ctx = _make_ctx(plan, existing_events=existing)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        # 4 proposed - 1 already scheduled = 3 inserted
        inserted = ctx.db.calendarevents.insert_many.call_args.args[0]
        assert len(inserted) == 3
        assert result["events_created"] == 3

    @pytest.mark.asyncio
    async def test_conflict_with_other_event_warns_but_still_inserts(self):
        plan = _sample_plan()
        # An unrelated event (no planId) sits on the same day as week-1/day-0.
        existing = [{
            "date": datetime(2026, 7, 12), "title": "Doctor appt", "status": "scheduled",
        }]
        ctx = _make_ctx(plan, existing_events=existing)
        preview = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12"},
        )
        assert len(preview["conflicts"]) == 1
        assert "alongside" in preview["message"]
        # On write, the conflict is NOT dropped — all 4 events are inserted.
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert result["events_created"] == 4

    @pytest.mark.asyncio
    async def test_reschedule_to_new_date_requires_overwrite(self):
        plan = _sample_plan()
        # Plan already scheduled: same slot (wk1/day0) but an OLD date.
        existing = [{
            "planId": plan["_id"], "planWeek": 1, "planDay": 0,
            "date": datetime(2026, 7, 5), "title": "S&C (Jul 05)", "status": "scheduled",
        }]
        ctx = _make_ctx(plan, existing_events=existing)
        # Moving to a new start date without overwrite -> guarded, no silent no-op.
        guarded = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert guarded.get("needs_confirmation") == "reschedule"
        ctx.db.calendarevents.insert_many.assert_not_called()
        # With overwrite -> clears all plan events, inserts the full new set.
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False, "overwrite": True},
        )
        ctx.db.calendarevents.delete_many.assert_awaited_once()
        assert result["events_created"] == 4

    @pytest.mark.asyncio
    async def test_unknown_plan_returns_error(self):
        ctx = _make_ctx(plan=None)
        result = await schedule_plan_to_calendar(
            ctx, str(ObjectId()), {"plan_id": str(ObjectId())}
        )
        assert result["success"] is False
        assert "not found" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_missing_start_date_asks(self):
        plan = _sample_plan()
        plan.pop("startDate", None)
        ctx = _make_ctx(plan)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]), {"plan_id": str(plan["_id"])}
        )
        assert result.get("needs_input") == "start_date"
        ctx.db.calendarevents.insert_many.assert_not_called()
