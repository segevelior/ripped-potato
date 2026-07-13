"""Tests for RecommendationService prompt rendering (TOR-19: the sensei must
see the Today's Pick — exercises included — and know how to fetch/generate it)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.services.recommendation_service import RecommendationService

TODAY = "2026-07-13"
YESTERDAY = "2026-07-12"


def _rec(local_date=TODAY, rec_type="workout", blocks=True, name="Bodyweight Core + Mobility"):
    suggestion = {
        "type": rec_type,
        "name": name if rec_type == "workout" else "Rest Day",
        "estimated_duration": 30,
        "difficulty_level": "beginner",
    }
    if rec_type == "workout" and blocks:
        suggestion["blocks"] = [
            {"name": "Warm-up", "exercises": [{"exercise_name": "Cat-Cow"}, {"exercise_name": "90/90 Shoulder Rotation"}]},
            {"name": "Main Work", "exercises": [{"exercise_name": "Dead Bug"}, {"exercise_name": "Forearm Plank"}]},
        ]
    return {"localDate": local_date, "suggestion": suggestion, "reasoning": "No workout scheduled; light session fits."}


class TestFormatForPrompt:
    def test_empty_returns_empty_string(self):
        assert RecommendationService.format_for_prompt([], TODAY) == ""

    def test_today_entry_includes_exercises_and_footer(self):
        out = RecommendationService.format_for_prompt([_rec()], TODAY)
        assert "TODAY'S PICK" in out
        assert f"TODAY ({TODAY})" in out
        assert 'Workout "Bodyweight Core + Mobility" (30 min, beginner)' in out
        assert "Warm-up: Cat-Cow, 90/90 Shoulder Rotation" in out
        assert "Main Work: Dead Bug, Forearm Plank" in out
        # Footer tells the model not to say "no workout today"
        assert "do NOT tell the user they have no workout" in out
        assert "get_daily_recommendation" in out

    def test_yesterday_stays_one_line_without_exercises(self):
        out = RecommendationService.format_for_prompt([_rec(local_date=YESTERDAY)], TODAY)
        assert YESTERDAY in out
        assert "Cat-Cow" not in out
        # No today pick -> no footer
        assert "do NOT tell the user" not in out

    def test_rest_day_renders_without_exercises_or_footer(self):
        out = RecommendationService.format_for_prompt([_rec(rec_type="rest")], TODAY)
        assert "Rest Day" in out
        assert "Cat-Cow" not in out
        assert "do NOT tell the user" not in out

    def test_exercise_names_are_capped(self):
        many = {
            "localDate": TODAY,
            "reasoning": "",
            "suggestion": {
                "type": "workout",
                "name": "Mega Session",
                "blocks": [{
                    "name": "Main Work",
                    "exercises": [{"exercise_name": f"Exercise {i}"} for i in range(30)],
                }],
            },
        }
        out = RecommendationService.format_for_prompt([many], TODAY)
        cap = RecommendationService.MAX_PROMPT_EXERCISE_NAMES
        assert f"Exercise {cap - 1}" in out
        assert f"Exercise {cap}" not in out
        assert "…" in out

    def test_no_ellipsis_when_names_exactly_fill_the_cap(self):
        cap = RecommendationService.MAX_PROMPT_EXERCISE_NAMES
        exact = {
            "localDate": TODAY,
            "reasoning": "",
            "suggestion": {
                "type": "workout",
                "name": "Exact Session",
                "blocks": [{
                    "name": "Main Work",
                    "exercises": [{"exercise_name": f"Exercise {i}"} for i in range(cap)],
                }],
            },
        }
        out = RecommendationService.format_for_prompt([exact], TODAY)
        assert f"Exercise {cap - 1}" in out
        assert "…" not in out
        assert "more exercises not shown" not in out

    def test_cap_exhausted_before_a_later_block_notes_hidden_exercises(self):
        cap = RecommendationService.MAX_PROMPT_EXERCISE_NAMES
        two_blocks = {
            "localDate": TODAY,
            "reasoning": "",
            "suggestion": {
                "type": "workout",
                "name": "Long Session",
                "blocks": [
                    {"name": "Main Work",
                     "exercises": [{"exercise_name": f"Exercise {i}"} for i in range(cap)]},
                    {"name": "Cool-down",
                     "exercises": [{"exercise_name": "Child's Pose"}]},
                ],
            },
        }
        out = RecommendationService.format_for_prompt([two_blocks], TODAY)
        assert "Child's Pose" not in out
        assert "more exercises not shown" in out

    def test_today_and_yesterday_together(self):
        out = RecommendationService.format_for_prompt(
            [_rec(), _rec(local_date=YESTERDAY, name="Old Pick")], TODAY
        )
        assert "Bodyweight Core + Mobility" in out
        assert "Old Pick" in out


class TestPlaceholderForPrompt:
    def test_mentions_date_and_tool(self):
        out = RecommendationService.placeholder_for_prompt(TODAY)
        assert TODAY in out
        assert "get_daily_recommendation" in out
        assert out.startswith("TODAY'S PICK")


class TestGetRecentProjection:
    @pytest.mark.asyncio
    async def test_projection_includes_block_and_exercise_names(self):
        collection = MagicMock()
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        collection.find.return_value = cursor
        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=collection)

        service = RecommendationService(db)
        user_id = str(ObjectId())
        await service.get_recent(user_id, [TODAY, YESTERDAY])

        _, projection = collection.find.call_args[0]
        assert projection["suggestion.blocks.name"] == 1
        assert projection["suggestion.blocks.exercises.exercise_name"] == 1
        assert projection["suggestion.name"] == 1

    @pytest.mark.asyncio
    async def test_fetch_error_returns_none_not_empty_list(self):
        # None = lookup failed; callers must not read it as "no picks exist".
        collection = MagicMock()
        collection.find = MagicMock(side_effect=RuntimeError("mongo down"))
        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=collection)

        service = RecommendationService(db)
        result = await service.get_recent(str(ObjectId()), [TODAY])
        assert result is None


class TestBuildExtraContext:
    """Orchestrator._build_extra_context: today's pick block when present,
    placeholder when missing (called with a mock self to skip the heavy ctor)."""

    def _self(self, recs):
        from app.core.agents.orchestrator import AgentOrchestrator

        mock_self = MagicMock()
        mock_self.recommendation_service.get_recent = AsyncMock(return_value=recs)
        mock_self.short_term_context.get_recent = AsyncMock(return_value=[])
        return AgentOrchestrator._build_extra_context.__get__(mock_self)

    @pytest.mark.asyncio
    async def test_placeholder_when_no_pick_today(self):
        from datetime import datetime

        build = self._self([_rec(local_date=YESTERDAY)])
        out = await build("user1", datetime(2026, 7, 13, 14, 0), TODAY)
        assert "not generated yet" in out
        assert "get_daily_recommendation" in out

    @pytest.mark.asyncio
    async def test_full_block_and_no_placeholder_when_pick_exists(self):
        from datetime import datetime

        build = self._self([_rec()])
        out = await build("user1", datetime(2026, 7, 13, 14, 0), TODAY)
        assert "Bodyweight Core + Mobility" in out
        assert "Cat-Cow" in out
        assert "not generated yet" not in out

    @pytest.mark.asyncio
    async def test_fetch_failure_omits_block_and_placeholder(self):
        # get_recent -> None means the lookup failed; the context must not
        # falsely claim no pick was generated today.
        from datetime import datetime

        build = self._self(None)
        out = await build("user1", datetime(2026, 7, 13, 14, 0), TODAY)
        assert "not generated yet" not in out
        assert "TODAY'S PICK" not in out
