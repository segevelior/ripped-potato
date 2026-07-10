"""
Skill registry for the AI coach.

A "skill" is a self-contained tool: its OpenAI function definition and its async
handler live together in one file and register themselves via the @skill
decorator. This removes the three-places-to-edit friction of the legacy tool
system (schema dict in tool_definitions/*.py + service method + routing entry in
orchestrator._execute_tool).

To add a skill: create a module under app/core/agents/skills/, decorate an async
handler with @skill(...), and import that module in skills/__init__.py. Nothing
else needs to change - the orchestrator picks it up automatically.

Handler contract:
    @skill(name="my_skill", description="...", parameters={...json-schema...})
    async def my_skill(ctx: SkillContext, user_id: str, args: dict) -> dict:
        ...
        return {"success": True, "message": "...", ...}

`ctx` gives handlers access to shared resources (db, settings, and the existing
services) so a skill can either hit Mongo directly or reuse a service method.
"""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, TYPE_CHECKING

import structlog

if TYPE_CHECKING:  # avoid import cycles at runtime
    from motor.motor_asyncio import AsyncIOMotorDatabase
    from app.config import Settings
    from app.core.agents.services import (
        ExerciseService,
        WorkoutService,
        PlanService,
        GoalService,
        CalendarService,
        SearchService,
        MemoryService,
    )

logger = structlog.get_logger()

# A skill handler: (context, user_id, args) -> result dict
SkillHandler = Callable[["SkillContext", str, Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class SkillContext:
    """Shared resources handed to every skill handler.

    Lets a skill reach the database, settings, existing services, and the shared
    OpenAI client without re-wiring anything in the orchestrator.
    """

    db: "AsyncIOMotorDatabase"
    settings: "Settings"
    exercise_service: "ExerciseService"
    workout_service: "WorkoutService"
    plan_service: "PlanService"
    goal_service: "GoalService"
    calendar_service: "CalendarService"
    search_service: "SearchService"
    memory_service: "MemoryService"
    # Shared AsyncOpenAI client, for skills that make their own LLM calls
    # (generate_plan, suggest_exercises, ...). Optional so DB-only skills and
    # tests need not provide it.
    openai_client: Any = None


class SkillRegistry:
    """Holds registered skills: name -> {definition, handler}."""

    def __init__(self) -> None:
        self._definitions: Dict[str, Dict[str, Any]] = {}
        self._handlers: Dict[str, SkillHandler] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: SkillHandler,
    ) -> None:
        if name in self._handlers:
            raise ValueError(f"Skill '{name}' is already registered")

        self._definitions[name] = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters,
            },
        }
        self._handlers[name] = handler
        logger.info("Registered skill", skill=name)

    def get_definitions(self) -> List[Dict[str, Any]]:
        """OpenAI tool-definition dicts for all registered skills."""
        return list(self._definitions.values())

    def get_handler(self, name: str) -> Optional[SkillHandler]:
        return self._handlers.get(name)

    def names(self) -> List[str]:
        return list(self._handlers.keys())


# Module-level singleton - shared across the process.
registry = SkillRegistry()


def skill(name: str, description: str, parameters: Dict[str, Any]) -> Callable[[SkillHandler], SkillHandler]:
    """Decorator that registers an async handler as a skill.

    The decorated function is returned unchanged so it can still be called or
    unit-tested directly.
    """

    def decorator(handler: SkillHandler) -> SkillHandler:
        registry.register(name, description, parameters, handler)
        return handler

    return decorator


def get_skill_definitions() -> List[Dict[str, Any]]:
    return registry.get_definitions()


def get_skill_handler(name: str) -> Optional[SkillHandler]:
    return registry.get_handler(name)


def get_skill_names() -> List[str]:
    return registry.names()
