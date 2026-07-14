"""
Tests for schedule_to_calendar's reuse-first rule: inline workoutDetails whose
content exactly matches an existing library workout LINK that workout instead
of inserting a per-date duplicate. Only adjusted content creates a template —
and the one it creates has a stable, un-dated name.
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.agents.services.calendar_service import CalendarService

USER_ID = str(ObjectId())
TEMPLATE_ID = ObjectId()

LIBRARY_TEMPLATE = {
    "_id": TEMPLATE_ID,
    "name": "Push Day",
    "isCommon": False,
    "createdBy": ObjectId(USER_ID),
    "estimated_duration": 50,
    "primary_disciplines": ["Strength"],
    "blocks": [{
        "name": "Main",
        "exercises": [
            {"exercise_id": str(ObjectId()), "exercise_name": "Bench Press", "volume": "3x8", "notes": ""},
            {"exercise_id": str(ObjectId()), "exercise_name": "Push-Up", "volume": "3x15", "notes": ""},
        ],
    }],
}

MATCHING_DETAILS = {
    "estimatedDuration": 50,
    "exercises": [
        {"exerciseName": "Bench Press", "targetSets": 3, "targetReps": 8},
        {"exerciseName": "Push-Up", "targetSets": 3, "targetReps": 15},
    ],
}


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def _service(library=(LIBRARY_TEMPLATE,), existing_events=()):
    db = MagicMock()
    db.users.find_one = AsyncMock(return_value=None)  # get_user_today -> UTC
    db.predefinedworkouts.find = MagicMock(return_value=FakeCursor(library))
    db.predefinedworkouts.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )
    db.calendarevents.find = MagicMock(return_value=FakeCursor(existing_events))
    db.calendarevents.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )
    return CalendarService(db), db


@pytest.fixture
def resolver(monkeypatch):
    """Pass-through resolver: names resolve to themselves as existing matches."""
    resolver = MagicMock()
    resolver.resolve_blocks = AsyncMock(
        side_effect=lambda uid, blocks, **kw: (blocks, {"ambiguous": [], "created": []})
    )

    async def _resolve(uid, items, **kw):
        return [
            {"status": "auto_matched", "matched_name": item["exercise_name"], "method": "exact"}
            for item in items
        ]

    resolver.resolve = AsyncMock(side_effect=_resolve)
    monkeypatch.setattr(
        "app.core.agents.services.calendar_service.ExerciseResolver",
        lambda db: resolver,
    )
    return resolver


def _schedule_args(**overrides):
    args = {"date": "2026-07-20", "type": "workout", "title": "Push Day",
            "workoutDetails": MATCHING_DETAILS}
    args.update(overrides)
    return args


class TestReuseFirstWrite:
    async def test_matching_content_links_without_insert(self, resolver):
        service, db = _service()
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(dry_run=False)
        )
        assert res["success"] is True
        assert res["workout_template_id"] == str(TEMPLATE_ID)
        assert "no duplicate" in res["message"]
        db.predefinedworkouts.insert_one.assert_not_called()
        event_doc = db.calendarevents.insert_one.call_args[0][0]
        assert event_doc["workoutTemplateId"] == TEMPLATE_ID
        assert "exercises" not in event_doc["workoutDetails"]

    async def test_matching_common_template_links(self, resolver):
        common = dict(LIBRARY_TEMPLATE, isCommon=True, createdBy=None)
        service, db = _service(library=[common])
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(dry_run=False)
        )
        assert res["workout_template_id"] == str(TEMPLATE_ID)
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_no_match_inserts_with_stable_undated_name(self, resolver):
        service, db = _service(library=[])
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(title="Push Day (Jul 20)", dry_run=False)
        )
        assert res["success"] is True
        db.predefinedworkouts.insert_one.assert_called_once()
        template_doc = db.predefinedworkouts.insert_one.call_args[0][0]
        # Stable name: the next schedule of this content must collide with it.
        assert template_doc["name"] == "Push Day"
        assert template_doc["tags"] == ["ai-generated"]

    async def test_adjusted_content_creates_new_despite_same_name(self, resolver):
        """Same title but different prescription = an ADJUSTED workout — it
        must become its own template, never silently relink the old one."""
        service, db = _service()
        adjusted = {
            "exercises": [
                {"exerciseName": "Bench Press", "targetSets": 5, "targetReps": 5},
                {"exerciseName": "Push-Up", "targetSets": 3, "targetReps": 15},
            ],
        }
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(workoutDetails=adjusted, dry_run=False)
        )
        assert res["success"] is True
        db.predefinedworkouts.insert_one.assert_called_once()
        assert res["workout_template_id"] != str(TEMPLATE_ID)

    async def test_reuse_hit_refuses_same_day_duplicate_of_matched_template(self, resolver):
        """The pre-lookup same-day check runs with template_oid=None; once the
        inline content matches a template already on that day (under ANY title),
        the write must refuse exactly like an explicit workout_template_id."""
        from datetime import datetime
        existing = {
            "_id": ObjectId(),
            "title": "Something Else Entirely",
            "date": datetime(2026, 7, 20),
            "type": "workout",
            "status": "scheduled",
            "workoutTemplateId": TEMPLATE_ID,
        }
        service, db = _service(existing_events=[existing])
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(title="Fresh Title", dry_run=False)
        )
        assert res["error"] == "already_scheduled"
        db.calendarevents.insert_one.assert_not_called()

    async def test_preview_signature_coerces_string_sets_reps(self, resolver):
        """Preview and write must reach the same verdict when the model sends
        sets/reps as strings — the preview coerces through parse_volume."""
        service, db = _service()
        details = {
            "exercises": [
                {"exerciseName": "Bench Press", "targetSets": "3", "targetReps": "8"},
                {"exerciseName": "Push-Up", "targetSets": "3", "targetReps": "15"},
            ],
        }
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(workoutDetails=details)
        )
        assert res["dry_run"] is True
        assert "Will LINK" in res["message"]
        assert res["reuses_template"]["id"] == str(TEMPLATE_ID)

    async def test_resolver_renamed_exercise_still_matches(self, resolver):
        """The library stores canonical names — matching runs AFTER resolution,
        so 'Pushup' resolving to 'Push-Up' still links the existing template."""
        def _rename(uid, blocks, **kw):
            for block in blocks:
                for ex in block["exercises"]:
                    if ex["exercise_name"] == "Pushup":
                        ex["exercise_name"] = "Push-Up"
            return blocks, {"ambiguous": [], "created": []}

        resolver.resolve_blocks = AsyncMock(side_effect=_rename)
        service, db = _service()
        details = {
            "exercises": [
                {"exerciseName": "Bench Press", "targetSets": 3, "targetReps": 8},
                {"exerciseName": "Pushup", "targetSets": 3, "targetReps": 15},
            ],
        }
        res = await service.schedule_to_calendar(
            USER_ID, _schedule_args(workoutDetails=details, dry_run=False)
        )
        assert res["workout_template_id"] == str(TEMPLATE_ID)
        db.predefinedworkouts.insert_one.assert_not_called()


class TestReuseFirstPreview:
    async def test_preview_announces_link_and_writes_nothing(self, resolver):
        service, db = _service()
        res = await service.schedule_to_calendar(USER_ID, _schedule_args())
        assert res["dry_run"] is True
        assert "Will LINK" in res["message"]
        assert "no new workout will be created" in res["message"]
        assert res["reuses_template"] == {"id": str(TEMPLATE_ID), "name": "Push Day"}
        db.predefinedworkouts.insert_one.assert_not_called()
        db.calendarevents.insert_one.assert_not_called()

    async def test_preview_announces_creation_when_no_match(self, resolver):
        service, db = _service(library=[])
        res = await service.schedule_to_calendar(USER_ID, _schedule_args())
        assert res["dry_run"] is True
        assert "Will create a new library workout" in res["message"]
        assert res["reuses_template"] is None
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_preview_skips_lookup_when_exercise_is_new(self, resolver):
        """A create_pending exercise can't exist in any stored template — the
        preview must not claim a link OR a create verdict based on a stale scan."""
        async def _resolve(uid, items, **kw):
            return [
                {"status": "create_pending", "matched_name": None, "method": None}
                for _ in items
            ]

        resolver.resolve = AsyncMock(side_effect=_resolve)
        service, db = _service()
        res = await service.schedule_to_calendar(USER_ID, _schedule_args())
        assert res["dry_run"] is True
        assert "Will LINK" not in res["message"]
        assert res["reuses_template"] is None
