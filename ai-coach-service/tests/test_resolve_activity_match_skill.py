"""
Tests for the resolve_activity_match skill (two-step confirm; writes go
through the backend internal client, never direct Mongo).
"""
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from app.core.agents.skills.resolve_activity_match_skill import resolve_activity_match

USER_ID = str(ObjectId())
ACTIVITY_ID = ObjectId()
EVENT_ID = ObjectId()


def _activity(**overrides):
    activity = {
        "_id": ACTIVITY_ID,
        "userId": ObjectId(USER_ID),
        "name": "Morning Run",
        "sportType": "Run",
        "startDate": datetime(2026, 7, 29, 18, 30),
        "matchStatus": "pending",
    }
    activity.update(overrides)
    return activity


def _event(**overrides):
    event = {
        "_id": EVENT_ID,
        "userId": ObjectId(USER_ID),
        "title": "Endurance 1",
        "type": "session",
        "status": "scheduled",
    }
    event.update(overrides)
    return event


def _ctx(activity=None, event=None):
    ctx = MagicMock()
    ctx.db.externalactivities.find_one = AsyncMock(return_value=activity)
    ctx.db.calendarevents.find_one = AsyncMock(return_value=event)
    return ctx


class TestResolveActivityMatch:
    async def test_merge_preview_needs_confirmation_and_no_backend_call(self):
        ctx = _ctx(_activity(), _event())
        with patch(
            "app.core.agents.skills.resolve_activity_match_skill.backend_resolve",
            new=AsyncMock(),
        ) as backend:
            res = await resolve_activity_match(
                ctx, USER_ID,
                {"activity_id": str(ACTIVITY_ID), "resolution": "merge", "event_id": str(EVENT_ID)},
            )
        assert res["success"] is True
        assert res["needs_confirmation"] is True
        assert res["would_resolve"]["event_title"] == "Endurance 1"
        assert "confirm=true" in res["message"]
        backend.assert_not_called()

    async def test_confirm_merge_calls_backend(self):
        ctx = _ctx(_activity(), _event())
        backend = AsyncMock(return_value={"success": True, "eventTitle": "Endurance 1"})
        with patch(
            "app.core.agents.skills.resolve_activity_match_skill.backend_resolve",
            new=backend,
        ):
            res = await resolve_activity_match(
                ctx, USER_ID,
                {"activity_id": str(ACTIVITY_ID), "resolution": "merge",
                 "event_id": str(EVENT_ID), "confirm": True},
            )
        assert res["success"] is True
        backend.assert_awaited_once_with(
            user_id=USER_ID,
            activity_id=str(ACTIVITY_ID),
            resolution="merge",
            event_id=str(EVENT_ID),
        )

    async def test_backend_refusal_is_relayed(self):
        ctx = _ctx(_activity(), _event())
        backend = AsyncMock(return_value={"success": False, "reason": "event_already_linked"})
        with patch(
            "app.core.agents.skills.resolve_activity_match_skill.backend_resolve",
            new=backend,
        ):
            res = await resolve_activity_match(
                ctx, USER_ID,
                {"activity_id": str(ACTIVITY_ID), "resolution": "merge",
                 "event_id": str(EVENT_ID), "confirm": True},
            )
        assert res["success"] is False
        assert res["error"] == "event_already_linked"

    async def test_merge_without_event_id_is_corrective(self):
        ctx = _ctx(_activity())
        res = await resolve_activity_match(
            ctx, USER_ID, {"activity_id": str(ACTIVITY_ID), "resolution": "merge"}
        )
        assert res["success"] is False
        assert res["error"] == "invalid_event_id"

    async def test_separate_does_not_need_event(self):
        ctx = _ctx(_activity())
        backend = AsyncMock(return_value={"success": True})
        with patch(
            "app.core.agents.skills.resolve_activity_match_skill.backend_resolve",
            new=backend,
        ):
            res = await resolve_activity_match(
                ctx, USER_ID,
                {"activity_id": str(ACTIVITY_ID), "resolution": "separate", "confirm": True},
            )
        assert res["success"] is True
        backend.assert_awaited_once_with(
            user_id=USER_ID,
            activity_id=str(ACTIVITY_ID),
            resolution="separate",
            event_id=None,
        )

    async def test_unknown_activity(self):
        ctx = _ctx(activity=None)
        res = await resolve_activity_match(
            ctx, USER_ID, {"activity_id": str(ObjectId()), "resolution": "separate"}
        )
        assert res["success"] is False

    async def test_invalid_ids_are_corrective(self):
        ctx = _ctx(_activity())
        res = await resolve_activity_match(
            ctx, USER_ID, {"activity_id": "not-an-id", "resolution": "merge"}
        )
        assert res["success"] is False
        assert res["error"] == "invalid_activity_id"

        res = await resolve_activity_match(
            ctx, USER_ID, {"activity_id": str(ACTIVITY_ID), "resolution": "delete"}
        )
        assert res["success"] is False
        assert res["error"] == "invalid_resolution"
