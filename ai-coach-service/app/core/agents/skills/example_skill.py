"""
Example skill — worked reference for the skill registry.

This ports the existing `get_calendar_events` tool to the @skill pattern to prove
the infrastructure end-to-end and serve as the copy-paste template for new
skills. It reuses the existing CalendarService via `ctx`, showing that a skill
can delegate to a service rather than reimplementing logic.

Because this registers the name `get_calendar_events`, the orchestrator treats
the skill as the source of truth for that tool (it dedupes the legacy definition
and routes execution to this handler first). Delete this file's import in
__init__.py to fall back to the legacy tool.

To create a new skill, copy this file, change the name/description/parameters,
and write the handler body (hit `ctx.db` directly or call a `ctx.*_service`).
"""

from typing import Any, Dict

from app.core.agents.skills.registry import SkillContext, skill


@skill(
    name="get_calendar_events",
    description=(
        "Get the user's scheduled calendar events for a date range, including each "
        "workout's full exercise list (names, target sets/reps, notes). Use this to "
        "check what workouts are already planned and reason about specific exercises "
        "— you do NOT need to ask the user for their plan."
    ),
    parameters={
        "type": "object",
        "properties": {
            "startDate": {
                "type": "string",
                "description": "Start date in ISO format (YYYY-MM-DD). Default: today",
            },
            "endDate": {
                "type": "string",
                "description": "End date in ISO format (YYYY-MM-DD). Default: 7 days from start",
            },
            "type": {
                "type": "string",
                "enum": ["workout", "rest", "deload", "event"],
                "description": "Filter by event type",
            },
        },
    },
)
async def get_calendar_events(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Delegate to the existing calendar service implementation."""
    return await ctx.calendar_service.get_calendar_events(user_id, args)
