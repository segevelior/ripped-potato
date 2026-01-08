"""
Unit and integration tests for self-reflection feature.

Tests cover:
- Trigger detection (_requires_reflection)
- Reflection execution (_reflect_on_response)
- Safety checks (injury conflicts, equipment mismatches)
- Error handling (timeouts, JSON parse errors)
- Helper methods for formatting memories and goals
"""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.agents.orchestrator import AgentOrchestrator
from app.core.agents.reflection_config import REFLECTION_CONFIG


class TestReflectionTrigger:
    """Tests for the _requires_reflection method."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator with mocked dependencies."""
        mock_db = MagicMock()
        with patch.object(AgentOrchestrator, '__init__', lambda self, db, redis_client=None: None):
            orch = AgentOrchestrator.__new__(AgentOrchestrator)
            # Manually set required attributes
            orch.db = mock_db
            return orch

    def test_triggers_on_create_plan(self, orchestrator):
        """Should trigger reflection when create_plan tool is used."""
        # Response needs to be longer than min_response_length
        long_response = "Here's your 4-week training plan..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["create_plan"]
        )
        assert result is True

    def test_triggers_on_create_workout_template(self, orchestrator):
        """Should trigger reflection when create_workout_template tool is used."""
        long_response = "Here's your workout template..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["create_workout_template"]
        )
        assert result is True

    def test_triggers_on_create_goal(self, orchestrator):
        """Should trigger reflection when create_goal tool is used."""
        long_response = "Here's your new fitness goal..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["create_goal"]
        )
        assert result is True

    def test_triggers_on_add_plan_workout(self, orchestrator):
        """Should trigger reflection when add_plan_workout tool is used."""
        long_response = "I've added the workout to your plan..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["add_plan_workout"]
        )
        assert result is True

    def test_skips_non_trigger_tools(self, orchestrator):
        """Should NOT trigger reflection for non-trigger tools."""
        long_response = "Here are your exercises: Squat, Bench Press, Deadlift" + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["list_exercises"]
        )
        assert result is False

    def test_skips_short_responses(self, orchestrator):
        """Should NOT trigger for short responses even with trigger tools."""
        result = orchestrator._requires_reflection(
            response_content="Plan created!",  # < 500 chars
            tools_used=["create_plan"]
        )
        assert result is False

    def test_skips_none_response(self, orchestrator):
        """Should NOT trigger for None response content."""
        result = orchestrator._requires_reflection(
            response_content=None,
            tools_used=["create_plan"]
        )
        assert result is False

    def test_skips_empty_response(self, orchestrator):
        """Should NOT trigger for empty response content."""
        result = orchestrator._requires_reflection(
            response_content="",
            tools_used=["create_plan"]
        )
        assert result is False

    def test_skips_when_disabled(self, orchestrator):
        """Should NOT trigger when reflection is disabled."""
        long_response = "Here's your plan..." + "x" * 600
        with patch.dict(REFLECTION_CONFIG, {"enabled": False}):
            result = orchestrator._requires_reflection(
                response_content=long_response,
                tools_used=["create_plan"]
            )
        assert result is False

    def test_skips_empty_tools_and_no_patterns(self, orchestrator):
        """Should NOT trigger when no tools were used and no content patterns match."""
        long_response = "Here's a general response about fitness..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is False

    def test_triggers_on_content_pattern_sets_of(self, orchestrator):
        """Should trigger when response contains 'sets of' pattern."""
        long_response = "Here's your workout: Do 3 sets of 10 push-ups..." + "x" * 500
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is True

    def test_triggers_on_content_pattern_reps(self, orchestrator):
        """Should trigger when response contains 'reps' pattern."""
        long_response = "Perform 12 reps of each exercise in this circuit..." + "x" * 500
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is True

    def test_triggers_on_content_pattern_day(self, orchestrator):
        """Should trigger when response contains day-based plan."""
        long_response = "Day 1: Upper body focus\nDay 2: Lower body..." + "x" * 500
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is True

    def test_triggers_on_content_pattern_warmup(self, orchestrator):
        """Should trigger when response contains warm-up."""
        long_response = "Start with a warm-up of 5 minutes jogging..." + "x" * 500
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is True

    def test_triggers_on_content_pattern_week(self, orchestrator):
        """Should trigger when response contains week-based plan."""
        long_response = "Week 1: Foundation building\nWeek 2: Progressive overload..." + "x" * 500
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=[]
        )
        assert result is True

    def test_triggers_with_multiple_tools(self, orchestrator):
        """Should trigger if ANY tool in the list is a trigger tool."""
        long_response = "Here's your plan..." + "x" * 600
        result = orchestrator._requires_reflection(
            response_content=long_response,
            tools_used=["list_exercises", "create_plan", "save_memory"]
        )
        assert result is True


