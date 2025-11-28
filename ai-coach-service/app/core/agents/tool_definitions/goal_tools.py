"""
Goal tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_goal_tools() -> List[Dict[str, Any]]:
    """Return goal-related tool definitions"""
    return [
        # ==================== GOAL TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "create_goal",
                "description": "Create a fitness goal for the user to track progress towards.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Goal name (e.g., 'Achieve 10 Pull-ups', 'Hold Handstand for 30s')"
                        },
                        "category": {
                            "type": "string",
                            "enum": ["skill", "performance", "endurance", "strength", "weight", "health"],
                            "description": "Goal category"
                        },
                        "description": {
                            "type": "string",
                            "description": "Detailed description of the goal"
                        },
                        "targetMetrics": {
                            "type": "object",
                            "properties": {
                                "weight": {"type": "number", "description": "Target weight in kg"},
                                "reps": {"type": "integer", "description": "Target reps"},
                                "time": {"type": "integer", "description": "Target time in seconds"},
                                "distance": {"type": "number", "description": "Target distance in meters"}
                            }
                        },
                        "difficulty": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced", "expert"]
                        },
                        "deadline": {
                            "type": "string",
                            "description": "Target completion date (ISO format)"
                        }
                    },
                    "required": ["name", "category"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_goal",
                "description": "Update an existing fitness goal.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "goal_id": {"type": "string", "description": "The ID of the goal to update"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "targetMetrics": {
                            "type": "object",
                            "properties": {
                                "weight": {"type": "number"},
                                "reps": {"type": "integer"},
                                "time": {"type": "integer"},
                                "distance": {"type": "number"}
                            }
                        },
                        "deadline": {"type": "string"},
                        "isActive": {"type": "boolean"}
                    },
                    "required": ["goal_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_goals",
                "description": "List the user's fitness goals.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "enum": ["skill", "performance", "endurance", "strength", "weight", "health"]
                        },
                        "isActive": {
                            "type": "boolean",
                            "description": "Filter by active status"
                        }
                    }
                }
            }
        },
    ]
