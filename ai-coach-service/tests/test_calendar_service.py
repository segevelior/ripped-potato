"""
Tests for CalendarService date handling (TOR-14).

The incident: on 2026-07-13 (user tz Asia/Jerusalem) the coach called a Jul 14
event "today" and Jul 12 events "today". Root causes: tool results carried bare
absolute dates with no relative anchoring, and the default range was computed
with utcnow() (excluding yesterday's missed session).
"""
from datetime import date, datetime

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

import app.core.agents.services.calendar_service as calendar_service_module
from app.core.agents.date_utils import get_user_today, relative_day_label
from app.core.agents.services.calendar_service import CalendarService

USER_ID = str(ObjectId())
TODAY = datetime(2026, 7, 13)  # the incident day, user-local


# --------------------------- relative_day_label ---------------------------

class TestRelativeDayLabel:
    @pytest.mark.parametrize("target,expected", [
        (date(2026, 7, 13), "today"),
        (date(2026, 7, 14), "tomorrow"),
        (date(2026, 7, 12), "yesterday"),
        (date(2026, 7, 16), "in 3 days"),
        (date(2026, 7, 11), "2 days ago"),
    ])
    def test_labels(self, target, expected):
        assert relative_day_label(target, date(2026, 7, 13)) == expected


# --------------------------- get_user_today ---------------------------

def _db_with_timezone(tz):
    db = MagicMock()
    db.users.find_one = AsyncMock(return_value={"settings": {"timezone": tz}})
    return db


class TestGetUserToday:
    async def test_local_date_wins_at_utc_boundary(self):
        # 22:30 UTC on Jul 12 is already Jul 13 in Jerusalem (UTC+3).
        db = _db_with_timezone("Asia/Jerusalem")
        today, tz = await get_user_today(db, USER_ID, now=datetime(2026, 7, 12, 22, 30))
        assert today == datetime(2026, 7, 13)
        assert tz == "Asia/Jerusalem"

    async def test_utc_user_keeps_utc_date(self):
        db = _db_with_timezone("UTC")
        today, tz = await get_user_today(db, USER_ID, now=datetime(2026, 7, 12, 22, 30))
        assert today == datetime(2026, 7, 12)
        assert tz == "UTC"

    async def test_invalid_timezone_falls_back_to_utc(self):
        db = _db_with_timezone("Not/AZone")
        today, tz = await get_user_today(db, USER_ID, now=datetime(2026, 7, 12, 22, 30))
        assert today == datetime(2026, 7, 12)
        assert tz == "UTC"

    async def test_lookup_error_falls_back_to_utc(self):
        db = MagicMock()
        db.users.find_one = AsyncMock(side_effect=RuntimeError("boom"))
        today, tz = await get_user_today(db, USER_ID, now=datetime(2026, 7, 13, 10, 50))
        assert today == datetime(2026, 7, 13)
        assert tz == "UTC"


# --------------------------- get_calendar_events ---------------------------

def _event(oid_hex_suffix, day, title):
    return {
        "_id": ObjectId("6a51000000000000000000" + oid_hex_suffix),
        "date": day,
        "title": title,
        "type": "workout",
        "status": "scheduled",
    }


def _db_with_events(events):
    db = MagicMock()
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=events)
    db.calendarevents.find = MagicMock(return_value=cursor)
    return db


@pytest.fixture
def anchor_today(monkeypatch):
    """Pin the user-local today to the incident date."""
    monkeypatch.setattr(
        calendar_service_module, "get_user_today",
        AsyncMock(return_value=(TODAY, "Asia/Jerusalem")),
    )


class TestGetCalendarEvents:
    async def test_incident_regression_relative_labels(self, anchor_today):
        # Calendar shape from the incident: 2 events yesterday, 1 tomorrow, none today.
        events = [
            _event("01", datetime(2026, 7, 12), "Strength and Conditioning (Jul 12)"),
            _event("02", datetime(2026, 7, 12), "20-Min Bodyweight Core (Jul 12)"),
            _event("03", datetime(2026, 7, 14), "Endurance 1 (Jul 14)"),
        ]
        db = _db_with_events(events)
        service = CalendarService(db)

        result = await service.get_calendar_events(USER_ID, {})

        assert result["success"] is True
        assert result["today"] == "2026-07-13"
        assert result["timezone"] == "Asia/Jerusalem"
        assert result["message"].startswith("Today is 2026-07-13")

        labels = {e["title"]: e["relativeDay"] for e in result["events"]}
        assert labels["Strength and Conditioning (Jul 12)"] == "yesterday"
        assert labels["20-Min Bodyweight Core (Jul 12)"] == "yesterday"
        assert labels["Endurance 1 (Jul 14)"] == "tomorrow"
        assert not any(e["isToday"] for e in result["events"])

    async def test_default_range_includes_yesterday(self, anchor_today):
        db = _db_with_events([])
        service = CalendarService(db)

        result = await service.get_calendar_events(USER_ID, {})

        query = db.calendarevents.find.call_args[0][0]
        assert query["date"]["$gte"] == datetime(2026, 7, 12)  # yesterday
        assert query["date"]["$lte"] == datetime(2026, 7, 20)  # today + 7
        assert result["queriedRange"] == {"start": "2026-07-12", "end": "2026-07-20"}

    async def test_explicit_start_keeps_seven_day_window(self, anchor_today):
        db = _db_with_events([])
        service = CalendarService(db)

        await service.get_calendar_events(USER_ID, {"startDate": "2026-07-01"})

        query = db.calendarevents.find.call_args[0][0]
        assert query["date"]["$gte"] == datetime(2026, 7, 1)
        assert query["date"]["$lte"] == datetime(2026, 7, 8)

    async def test_empty_result_states_today(self, anchor_today):
        db = _db_with_events([])
        service = CalendarService(db)

        result = await service.get_calendar_events(USER_ID, {})

        assert result["events"] == []
        assert result["today"] == "2026-07-13"
        assert "Today is 2026-07-13" in result["message"]


