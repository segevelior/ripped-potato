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

    def test_missing_template_flagged(self):
        workout = {"workoutType": "predefined", "predefinedWorkoutId": ObjectId()}
        c = _resolve_workout_content(workout, {})
        assert c["title"] == "Workout"
        assert c["exercises"] == []
        assert c["missing_template"] is True

    def test_custom_workout_keeps_exercise_id(self):
        ex_id = ObjectId()
        workout = {
            "workoutType": "custom",
            "customWorkout": {
                "title": "Hills",
                "exercises": [
                    {"exerciseId": ex_id, "exerciseName": "Hill Sprint", "sets": [{"reps": 8}]},
                    {"exerciseName": "Jog", "sets": []},
                ],
            },
        }
        c = _resolve_workout_content(workout, {})
        assert c["exercises"][0]["exerciseId"] == ex_id
        assert "exerciseId" not in c["exercises"][1]


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

    def test_custom_with_exercises_marked_for_template(self):
        plan = _sample_plan()
        plan["weeks"][0]["workouts"][0]["customWorkout"]["exercises"] = [
            {"exerciseName": "Squat", "sets": [{"reps": 5}] * 3},
        ]
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        marked = [e for e in events if e.get("_pendingTemplate")]
        assert len(marked) == 1
        assert marked[0]["title"].startswith("S&C")
        # exercise-less customs keep current behavior: scheduled, no marker
        assert all("_pendingTemplate" not in e for e in events if e is not marked[0])

    def test_missing_template_workout_dropped(self):
        plan = _sample_plan()
        plan["weeks"][0]["workouts"][0] = {
            "dayOfWeek": 0, "workoutType": "predefined", "predefinedWorkoutId": ObjectId(),
        }
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        # The dangling reference is dropped: 2 remaining workouts + 1 rest = 3
        assert len(events) == 3
        assert all(not e["title"].startswith("Workout (") for e in events)


# --------------------------- handler ---------------------------

def _make_ctx(plan, existing_events=None, templates=None, plan_tagged_templates=None):
    """Build a SkillContext-like mock with an async Mongo db.

    predefinedworkouts.find serves two queries: the template_map batch fetch
    (by _id) and _ensure_templates' plan-tagged reuse lookup (by tags) — each
    call gets a fresh iterator over the matching fixture list.
    """
    existing_events = existing_events or []
    templates = templates or []
    plan_tagged_templates = plan_tagged_templates or []

    def _template_find(query, *a, **k):
        docs = plan_tagged_templates if "tags" in query else templates

        async def _iter():
            for t in docs:
                yield t

        return _iter()

    db = MagicMock()
    db.plans.find_one = AsyncMock(return_value=plan)
    db.plans.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.predefinedworkouts.find = MagicMock(side_effect=_template_find)
    db.predefinedworkouts.insert_one = AsyncMock(
        side_effect=lambda doc, *a, **k: MagicMock(inserted_id=ObjectId())
    )

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


# ------------------- custom-workout template creation -------------------

import app.core.agents.skills.schedule_plan_skill as schedule_plan_module  # noqa: E402


@pytest.fixture
def fake_resolver(monkeypatch):
    """ExerciseResolver stub that assigns an ObjectId to every exercise."""
    async def resolve_blocks(user_id, blocks, on_ambiguous="ask"):
        for block in blocks:
            for ex in block.get("exercises", []):
                ex["exercise_id"] = ex.get("exercise_id") or ObjectId()
        return blocks, {"resolved": [], "created": [], "ambiguous": [], "pending_create": []}

    resolver = MagicMock()
    resolver.resolve_blocks = AsyncMock(side_effect=resolve_blocks)
    monkeypatch.setattr(schedule_plan_module, "ExerciseResolver", MagicMock(return_value=resolver))
    return resolver


def _custom_plan_with_exercises():
    """A 3-week plan repeating the SAME custom workout each week."""
    workout = {
        "dayOfWeek": 0, "workoutType": "custom",
        "customWorkout": {
            "title": "Hill Repeats", "type": "cardio", "durationMinutes": 40,
            "exercises": [{"exerciseName": "Hill Sprint", "sets": [{"reps": 8}] * 4}],
        },
    }
    return {
        "_id": ObjectId(),
        "userId": ObjectId(),
        "name": "Run Plan",
        "schedule": {"weeksTotal": 3},
        "weeks": [
            {"weekNumber": n, "deloadWeek": False, "restDays": [], "workouts": [dict(workout)]}
            for n in (1, 2, 3)
        ],
    }


