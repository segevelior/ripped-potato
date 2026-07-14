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
        "type": "workout",
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