class TestReflectionExecution:
    """Tests for the _reflect_on_response method."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator with mocked OpenAI client."""
        mock_db = MagicMock()
        with patch.object(AgentOrchestrator, '__init__', lambda self, db, redis_client=None: None):
            orch = AgentOrchestrator.__new__(AgentOrchestrator)
            orch.db = mock_db
            orch.client = AsyncMock()
            return orch

    @pytest.mark.asyncio
    async def test_catches_injury_conflict(self, orchestrator):
        """Should catch when plan includes exercises targeting injured body part."""
        # Mock LLM response indicating issues found
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content=json.dumps({
                "issues_found": True,
                "issues": ["Plan includes squats but user has knee injury"],
                "revised_response": "Here's a revised plan avoiding knee exercises..."
            })
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await orchestrator._reflect_on_response(
            original_response="Day 1: Squats 5x5, Leg Press 3x12, Lunges 3x10...",
            user_memories=[{"category": "health", "content": "Knee injury from heavy squats"}],
            user_profile={"fitnessLevel": "intermediate", "equipment": ["barbell", "dumbbells"]},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is True
        assert len(result["issues"]) > 0
        assert "knee" in result["issues"][0].lower()
        assert result["revised_response"] is not None

    @pytest.mark.asyncio
    async def test_catches_equipment_mismatch(self, orchestrator):
        """Should catch when plan requires equipment user doesn't have."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content=json.dumps({
                "issues_found": True,
                "issues": ["Plan requires barbell but user only has dumbbells"],
                "revised_response": "Here's a revised plan using only dumbbells..."
            })
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await orchestrator._reflect_on_response(
            original_response="Day 1: Barbell Bench Press 5x5, Barbell Rows 4x8...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": ["dumbbells"]},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is True
        assert "barbell" in result["issues"][0].lower() or "dumbbell" in result["issues"][0].lower()

    @pytest.mark.asyncio
    async def test_passes_valid_plan(self, orchestrator):
        """Should pass a valid plan without issues."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content=json.dumps({
                "issues_found": False,
                "issues": [],
                "revised_response": None
            })
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await orchestrator._reflect_on_response(
            original_response="Day 1: Dumbbell Bench Press 3x10, Dumbbell Rows 3x10...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": ["dumbbells"]},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is False
        assert len(result["issues"]) == 0
        assert result["revised_response"] is None

    @pytest.mark.asyncio
    async def test_returns_original_on_timeout(self, orchestrator):
        """Should return original response if reflection times out."""
        orchestrator.client.chat.completions.create = AsyncMock(
            side_effect=asyncio.TimeoutError()
        )

        result = await orchestrator._reflect_on_response(
            original_response="Some plan...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": []},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is False
        assert result["revised_response"] is None
        assert result["reflection_latency_ms"] == 0

    @pytest.mark.asyncio
    async def test_returns_original_on_json_error(self, orchestrator):
        """Should return original response if JSON parsing fails."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content="This is not valid JSON"
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await orchestrator._reflect_on_response(
            original_response="Some plan...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": []},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is False
        assert result["revised_response"] is None

    @pytest.mark.asyncio
    async def test_returns_original_on_api_error(self, orchestrator):
        """Should return original response if API call fails."""
        orchestrator.client.chat.completions.create = AsyncMock(
            side_effect=Exception("API error")
        )

        result = await orchestrator._reflect_on_response(
            original_response="Some plan...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": []},
            data_context={"goals": []},
        )

        assert result["needs_revision"] is False
        assert result["revised_response"] is None

    @pytest.mark.asyncio
    async def test_uses_config_values(self, orchestrator):
        """Should use config values for temperature and max_tokens."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content=json.dumps({"issues_found": False, "issues": [], "revised_response": None})
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        await orchestrator._reflect_on_response(
            original_response="Some plan...",
            user_memories=[],
            user_profile={"fitnessLevel": "intermediate", "equipment": []},
            data_context={"goals": []},
        )

        # Verify the call used config values
        call_kwargs = orchestrator.client.chat.completions.create.call_args.kwargs
        assert call_kwargs["temperature"] == REFLECTION_CONFIG["temperature"]
        assert call_kwargs["max_tokens"] == REFLECTION_CONFIG["max_tokens"]
        assert call_kwargs["model"] == REFLECTION_CONFIG["model"]

    @pytest.mark.asyncio
    async def test_handles_unknown_fitness_level(self, orchestrator):
        """Should handle unknown fitness level conservatively."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(
            content=json.dumps({"issues_found": False, "issues": [], "revised_response": None})
        ))]
        orchestrator.client.chat.completions.create = AsyncMock(return_value=mock_response)

        await orchestrator._reflect_on_response(
            original_response="Some plan...",
            user_memories=[],
            user_profile={"fitnessLevel": "not set", "equipment": []},
            data_context={"goals": []},
        )

        # Verify the prompt includes conservative guidance
        call_kwargs = orchestrator.client.chat.completions.create.call_args.kwargs
        prompt_content = call_kwargs["messages"][1]["content"]
        assert "BE CONSERVATIVE" in prompt_content or "beginner" in prompt_content.lower()


class TestHelperMethods:
    """Tests for helper formatting methods."""

    @pytest.fixture
    def orchestrator(self):
        """Create orchestrator with mocked dependencies."""
        mock_db = MagicMock()
        with patch.object(AgentOrchestrator, '__init__', lambda self, db, redis_client=None: None):
            orch = AgentOrchestrator.__new__(AgentOrchestrator)
            orch.db = mock_db
            return orch

    def test_format_memories_empty(self, orchestrator):
        """Should return empty string for no memories."""
        result = orchestrator._format_memories_for_reflection([])
        assert result == ""

    def test_format_memories_single(self, orchestrator):
        """Should format single memory correctly."""
        memories = [{"category": "health", "content": "Bad knee from running"}]
        result = orchestrator._format_memories_for_reflection(memories)
        assert "Bad knee from running" in result
        # Should NOT include redundant [health] prefix since memories are pre-filtered
        assert "[health]" not in result

    def test_format_memories_multiple(self, orchestrator):
        """Should format multiple memories correctly."""
        memories = [
            {"category": "health", "content": "Bad knee"},
            {"category": "health", "content": "Shoulder pain"},
        ]
        result = orchestrator._format_memories_for_reflection(memories)
        assert "Bad knee" in result
        assert "Shoulder pain" in result

    def test_format_goals_empty(self, orchestrator):
        """Should return empty string for no goals."""
        result = orchestrator._format_goals_for_reflection([])
        assert result == ""

    def test_format_goals_single(self, orchestrator):
        """Should format single goal correctly."""
        goals = [{"name": "Build Muscle", "description": "Gain 10lbs of muscle"}]
        result = orchestrator._format_goals_for_reflection(goals)
        assert "Build Muscle" in result
        assert "Gain 10lbs of muscle" in result

    def test_format_goals_respects_limit(self, orchestrator):
        """Should respect max_goals_in_context config."""
        max_goals = REFLECTION_CONFIG["max_goals_in_context"]
        goals = [
            {"name": f"Goal {i}", "description": f"Description {i}"}
            for i in range(max_goals + 3)
        ]
        result = orchestrator._format_goals_for_reflection(goals)

        # Should only include up to max_goals
        assert f"Goal {max_goals - 1}" in result
        assert f"Goal {max_goals}" not in result

    def test_format_goals_handles_missing_fields(self, orchestrator):
        """Should handle goals with missing fields gracefully."""
        goals = [{"name": "My Goal"}]  # Missing description
        result = orchestrator._format_goals_for_reflection(goals)
        assert "My Goal" in result


class TestReflectionConfig:
    """Tests for reflection configuration."""

    def test_config_has_required_keys(self):
        """Config should have all required keys."""
        required_keys = [
            "enabled",
            "model",
            "trigger_tools",
            "min_response_length",
            "timeout_seconds",
            "temperature",
            "max_tokens",
            "max_goals_in_context",
            "log_metrics",
        ]
        for key in required_keys:
            assert key in REFLECTION_CONFIG, f"Missing config key: {key}"

    def test_trigger_tools_are_valid(self):
        """Trigger tools should be valid tool names."""
        valid_tools = [
            "create_plan",
            "create_workout_template",
            "create_goal",
            "add_plan_workout",
        ]
        for tool in REFLECTION_CONFIG["trigger_tools"]:
            assert tool in valid_tools, f"Invalid trigger tool: {tool}"

    def test_config_values_are_reasonable(self):
        """Config values should be within reasonable ranges."""
        assert REFLECTION_CONFIG["min_response_length"] >= 100
        assert REFLECTION_CONFIG["min_response_length"] <= 2000
        assert REFLECTION_CONFIG["timeout_seconds"] >= 5
        assert REFLECTION_CONFIG["timeout_seconds"] <= 30
        assert REFLECTION_CONFIG["temperature"] >= 0
        assert REFLECTION_CONFIG["temperature"] <= 1
        assert REFLECTION_CONFIG["max_tokens"] >= 500
        assert REFLECTION_CONFIG["max_tokens"] <= 5000
        assert REFLECTION_CONFIG["max_goals_in_context"] >= 1
        assert REFLECTION_CONFIG["max_goals_in_context"] <= 10