class TestEnsureTemplates:
    @pytest.mark.asyncio
    async def test_repeated_custom_workout_creates_one_shared_template(self, fake_resolver):
        plan = _custom_plan_with_exercises()
        ctx = _make_ctx(plan)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert result["events_created"] == 3
        # one template for the workout repeated across 3 weeks
        ctx.db.predefinedworkouts.insert_one.assert_awaited_once()
        template = ctx.db.predefinedworkouts.insert_one.call_args.args[0]
        assert template["name"] == "Hill Repeats"
        assert template["isCommon"] is False
        assert template["createdBy"] == plan["userId"]
        assert f"plan-{plan['_id']}" in template["tags"]
        assert template["blocks"][0]["exercises"][0]["exercise_id"] is not None

        inserted = ctx.db.calendarevents.insert_many.call_args.args[0]
        template_ids = {e.get("workoutTemplateId") for e in inserted}
        assert len(template_ids) == 1 and None not in template_ids
        # internal marker never persisted; resolved ids backfilled into events
        assert all("_pendingTemplate" not in e for e in inserted)
        assert all(
            e["workoutDetails"]["exercises"][0].get("exerciseId") is not None
            for e in inserted
        )

    @pytest.mark.asyncio
    async def test_dry_run_creates_no_templates(self, fake_resolver):
        plan = _custom_plan_with_exercises()
        ctx = _make_ctx(plan)
        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]), {"plan_id": str(plan["_id"]), "start_date": "2026-07-12"},
        )
        assert result["dry_run"] is True
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        ctx.db.calendarevents.insert_many.assert_not_called()

    @pytest.mark.asyncio
    async def test_rerun_reuses_plan_tagged_template(self, fake_resolver):
        plan = _custom_plan_with_exercises()
        existing_id = ObjectId()
        existing_ex_id = ObjectId()
        tagged = [{
            "_id": existing_id,
            "name": "Hill Repeats",
            "tags": ["ai-generated", "plan", f"plan-{plan['_id']}"],
            "blocks": [{"name": "Main Workout", "exercises": [
                {"exercise_id": existing_ex_id, "exercise_name": "Hill Sprint", "volume": "4x8"},
            ]}],
        }]
        ctx = _make_ctx(plan, plan_tagged_templates=tagged)
        await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        inserted = ctx.db.calendarevents.insert_many.call_args.args[0]
        assert all(e["workoutTemplateId"] == existing_id for e in inserted)
        assert all(
            e["workoutDetails"]["exercises"][0]["exerciseId"] == existing_ex_id
            for e in inserted
        )

    @pytest.mark.asyncio
    async def test_same_name_different_content_gets_own_template(self, fake_resolver):
        plan = _custom_plan_with_exercises()
        # Same title, different prescription (hard week) — must NOT reuse.
        plan["weeks"][2]["workouts"][0]["customWorkout"] = {
            "title": "Hill Repeats", "type": "cardio", "durationMinutes": 40,
            "exercises": [{"exerciseName": "Hill Sprint", "sets": [{"reps": 12}] * 6}],
        }
        ctx = _make_ctx(plan)
        await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert ctx.db.predefinedworkouts.insert_one.await_count == 2

    @pytest.mark.asyncio
    async def test_missing_template_workouts_skipped_with_note(self, fake_resolver):
        plan = _custom_plan_with_exercises()
        plan["weeks"][0]["workouts"][0] = {
            "dayOfWeek": 0, "workoutType": "predefined", "predefinedWorkoutId": ObjectId(),
        }
        ctx = _make_ctx(plan)
        preview = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]), {"plan_id": str(plan["_id"]), "start_date": "2026-07-12"},
        )
        assert preview["proposed_count"] == 2
        assert "deleted workout template" in preview["message"]

        result = await schedule_plan_to_calendar(
            ctx, str(plan["userId"]),
            {"plan_id": str(plan["_id"]), "start_date": "2026-07-12", "dry_run": False},
        )
        assert result["events_created"] == 2
        assert "deleted workout template" in result["message"]


# ------------------- skeleton plans (rolling materialization) -------------------

from app.core.agents.skills.schedule_plan_skill import _slot_key  # noqa: E402


def _skeleton_sample_plan():
    plan = _sample_plan()
    plan["weeks"][0]["resolved"] = True
    plan["weeks"][1]["resolved"] = False   # stub — must not be scheduled
    plan["weeks"][1]["workouts"] = []
    plan["skeleton"] = {
        "milestones": [{"week": 1, "title": "Checkpoint", "criteria": "3 pull-ups"}],
    }
    return plan


class TestSkeletonScheduling:
    def test_unresolved_weeks_excluded(self):
        plan = _skeleton_sample_plan()
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        assert all(e["planWeek"] == 1 for e in events)

    def test_missing_resolved_flag_treated_as_resolved(self):
        plan = _sample_plan()  # legacy: no resolved flags anywhere
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        assert {e["planWeek"] for e in events} == {1, 2}

    def test_milestone_event_emitted_for_resolved_week(self):
        plan = _skeleton_sample_plan()
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        milestones = [e for e in events if e["type"] == "milestone"]
        assert len(milestones) == 1
        assert milestones[0]["title"] == "🎯 Checkpoint"
        assert milestones[0]["notes"] == "3 pull-ups"
        assert milestones[0]["planWeek"] == 1 and milestones[0]["planDay"] == 6

    def test_milestone_for_unresolved_week_not_emitted(self):
        plan = _skeleton_sample_plan()
        plan["skeleton"]["milestones"] = [{"week": 2, "title": "Later", "criteria": ""}]
        events = _build_events(plan, SUNDAY, None, {}, plan["userId"], plan["_id"], NOW)
        assert not [e for e in events if e["type"] == "milestone"]

    def test_slot_key_separates_milestone_from_workout_same_day(self):
        workout = {"planWeek": 1, "planDay": 6, "type": "workout"}
        milestone = {"planWeek": 1, "planDay": 6, "type": "milestone"}
        rest = {"planWeek": 1, "planDay": 6, "type": "rest"}
        assert _slot_key(workout) != _slot_key(milestone) != _slot_key(rest)

    def test_slot_key_workout_and_deload_share_class(self):
        # A re-planned deload week must MOVE the session, not duplicate it.
        a = {"planWeek": 2, "planDay": 0, "type": "workout"}
        b = {"planWeek": 2, "planDay": 0, "type": "deload"}
        assert _slot_key(a) == _slot_key(b)
