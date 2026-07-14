"""update_calendar_workout copy-on-write behavior.

Calendar events reference a PredefinedWorkout instead of embedding exercises,
so per-day edits land on the linked template: a shared template (common /
referenced by other events or plans) is cloned into a user-owned copy and the
event relinked; an exclusively-owned template is edited in place; legacy
events without a template keep the old embedded-list edit.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

import app.core.agents.skills.update_calendar_workout_skill as skill_module
from app.core.agents.skills.update_calendar_workout_skill import (
    resolve_block_change,
    update_calendar_workout,
)

USER_ID = str(ObjectId())
EVENT_ID = ObjectId()
TEMPLATE_ID = ObjectId()


def _template(is_common=False, created_by=None):
    return {
        "_id": TEMPLATE_ID,
        "name": "Strength A",
        "primary_disciplines": ["Strength"],
        "estimated_duration": 60,
        "difficulty_level": "intermediate",
        "isCommon": is_common,
        "createdBy": created_by,
        "tags": ["ai-generated"],
        "blocks": [{
            "name": "Main Workout",
            "exercises": [
                {"exercise_id": ObjectId(), "exercise_name": "Russian Twists", "volume": "3x20", "rest": "60s", "notes": ""},
                {"exercise_id": ObjectId(), "exercise_name": "Pull-Ups", "volume": "4x8", "rest": "60s", "notes": ""},
            ],
        }],
    }


def _event(template_id=TEMPLATE_ID, embedded=None):
    event = {
        "_id": EVENT_ID,
        "userId": ObjectId(USER_ID),
        "title": "Strength A (Jul 20)",
        "date": datetime(2026, 7, 20),
        "type": "workout",
        "status": "scheduled",
        "workoutDetails": {"type": "strength", "estimatedDuration": 60},
    }
    if template_id:
        event["workoutTemplateId"] = template_id
    if embedded is not None:
        event["workoutDetails"]["exercises"] = embedded
    return event


def _make_ctx(event, template=None, other_event_refs=0, plan_refs=0):
    db = MagicMock()
    db.calendarevents.find_one = AsyncMock(return_value=event)
    db.calendarevents.count_documents = AsyncMock(return_value=other_event_refs)
    db.calendarevents.update_one = AsyncMock()
    db.calendarevents.update_many = AsyncMock()
    db.predefinedworkouts.find_one = AsyncMock(return_value=template)
    db.predefinedworkouts.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    db.predefinedworkouts.update_one = AsyncMock()
    db.plans.count_documents = AsyncMock(return_value=plan_refs)

    find_result = MagicMock()

    async def _iter():
        return
        yield

    db.calendarevents.find = MagicMock(return_value=_iter())

    ctx = MagicMock()
    ctx.db = db
    return ctx


def _fake_resolver(monkeypatch):
    async def resolve_blocks(user_id, blocks, on_ambiguous="ask"):
        for block in blocks:
            for ex in block.get("exercises", []):
                ex["exercise_id"] = ex.get("exercise_id") or ObjectId()
        return blocks, {"resolved": [], "created": [], "ambiguous": [], "pending_create": []}

    resolver = MagicMock()
    resolver.resolve_blocks = AsyncMock(side_effect=resolve_blocks)
    monkeypatch.setattr(skill_module, "ExerciseResolver", MagicMock(return_value=resolver))
    return resolver


SWAP_ARGS = {
    "event_id": str(EVENT_ID),
    "operation": "swap",
    "target_exercise": "Russian Twists",
    "new_exercise": {"name": "Dragon Flag", "sets": 3, "reps": 8},
    "dry_run": False,
}


class TestResolveBlockChange:
    def test_swap_replaces_in_place(self):
        blocks = _template()["blocks"]
        updated, summary = resolve_block_change(blocks, "swap", "russian", {"name": "Dragon Flag"})
        assert updated is not None
        names = [ex["exercise_name"] for ex in updated[0]["exercises"]]
        assert names == ["Dragon Flag", "Pull-Ups"]
        assert "Dragon Flag" in summary
        # original untouched
        assert blocks[0]["exercises"][0]["exercise_name"] == "Russian Twists"

    def test_add_appends_to_last_block(self):
        updated, _ = resolve_block_change(_template()["blocks"], "add", None, {"name": "Plank", "sets": 3, "reps": 30})
        assert updated[-1]["exercises"][-1]["exercise_name"] == "Plank"
        assert updated[-1]["exercises"][-1]["volume"] == "3x30"

    def test_remove_missing_target_lists_names(self):
        updated, summary = resolve_block_change(_template()["blocks"], "remove", "Deadlift", None)
        assert updated is None
        assert "Pull-Ups" in summary


@pytest.mark.asyncio
class TestCopyOnWrite:
    async def test_shared_common_template_cloned_and_relinked(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(_event(), template=_template(is_common=True))

        result = await update_calendar_workout(ctx, USER_ID, dict(SWAP_ARGS))

        assert result["success"] is True
        ctx.db.predefinedworkouts.insert_one.assert_awaited_once()
        clone = ctx.db.predefinedworkouts.insert_one.call_args[0][0]
        assert clone["isCommon"] is False
        assert clone["createdBy"] == ObjectId(USER_ID)
        assert "customized" in clone["tags"]
        names = [ex["exercise_name"] for ex in clone["blocks"][0]["exercises"]]
        assert names == ["Dragon Flag", "Pull-Ups"]
        # the shared original is never edited
        ctx.db.predefinedworkouts.update_one.assert_not_called()
        # event relinked to the clone
        relink = ctx.db.calendarevents.update_many.call_args[0]
        assert relink[0]["_id"]["$in"] == [EVENT_ID]
        assert relink[1]["$set"]["workoutTemplateId"] == ctx.db.predefinedworkouts.insert_one.return_value.inserted_id

    async def test_template_referenced_by_other_events_cloned(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(
            _event(),
            template=_template(is_common=False, created_by=ObjectId(USER_ID)),
            other_event_refs=2,
        )

        result = await update_calendar_workout(ctx, USER_ID, dict(SWAP_ARGS))

        assert result["success"] is True
        ctx.db.predefinedworkouts.insert_one.assert_awaited_once()
        ctx.db.predefinedworkouts.update_one.assert_not_called()

    async def test_exclusive_template_edited_in_place(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(
            _event(),
            template=_template(is_common=False, created_by=ObjectId(USER_ID)),
        )

        result = await update_calendar_workout(ctx, USER_ID, dict(SWAP_ARGS))

        assert result["success"] is True
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        ctx.db.predefinedworkouts.update_one.assert_awaited_once()
        update = ctx.db.predefinedworkouts.update_one.call_args[0]
        assert update[0] == {"_id": TEMPLATE_ID}
        names = [ex["exercise_name"] for ex in update[1]["$set"]["blocks"][0]["exercises"]]
        assert names == ["Dragon Flag", "Pull-Ups"]
        # the event keeps its link — nothing relinked
        ctx.db.calendarevents.update_many.assert_not_called()

    async def test_plan_referenced_template_cloned(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(
            _event(),
            template=_template(is_common=False, created_by=ObjectId(USER_ID)),
            plan_refs=1,
        )

        await update_calendar_workout(ctx, USER_ID, dict(SWAP_ARGS))

        ctx.db.predefinedworkouts.insert_one.assert_awaited_once()
        ctx.db.predefinedworkouts.update_one.assert_not_called()

    async def test_dry_run_previews_effect_and_writes_nothing(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(_event(), template=_template(is_common=True))

        result = await update_calendar_workout(
            ctx, USER_ID, {**SWAP_ARGS, "dry_run": True}
        )

        assert result["success"] is True
        assert result["dry_run"] is True
        assert "personalized copy" in result["message"]
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        ctx.db.predefinedworkouts.update_one.assert_not_called()
        ctx.db.calendarevents.update_one.assert_not_called()
        ctx.db.calendarevents.update_many.assert_not_called()

    async def test_legacy_event_without_template_edits_embedded_list(self, monkeypatch):
        _fake_resolver(monkeypatch)
        embedded = [
            {"exerciseName": "Russian Twists", "targetSets": 3, "targetReps": 20},
            {"exerciseName": "Pull-Ups", "targetSets": 4, "targetReps": 8},
        ]
        ctx = _make_ctx(_event(template_id=None, embedded=embedded), template=None)

        result = await update_calendar_workout(ctx, USER_ID, dict(SWAP_ARGS))

        assert result["success"] is True
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        update = ctx.db.calendarevents.update_one.call_args[0]
        new_names = [ex["exerciseName"] for ex in update[1]["$set"]["workoutDetails.exercises"]]
        assert new_names == ["Dragon Flag", "Pull-Ups"]

    async def test_missing_target_errors_without_writes(self, monkeypatch):
        _fake_resolver(monkeypatch)
        ctx = _make_ctx(_event(), template=_template(is_common=True))

        result = await update_calendar_workout(
            ctx, USER_ID, {**SWAP_ARGS, "target_exercise": "Deadlift"}
        )

        assert result["success"] is False
        ctx.db.predefinedworkouts.insert_one.assert_not_called()
        ctx.db.calendarevents.update_one.assert_not_called()
