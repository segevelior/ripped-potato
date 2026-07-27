"""
Regression guard for the coach's workout logging path: log_session must write
to `sessionlogs` (the app's real logging collection, NOT the dead `workouts`
one), with an honest session interval and a backlinked calendar event, and
get_session_history must read the same collection.
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.agents.services.session_service import SessionService
from app.core.agents.tool_definitions.session_tools import get_session_tools


USER_ID = str(ObjectId())
EXERCISE_ID = ObjectId()
LOG_ID = ObjectId()
EVENT_ID = ObjectId()


def _list_cursor(docs):
    """Mimics a motor cursor whose only use is .to_list(None)."""
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=list(docs))
    return cursor


def _query_cursor(docs):
    """Mimics find(...).sort(...).limit(...).to_list(None)."""
    cursor = MagicMock()
    cursor.sort = MagicMock(return_value=cursor)
    cursor.limit = MagicMock(return_value=cursor)
    cursor.to_list = AsyncMock(return_value=list(docs))
    return cursor


def _db_for_logging():
    db = MagicMock()
    db.exercises.find = MagicMock(
        return_value=_list_cursor([{"_id": EXERCISE_ID, "name": "Bench Press"}])
    )
    db.sessionlogs.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=LOG_ID)
    )
    db.sessionlogs.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    db.calendarevents.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=EVENT_ID)
    )
    # The dead collection must never be touched.
    db.workouts.insert_one = AsyncMock(
        side_effect=AssertionError("log_session must not write to db.workouts")
    )
    return db


LOG_ARGS = {
    "title": "Morning Push",
    "type": "Strength",
    "date": "2026-07-20T07:00:00Z",
    "durationMinutes": 45,
    "exercises": [
        {
            "exerciseName": "Bench Press",
            "sets": [{"targetReps": 8, "actualReps": 8, "weight": 60, "rpe": 7}],
        }
    ],
    "notes": "felt strong",
}


class TestLogSession:
    @pytest.mark.asyncio
    async def test_inserts_into_sessionlogs_not_workouts(self):
        db = _db_for_logging()
        result = await SessionService(db).log_session(USER_ID, dict(LOG_ARGS))

        assert result["success"] is True
        db.sessionlogs.insert_one.assert_awaited_once()
        db.workouts.insert_one.assert_not_called()

        doc = db.sessionlogs.insert_one.await_args.args[0]
        assert doc["userId"] == ObjectId(USER_ID)
        assert doc["title"] == "Morning Push"
        assert doc["discipline"] == "strength"
        assert isinstance(doc["startedAt"], datetime)
        assert isinstance(doc["completedAt"], datetime)
        assert doc["actualDuration"] == 45
        # completedAt = startedAt + duration, never "now".
        assert (doc["completedAt"] - doc["startedAt"]).total_seconds() == 45 * 60
        assert doc["exercises"][0]["exerciseId"] == EXERCISE_ID
        assert doc["exercises"][0]["exerciseName"] == "Bench Press"

    @pytest.mark.asyncio
    async def test_creates_backlinked_calendar_event(self):
        db = _db_for_logging()
        await SessionService(db).log_session(USER_ID, dict(LOG_ARGS))

        db.calendarevents.insert_one.assert_awaited_once()
        event = db.calendarevents.insert_one.await_args.args[0]
        assert event["userId"] == ObjectId(USER_ID)
        assert event["type"] == "session"
        assert event["status"] == "completed"
        assert event["sessionLogId"] == LOG_ID
        assert event["sessionDetails"]["durationMinutes"] == 45
        assert event["sessionDetails"]["exercises"][0]["exerciseName"] == "Bench Press"

        # The log gets the calendarEventId backlink.
        db.sessionlogs.update_one.assert_awaited_once()
        query, update = db.sessionlogs.update_one.await_args.args
        assert query == {"_id": LOG_ID}
        assert update == {"$set": {"calendarEventId": EVENT_ID}}

    @pytest.mark.asyncio
    async def test_status_arg_is_dropped_not_persisted(self):
        db = _db_for_logging()
        args = dict(LOG_ARGS)
        args["status"] = "planned"
        await SessionService(db).log_session(USER_ID, args)

        doc = db.sessionlogs.insert_one.await_args.args[0]
        assert "status" not in doc

    @pytest.mark.asyncio
    async def test_no_duration_gives_zero_length_session(self):
        db = _db_for_logging()
        args = {k: v for k, v in LOG_ARGS.items() if k != "durationMinutes"}
        await SessionService(db).log_session(USER_ID, args)

        doc = db.sessionlogs.insert_one.await_args.args[0]
        assert doc["completedAt"] == doc["startedAt"]
        assert doc["actualDuration"] is None


class TestGetSessionHistory:
    @pytest.mark.asyncio
    async def test_queries_sessionlogs_on_started_at(self):
        db = MagicMock()
        cursor = _query_cursor(
            [
                {
                    "_id": LOG_ID,
                    "title": "Morning Push",
                    "startedAt": datetime(2026, 7, 20, 7, 0, 0),
                    "discipline": "strength",
                    "actualDuration": 45,
                    "exercises": [
                        {
                            "exerciseName": "Bench Press",
                            "sets": [{"actualReps": 8, "weight": 60, "rpe": 7}],
                        }
                    ],
                }
            ]
        )
        db.sessionlogs.find = MagicMock(return_value=cursor)
        db.workouts.find = MagicMock(
            side_effect=AssertionError("history must read db.sessionlogs")
        )

        result = await SessionService(db).get_session_history(USER_ID, {"days": 30})

        assert result["success"] is True
        assert result["count"] == 1
        db.sessionlogs.find.assert_called_once()
        query = db.sessionlogs.find.call_args.args[0]
        assert query["userId"] == ObjectId(USER_ID)
        assert "startedAt" in query and "$gte" in query["startedAt"]
        cursor.sort.assert_called_once_with("startedAt", -1)

        workout = result["workouts"][0]
        assert workout["duration"] == 45
        assert workout["exercises"][0]["name"] == "Bench Press"

    @pytest.mark.asyncio
    async def test_status_filter_is_not_advertised(self):
        """A log is a performed session — no status param on either tool."""
        tools = {t["function"]["name"]: t["function"] for t in get_session_tools()}

        for name in ("log_session", "get_session_history"):
            params = tools[name]["parameters"]["properties"]
            assert "status" not in params
            assert "status" not in tools[name]["description"].lower()
