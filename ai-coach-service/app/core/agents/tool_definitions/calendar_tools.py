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
                "description": "Schedule a workout or event to the user's calendar for a specific date. Two modes for 'workout'/'deload' events: (1) EXISTING library workout — pass workout_template_id (find it first with grep_workouts / list_workout_templates); the event uses that template's exercises and links to it, nothing new is created. PREFERRED whenever the user asks to schedule a workout they already have by name — never re-type its exercises inline. (2) New one-off session — plan the full session and pass it in workoutDetails.exercises; the tool saves it to the user's workout library (Workouts tab) and links the calendar event to it automatically. Never schedule a bare title. Refuses to double-book: if an equivalent event already exists on that date it returns already_scheduled instead of writing. Defaults to a dry-run PREVIEW that writes nothing and shows how each exercise name matched the user's exercise catalog. Present the preview to the user; ONLY after they confirm, call again with the same arguments plus dry_run=false to actually write. If the user declines the preview, do NOT call again.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in ISO format (YYYY-MM-DD). Use 'today' or 'tomorrow' for relative dates (resolved in the user's timezone)."
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
                        "workout_template_id": {
                            "type": "string",
                            "description": "ID of an EXISTING workout template from the user's library (take it from a list_workout_templates / grep_workouts result in THIS conversation — never invent one). When set, the event uses that template's exercises and links to it; omit workoutDetails. PREFERRED whenever the user asks to schedule a workout they already have by name."
                        },
                        "allow_duplicate": {
                            "type": "boolean",
                            "description": "Default false: if a same-titled or same-template event already exists on the target date the tool refuses with already_scheduled. Set true ONLY if the user explicitly wants a second session of the same workout that day."
                        },
                        "workoutDetails": {
                            "type": "object",
                            "description": "Details for a NEW one-off workout session. REQUIRED (with a non-empty exercises list) for type 'workout' and 'deload' unless workout_template_id is set.",
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
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "exerciseName": {"type": "string"},
                                            "targetSets": {"type": "integer"},
                                            "targetReps": {"type": "integer"},
                                            "notes": {"type": "string"},
                                            "muscles": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "description": "Primary muscle groups — ALWAYS include; classifies the exercise correctly if it's new to the catalog."
                                            },
                                            "equipment": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "description": "Equipment needed (empty for bodyweight)."
                                            }
                                        },
                                        "required": ["exerciseName"]
                                    }
                                }
                            },
                            "required": ["exercises"]
                        },
                        "notes": {
                            "type": "string",
                            "description": "Additional notes for the calendar event"
                        },
                        "dry_run": {
                            "type": "boolean",
                            "description": "Preview only, no writes. Default true. Set false ONLY after the user has confirmed the preview."
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
                "description": "Get the user's scheduled calendar events for a date range. Use this to check what workouts are already planned. The result echoes `today` (the user's local date) and labels every event with `relativeDay` (today/tomorrow/yesterday/in N days) — trust those labels.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "startDate": {
                            "type": "string",
                            "description": "Start date in ISO format (YYYY-MM-DD). Default: yesterday (user-local), so recently missed sessions are included"
                        },
                        "endDate": {
                            "type": "string",
                            "description": "End date in ISO format (YYYY-MM-DD). Default: 7 days from today"
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
