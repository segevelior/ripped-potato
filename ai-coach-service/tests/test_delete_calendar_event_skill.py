"""
Tests for the delete_calendar_event skill (two-step confirm, user-scoped).
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.core.agents.skills.delete_calendar_event_skill import delete_calendar_event

USER_ID = str(ObjectId())
EVENT_ID = ObjectId()


def _ctx(event):
    ctx = MagicMock()
    ctx.db.users.find_one = AsyncMock(return_value=None)  # get_user_today -> UTC
    ctx.db.calendarevents.find_one = AsyncMock(return_value=event)
    ctx.db.calendarevents.delete_one = AsyncMock(
        return_value=MagicMock(deleted_count=1)
    )
    return ctx


def _event(**overrides):
    event = {
        "_id": EVENT_ID,
        "userId": ObjectId(USER_ID),
        "title": "Endurance 1 (Jul 20)",
        "date": datetime(2026, 7, 20),
        "type": "session",
        "status": "scheduled",
    }
    event.update(overrides)
    return event


class TestDeleteCalendarEvent:
    async def test_preview_needs_confirmation_and_no_delete(self):
        ctx = _ctx(_event())
        res = await delete_calendar_event(ctx, USER_ID, {"event_id": str(EVENT_ID)})
        assert res["success"] is True
        assert res["needs_confirmation"] is True
        assert res["would_delete"]["id"] == str(EVENT_ID)
        assert res["would_delete"]["title"] == "Endurance 1 (Jul 20)"
        assert "confirm=true" in res["message"]
        ctx.db.calendarevents.delete_one.assert_not_called()

    async def test_confirm_deletes_user_scoped(self):
        ctx = _ctx(_event())
        res = await delete_calendar_event(
            ctx, USER_ID, {"event_id": str(EVENT_ID), "confirm": True}
        )
        assert res["success"] is True
        assert res["deleted"] == 1
        query = ctx.db.calendarevents.delete_one.call_args[0][0]
        assert query == {"_id": EVENT_ID, "userId": ObjectId(USER_ID)}

    async def test_invalid_id_is_corrective(self):
        ctx = _ctx(_event())
        res = await delete_calendar_event(ctx, USER_ID, {"event_id": "nope"})
        assert res["success"] is False
        assert res["error"] == "invalid_event_id"
        ctx.db.calendarevents.delete_one.assert_not_called()

    async def test_foreign_or_missing_event(self):
        ctx = _ctx(None)
        res = await delete_calendar_event(
            ctx, USER_ID, {"event_id": str(EVENT_ID), "confirm": True}
        )
        assert res["success"] is False
        ctx.db.calendarevents.delete_one.assert_not_called()

    async def test_plan_linked_event_warns_in_preview(self):
        ctx = _ctx(_event(planId=ObjectId()))
        res = await delete_calendar_event(ctx, USER_ID, {"event_id": str(EVENT_ID)})
        assert "training plan" in res["message"]

    async def test_strava_linked_delete_pins_activity_separate(self):
        # Deleting a Strava-linked event must pin the activity 'separate'
        # (else the nightly job can resurrect the deletion as an auto-merge)
        # and write a coach_event_delete audit row.
        activity_id = ObjectId()
        ctx = _ctx(_event(externalActivityId=activity_id))
        ctx.db.externalactivities.find_one = AsyncMock(
            return_value={"_id": activity_id, "matchStatus": "auto", "matchedEventId": EVENT_ID}
        )
        ctx.db.externalactivities.update_one = AsyncMock()
        ctx.db.activitymatchaudits.insert_one = AsyncMock()

        res = await delete_calendar_event(
            ctx, USER_ID, {"event_id": str(EVENT_ID), "confirm": True}
        )
        assert res["success"] is True
        update = ctx.db.externalactivities.update_one.call_args[0][1]
        assert update["$set"] == {"matchStatus": "separate"}
        assert "matchedEventId" in update["$unset"]
        audit = ctx.db.activitymatchaudits.insert_one.call_args[0][0]
        assert audit["action"] == "coach_event_delete"
        assert audit["previous"]["matchStatus"] == "auto"
