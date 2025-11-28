"""
Tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List

from .exercise_tools import get_exercise_tools
from .workout_tools import get_workout_tools
from .plan_tools import get_plan_tools
from .goal_tools import get_goal_tools
from .calendar_tools import get_calendar_tools
from .search_tools import get_search_tools
from .memory_tools import get_memory_tools


def get_all_tools() -> List[Dict[str, Any]]:
    """Combine all tool definitions into a single list"""
    return (
        get_exercise_tools() +
        get_workout_tools() +
        get_plan_tools() +
        get_goal_tools() +
        get_calendar_tools() +
        get_search_tools() +
        get_memory_tools()
    )


__all__ = [
    "get_all_tools",
    "get_exercise_tools",
    "get_workout_tools",
    "get_plan_tools",
    "get_goal_tools",
    "get_calendar_tools",
    "get_search_tools",
    "get_memory_tools",
]
