"""Tests for the coach-question context assembly — the Today dashboard
check-in must be grounded in the calendar (today's scheduled session, last
completed session incl. Strava, next upcoming event), not just Today's Pick."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

import app.api.v1.coach_question as cq

USER_ID = str(ObjectId())

CURRENT_USER = {"user_id": USER_ID, "email": "t@t.co", "username": "t"}

LLM_ANSWER = {"question": "Ready for Endurance 2?", "chips": ["Yes", "Ease it"], "source": "your calendar"}


def _mock_openai(monkeypatch):
    """Patch AsyncOpenAI and capture the messages sent to the LLM."""
    captured = {}

    async def create(**kwargs):
        captured["messages"] = kwargs["messages"]
        response = MagicMock()
        response.choices[0].message.content = json.dumps(LLM_ANSWER)
        return response

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=create)
    monkeypatch.setattr(cq, "AsyncOpenAI", MagicMock(return_value=client))
    return captured


def _patch_flow(monkeypatch, data_context, calendar_result, today="2026-07-26"):
    monkeypatch.setattr("app.main.db", MagicMock())
    monkeypatch.setattr(cq.CoachQuestionService, "get_fresh", AsyncMock(return_value=None))
    monkeypatch.setattr(cq.CoachQuestionService, "save", AsyncMock(return_value=True))
    monkeypatch.setattr(cq.DataReaderAgent, "process", AsyncMock(return_value=data_context))
    monkeypatch.setattr(cq.MemoryService, "get_user_memories", AsyncMock(return_value=[]))
    monkeypatch.setattr(cq.ShortTermContextService, "get_recent", AsyncMock(return_value=[]))
    monkeypatch.setattr(cq.RecommendationService, "get_recent", AsyncMock(return_value=[]))
    monkeypatch.setattr(cq, "spawn_background", lambda coro: coro.close())
    if isinstance(calendar_result, Exception):
        monkeypatch.setattr(
            cq.CalendarService, "get_calendar_events", AsyncMock(side_effect=calendar_result)
        )
    else:
        monkeypatch.setattr(
            cq.CalendarService, "get_calendar_events", AsyncMock(return_value=calendar_result)
        )


def _event(date, title, status="scheduled", **extra):
    return {
        "date": date,
        "dayOfWeek": "Sunday",
        "type": "session",
        "title": title,
        "status": status,
        **extra,
    }


def _prompt(captured):
    return captured["messages"][1]["content"]


DATA_CONTEXT = {
    "user_profile": {"name": "Elior", "timezone": "UTC"},
    "workouts": [],
    "goals": [],
    "plans": [],
    "external_activities": [],
}


class TestCalendarContext:
    @pytest.mark.asyncio
    async def test_todays_scheduled_event_is_in_prompt(self, monkeypatch):
        captured = _mock_openai(monkeypatch)
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        _patch_flow(monkeypatch, DATA_CONTEXT, {
            "success": True,
            "events": [
                _event("2000-01-01", "Old run", status="completed"),
                _event(today, "Endurance 2", duration=60),
                _event("2999-01-01", "Long ride"),
            ],
        })

        result = await cq.get_coach_question(current_user=CURRENT_USER)

        assert result["success"] is True
        prompt = _prompt(captured)
        assert "TODAY'S CALENDAR:" in prompt
        assert '"Endurance 2"' in prompt
        assert "LAST COMPLETED SESSION:" in prompt
        assert '"Old run"' in prompt
        assert "NEXT UPCOMING EVENT:" in prompt
        assert '"Long ride"' in prompt

    @pytest.mark.asyncio
    async def test_empty_calendar_says_nothing_scheduled(self, monkeypatch):
        captured = _mock_openai(monkeypatch)
        _patch_flow(monkeypatch, DATA_CONTEXT, {"success": True, "events": []})

        await cq.get_coach_question(current_user=CURRENT_USER)

        prompt = _prompt(captured)
        assert "nothing scheduled today" in prompt
        assert "none recently" in prompt
        assert "nothing scheduled in the next 14 days" in prompt

    @pytest.mark.asyncio
    async def test_strava_activity_wins_as_last_completed_when_newer(self, monkeypatch):
        captured = _mock_openai(monkeypatch)
        data_context = {
            **DATA_CONTEXT,
            "external_activities": [
                {"date": "2000-01-02", "name": "Morning Run", "sport_type": "Run",
                 "source": "strava", "duration_mins": 42, "distance_km": 8.1},
            ],
        }
        _patch_flow(monkeypatch, data_context, {
            "success": True,
            "events": [_event("2000-01-01", "Old gym session", status="completed")],
        })

        await cq.get_coach_question(current_user=CURRENT_USER)

        prompt = _prompt(captured)
        assert '"Morning Run"' in prompt
        assert "via strava" in prompt
        assert '"Old gym session"' not in prompt

    @pytest.mark.asyncio
    async def test_calendar_failure_does_not_block_question(self, monkeypatch):
        captured = _mock_openai(monkeypatch)
        data_context = {
            **DATA_CONTEXT,
            "external_activities": [
                {"date": "2000-01-02", "name": "Morning Run", "sport_type": "Run",
                 "source": "strava", "duration_mins": 42},
            ],
        }
        _patch_flow(monkeypatch, data_context, RuntimeError("mongo down"))

        result = await cq.get_coach_question(current_user=CURRENT_USER)

        assert result["success"] is True
        assert result.get("fallback") is None
        # Strava-sourced last-completed still surfaces without the calendar
        assert '"Morning Run"' in _prompt(captured)
