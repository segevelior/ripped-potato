"""Sensei chat context — the system prompt must carry calendar anchors
(today's scheduled sessions, last completed, next upcoming) and the pending
dashboard check-in question, so chat never contradicts the calendar or the
Today-screen coach question (e.g. claiming "nothing is scheduled today" from a
stale Today's Pick while two workouts sit on today's calendar)."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.agents.orchestrator import AgentOrchestrator
from app.services.coach_question_service import CoachQuestionService

TODAY = "2026-07-26"
LOCAL_NOW = datetime(2026, 7, 26, 8, 0)


def _event(date, title, status="scheduled", **extra):
    return {
        "date": date,
        "dayOfWeek": "Sunday",
        "type": "workout",
        "title": title,
        "status": status,
        **extra,
    }


def _bound_builder(calendar_result):
    mock_self = MagicMock()
    mock_self.recommendation_service.get_recent = AsyncMock(return_value=[])
    mock_self.short_term_context.get_recent = AsyncMock(return_value=[])
    if isinstance(calendar_result, Exception):
        mock_self.calendar_service.get_calendar_events = AsyncMock(
            side_effect=calendar_result
        )
    else:
        mock_self.calendar_service.get_calendar_events = AsyncMock(
            return_value=calendar_result
        )
    return AgentOrchestrator._build_extra_context.__get__(mock_self)


def _no_pending():
    return patch.object(
        CoachQuestionService, "get_pending_today", AsyncMock(return_value=None)
    )


class TestCalendarAnchors:
    @pytest.mark.asyncio
    async def test_todays_events_and_neighbours_in_context(self):
        build = _bound_builder({
            "success": True,
            "events": [
                _event("2026-07-20", "Easy Reset", status="completed"),
                _event(TODAY, "Endurance 2", duration=70),
                _event(TODAY, "Full-Body Mobility", duration=30),
                _event("2026-07-29", "Long Run"),
            ],
        })
        with _no_pending():
            out = await build("user1", LOCAL_NOW, TODAY)
        assert "TODAY'S CALENDAR" in out
        assert "Endurance 2" in out
        assert "Full-Body Mobility" in out
        assert "Easy Reset" in out  # last completed
        assert "Long Run" in out  # next upcoming
        assert "source of truth" in out

    @pytest.mark.asyncio
    async def test_external_activity_used_as_last_completed(self):
        build = _bound_builder({"success": True, "events": []})
        data_context = {
            "external_activities": [
                {"date": "2026-07-24", "sport_type": "run", "name": "Morning Run",
                 "source": "strava", "duration_mins": 40}
            ]
        }
        with _no_pending():
            out = await build("user1", LOCAL_NOW, TODAY, data_context)
        assert "Morning Run" in out
        assert "via strava" in out

    @pytest.mark.asyncio
    async def test_calendar_failure_omits_anchors_but_keeps_rest(self):
        build = _bound_builder(RuntimeError("calendar down"))
        with _no_pending():
            out = await build("user1", LOCAL_NOW, TODAY)
        assert "TODAY'S CALENDAR" not in out
        # Today's-pick placeholder (no pick mocked) must still be built
        assert "not generated yet" in out


class TestPendingCheckin:
    @pytest.mark.asyncio
    async def test_pending_question_included(self):
        build = _bound_builder({"success": True, "events": []})
        doc = {"localDate": TODAY, "question": "Fresh enough for Endurance 2?"}
        with patch.object(
            CoachQuestionService, "get_pending_today", AsyncMock(return_value=doc)
        ):
            out = await build("user1", LOCAL_NOW, TODAY)
        assert "PENDING DASHBOARD CHECK-IN" in out
        assert "Fresh enough for Endurance 2?" in out

    @pytest.mark.asyncio
    async def test_no_block_without_pending_question(self):
        build = _bound_builder({"success": True, "events": []})
        with _no_pending():
            out = await build("user1", LOCAL_NOW, TODAY)
        assert "PENDING DASHBOARD CHECK-IN" not in out


class TestGetPendingToday:
    @pytest.mark.asyncio
    async def test_returns_doc_only_for_todays_local_date(self):
        from bson import ObjectId

        user_id = str(ObjectId())
        doc = {"localDate": TODAY, "question": "q"}
        collection = MagicMock()
        collection.find_one = AsyncMock(return_value=doc)
        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=collection)

        service = CoachQuestionService(db)
        assert await service.get_pending_today(user_id, TODAY) == doc
        # Yesterday's leftover question must not leak into today's context
        assert await service.get_pending_today(user_id, "2026-07-27") is None

    @pytest.mark.asyncio
    async def test_lookup_failure_returns_none(self):
        from bson import ObjectId

        collection = MagicMock()
        collection.find_one = AsyncMock(side_effect=RuntimeError("mongo down"))
        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=collection)

        service = CoachQuestionService(db)
        assert await service.get_pending_today(str(ObjectId()), TODAY) is None