# --------------------------- schedule_to_calendar ---------------------------

class TestScheduleToCalendar:
    async def test_today_resolves_user_local(self, monkeypatch):
        # Pin user-local today to Jul 13 even though "server UTC" would say Jul 12.
        monkeypatch.setattr(
            calendar_service_module, "get_user_today",
            AsyncMock(return_value=(TODAY, "Asia/Jerusalem")),
        )
        db = MagicMock()
        insert_result = MagicMock()
        insert_result.inserted_id = ObjectId()
        db.calendarevents.insert_one = AsyncMock(return_value=insert_result)
        service = CalendarService(db)

        result = await service.schedule_to_calendar(
            USER_ID, {"date": "today", "title": "Recovery Walk", "type": "event"}
        )

        assert result["success"] is True
        stored = db.calendarevents.insert_one.call_args[0][0]
        assert stored["date"] == datetime(2026, 7, 13)  # user-local midnight
        assert result["is_today"] is True
        assert result["relativeDay"] == "today"
        assert result["dateISO"] == "2026-07-13"


# ------------------- schedule_to_calendar: template linking -------------------

def _anchor(monkeypatch):
    monkeypatch.setattr(
        calendar_service_module, "get_user_today",
        AsyncMock(return_value=(TODAY, "Asia/Jerusalem")),
    )


def _fake_resolver(monkeypatch):
    """ExerciseResolver stub that assigns an ObjectId to every exercise."""
    async def resolve_blocks(user_id, blocks, on_ambiguous="ask"):
        for block in blocks:
            for ex in block.get("exercises", []):
                ex["exercise_id"] = ex.get("exercise_id") or ObjectId()
        return blocks, {"resolved": [], "created": [], "ambiguous": [], "pending_create": []}

    resolver = MagicMock()
    resolver.resolve_blocks = AsyncMock(side_effect=resolve_blocks)
    monkeypatch.setattr(calendar_service_module, "ExerciseResolver", MagicMock(return_value=resolver))
    return resolver


def _insert_db():
    db = MagicMock()
    db.calendarevents.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    db.predefinedworkouts.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    return db


class TestScheduleToCalendarTemplateLink:
    @pytest.mark.parametrize("event_type", ["workout", "deload"])
    async def test_workout_without_exercises_rejected(self, monkeypatch, event_type):
        _anchor(monkeypatch)
        db = _insert_db()
        service = CalendarService(db)

        result = await service.schedule_to_calendar(
            USER_ID, {"date": "today", "title": "Leg Day", "type": event_type}
        )

        assert result["success"] is False
        assert result["error"] == "missing_workout_details"
        assert "workoutDetails.exercises" in result["message"]
        db.calendarevents.insert_one.assert_not_called()
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_workout_with_empty_exercises_rejected(self, monkeypatch):
        _anchor(monkeypatch)
        db = _insert_db()
        service = CalendarService(db)

        result = await service.schedule_to_calendar(
            USER_ID,
            {"date": "today", "title": "Leg Day", "type": "workout",
             "workoutDetails": {"exercises": []}},
        )

        assert result["success"] is False
        assert result["error"] == "missing_workout_details"
        db.calendarevents.insert_one.assert_not_called()

    @pytest.mark.parametrize("event_type", ["workout", "deload"])
    async def test_workout_with_exercises_creates_and_links_template(self, monkeypatch, event_type):
        _anchor(monkeypatch)
        _fake_resolver(monkeypatch)
        db = _insert_db()
        service = CalendarService(db)

        result = await service.schedule_to_calendar(
            USER_ID,
            {"date": "today", "title": "Leg Day", "type": event_type,
             "workoutDetails": {"exercises": [
                 {"exerciseName": "Squat", "targetSets": 5, "targetReps": 5},
             ]}},
        )

        assert result["success"] is True
        db.predefinedworkouts.insert_one.assert_awaited_once()
        template = db.predefinedworkouts.insert_one.call_args[0][0]
        assert template["isCommon"] is False
        assert template["createdBy"] == ObjectId(USER_ID)

        event = db.calendarevents.insert_one.call_args[0][0]
        assert event["workoutTemplateId"] is not None
        assert event["workoutDetails"]["exercises"][0]["exerciseId"] is not None

    async def test_rest_event_needs_no_exercises(self, monkeypatch):
        _anchor(monkeypatch)
        db = _insert_db()
        service = CalendarService(db)

        result = await service.schedule_to_calendar(
            USER_ID, {"date": "today", "title": "Rest Day", "type": "rest"}
        )

        assert result["success"] is True
        db.predefinedworkouts.insert_one.assert_not_called()
