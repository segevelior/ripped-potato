"""
Build a SkillContext outside the orchestrator (train-now lazy resolution, the
internal weekly resolver). Mirrors the orchestrator's construction so skill
handlers behave identically regardless of the entry point.
"""

from openai import AsyncOpenAI

from app.config import get_settings
from app.core.agents.services import (
    CalendarService,
    ExerciseService,
    GoalService,
    MemoryService,
    PlanService,
    SearchService,
    WorkoutService,
)
from app.core.agents.skills.registry import SkillContext


def build_skill_context(db) -> SkillContext:
    settings = get_settings()
    return SkillContext(
        db=db,
        settings=settings,
        exercise_service=ExerciseService(db),
        workout_service=WorkoutService(db),
        plan_service=PlanService(db),
        goal_service=GoalService(db),
        calendar_service=CalendarService(db),
        search_service=SearchService(
            tavily_api_key=settings.tavily_api_key,
            youtube_api_key=settings.youtube_api_key,
            db=db,
        ),
        memory_service=MemoryService(db),
        openai_client=AsyncOpenAI(api_key=settings.openai_api_key),
    )
