"""
Tests for schedule_to_calendar's think-then-act additions:
existing-template mode (workout_template_id) and the same-day duplicate check.
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.core.agents.services.calendar_service import CalendarService

USER_ID = str(ObjectId())
TEMPLATE_ID = ObjectId()

TEMPLATE = {
    "_id": TEMPLATE_ID,
    "name": "Endurance 1",
    "estimated_duration": 50,
    "blocks": [{
        "name": "Main",
        "exercises": [
            {"exercise_id": str(ObjectId()), "exercise_name": "Run", "volume": "1x30", "notes": ""},
            {"exercise_id": str(ObjectId()), "exercise_name": "Burpees", "volume": "3x15", "notes": ""},
        ],
    }],
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


def _service(template=TEMPLATE, existing_events=()):
    db = MagicMock()
    db.users.find_one = AsyncMock(return_value=None)  # get_user_today -> UTC
    db.predefinedworkouts.find_one = AsyncMock(return_value=template)
    db.predefinedworkouts.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )
    db.calendarevents.find = MagicMock(return_value=FakeCursor(existing_events))
    db.calendarevents.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )
    return CalendarService(db), db


class TestExistingTemplateMode:
    async def test_preview_lists_template_exercises_and_writes_nothing(self):
        service, db = _service()
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout",
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res["dry_run"] is True
        assert "existing library workout" in res["message"]
        assert "Endurance 1" in res["message"]
        assert all(e["method"] == "existing_template" for e in res["resolved_exercises"])
        db.predefinedworkouts.insert_one.assert_not_called()
        db.calendarevents.insert_one.assert_not_called()

    async def test_write_links_existing_template_and_creates_no_new_one(self):
        service, db = _service()
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout", "dry_run": False,
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res["success"] is True
        assert "nothing new was created" in res["message"]
        db.predefinedworkouts.insert_one.assert_not_called()
        event_doc = db.calendarevents.insert_one.call_args[0][0]
        assert event_doc["workoutTemplateId"] == TEMPLATE_ID
        assert len(event_doc["workoutDetails"]["exercises"]) == 2
        assert event_doc["workoutDetails"]["exercises"][0]["exerciseName"] == "Run"
        # Title falls back to the template name.
        assert event_doc["title"].startswith("Endurance 1 (")

    async def test_template_not_found_is_corrective(self):
        service, db = _service(template=None)
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout",
                      "workout_template_id": str(ObjectId())}
        )
        assert res["success"] is False
        assert res["error"] == "template_not_found"
        assert "never guess an id" in res["message"]

    async def test_invalid_id_is_corrective_not_crash(self):
        service, db = _service(template=None)
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout",
                      "workout_template_id": "not-an-oid"}
        )
        assert res["error"] == "template_not_found"

    async def test_empty_template_rejected(self):
        empty = dict(TEMPLATE, blocks=[{"name": "Main", "exercises": []}])
        service, db = _service(template=empty)
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout",
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res["error"] == "empty_template"
        db.calendarevents.insert_one.assert_not_called()

    async def test_missing_details_message_mentions_template_arg(self):
        service, db = _service()
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout", "title": "Endurance 1"}
        )
        assert res["error"] == "missing_workout_details"
        assert "workout_template_id" in res["message"]


class TestSameDayDuplicate:
    def _existing_event(self, **overrides):
        event = {
            "_id": ObjectId(),
            "title": "Endurance 1 (Jul 20)",
            "date": datetime(2026, 7, 20),
            "type": "workout",
            "status": "scheduled",
            "workoutDetails": {"exercises": [{"exerciseName": "Run"}]},
        }
        event.update(overrides)
        return event

    async def test_same_base_title_refused_on_preview(self):
        service, db = _service(existing_events=[self._existing_event()])
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout", "title": "Endurance 1",
                      "workoutDetails": {"exercises": [{"exerciseName": "Run"}]}}
        )
        assert res["error"] == "already_scheduled"
        assert res["existing_event"]["exerciseCount"] == 1
        assert "allow_duplicate=true" in res["message"]
        db.calendarevents.insert_one.assert_not_called()

    async def test_same_template_id_refused_on_write(self):
        event = self._existing_event(title="Something Else", workoutTemplateId=TEMPLATE_ID)
        service, db = _service(existing_events=[event])
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout", "dry_run": False,
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res["error"] == "already_scheduled"
        db.calendarevents.insert_one.assert_not_called()

    async def test_allow_duplicate_writes(self):
        service, db = _service(existing_events=[self._existing_event()])
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "workout", "dry_run": False,
                      "allow_duplicate": True,
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res["success"] is True
        db.calendarevents.insert_one.assert_called_once()

    async def test_different_day_not_a_duplicate(self):
        service, db = _service(existing_events=[])
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-21", "type": "workout",
                      "workout_template_id": str(TEMPLATE_ID)}
        )
        assert res.get("error") is None
        assert res["dry_run"] is True

    async def test_rest_events_exempt(self):
        service, db = _service(existing_events=[self._existing_event()])
        res = await service.schedule_to_calendar(
            USER_ID, {"date": "2026-07-20", "type": "rest", "title": "Rest Day",
                      "dry_run": False}
        )
        assert res["success"] is True
        db.calendarevents.insert_one.assert_called_once()
