"""
Calendar tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_calendar_tools() -> List[Dict[str, Any]]:
    """Return calendar-related tool definitions"""
    return [
        # ==================== CALENDAR TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "schedule_to_calendar",
                "description": "Schedule a workout or event to the user's calendar for a specific date. Use this when the user wants to add a workout to their calendar, schedule a rest day, or plan future training.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in ISO format (YYYY-MM-DD). Use 'today' or 'tomorrow' for relative dates."
                        },
                        "title": {
                            "type": "string",
                            "description": "Title for the calendar event (e.g., 'Upper Body Strength', 'Active Recovery', 'Rest Day')"
                        },
                        "type": {
                            "type": "string",
                            "enum": ["workout", "rest", "deload", "event"],
                            "description": "Type of calendar event"
                        },
                        "workoutDetails": {
                            "type": "object",
                            "description": "Details for workout events",
                            "properties": {
                                "workoutType": {
                                    "type": "string",
                                    "enum": ["strength", "cardio", "hybrid", "recovery", "hiit", "flexibility", "calisthenics", "mobility"],
                                    "description": "Type of workout"
                                },
                                "estimatedDuration": {
                                    "type": "integer",
                                    "description": "Estimated duration in minutes"
                                },
                                "exercises": {
                                    "type": "array",
                                    "description": "Exercises for this workout",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "exerciseName": {"type": "string"},
                                            "targetSets": {"type": "integer"},
                                            "targetReps": {"type": "integer"},
                                            "notes": {"type": "string"}
                                        },
                                        "required": ["exerciseName"]
                                    }
                                }
                            }
                        },
                        "notes": {
                            "type": "string",
                            "description": "Additional notes for the calendar event"
                        }
                    },
                    "required": ["date", "title", "type"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_calendar_events",
                "description": "Get the user's scheduled calendar events for a date range. Use this to check what workouts are already planned.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "startDate": {
                            "type": "string",
                            "description": "Start date in ISO format (YYYY-MM-DD). Default: today"
                        },
                        "endDate": {
                            "type": "string",
                            "description": "End date in ISO format (YYYY-MM-DD). Default: 7 days from start"
                        },
                        "type": {
                            "type": "string",
                            "enum": ["workout", "rest", "deload", "event"],
                            "description": "Filter by event type"
                        }
                    }
                }
            }
        },
    ]
