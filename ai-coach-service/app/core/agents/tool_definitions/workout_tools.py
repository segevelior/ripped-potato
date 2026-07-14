"""
Workout tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_workout_tools() -> List[Dict[str, Any]]:
    """Return workout-related tool definitions"""
    return [
        # ==================== WORKOUT TEMPLATE TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "create_workout_template",
                "description": "Create a reusable workout template (PredefinedWorkout). THIS is what appears under the user's 'Workouts' tab / workout library. Use it whenever the user wants to add or save a whole WORKOUT — one made of multiple exercises/drills — including a workout they upload as an image/screenshot or paste as a list. Do NOT use add_exercise for a multi-exercise workout. Workouts are organized into blocks (Warm-up, Main Work, Finisher, etc.). Refer to exercises by NAME only — ids are resolved server-side against the exercise catalog (close name matches are reused; genuinely new exercises are auto-created). If a name is ambiguous the tool returns candidate matches: ask the user which they meant, then call again with the chosen exact name — or, if the user wants it as a new exercise, call add_exercise for it first and then retry (never repeat the identical call). If a template with the same name already exists the tool refuses and returns its id — reuse that template (schedule it with schedule_to_calendar + workout_template_id) instead of creating a copy. Every block must contain at least one exercise — never create an empty/placeholder template.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Workout template name (e.g., 'Upper Body Push Day', 'Full Body Strength')"
                        },
                        "goal": {
                            "type": "string",
                            "description": "Primary goal of the workout (e.g., 'Build upper body pushing strength')"
                        },
                        "primary_disciplines": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Training disciplines (e.g., ['Calisthenics', 'Strength Training'])"
                        },
                        "estimated_duration": {
                            "type": "integer",
                            "description": "Estimated duration in minutes"
                        },
                        "difficulty_level": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"],
                            "description": "Overall difficulty level"
                        },
                        "confirm_duplicate": {
                            "type": "boolean",
                            "description": "Set true ONLY when the user has explicitly confirmed they want a second template with a name that already exists. Default false — the tool rejects duplicate names and points at the existing template."
                        },
                        "blocks": {
                            "type": "array",
                            "minItems": 1,
                            "description": "Workout blocks (sections) containing exercises",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "description": "Block name (e.g., 'Warm-up', 'Main Work', 'Finisher', 'Cool-down')"
                                    },
                                    "exercises": {
                                        "type": "array",
                                        "minItems": 1,
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "exercise_name": {
                                                    "type": "string",
                                                    "description": "Name of the exercise"
                                                },
                                                "volume": {
                                                    "type": "string",
                                                    "description": "Sets x reps or time (e.g., '3x10', '4x8', '30s', 'AMRAP')"
                                                },
                                                "rest": {
                                                    "type": "string",
                                                    "description": "Rest period (e.g., '60s', '90-120s', '2-3 min')"
                                                },
                                                "notes": {
                                                    "type": "string",
                                                    "description": "Form cues or special instructions"
                                                },
                                                "muscles": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                    "description": "Primary muscle groups (e.g., ['Chest', 'Triceps']). ALWAYS include — used to classify the exercise correctly if it's new to the catalog."
                                                },
                                                "discipline": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                    "description": "Exercise disciplines (e.g., ['Calisthenics']). Include when it differs from the workout's primary_disciplines."
                                                }
                                            },
                                            "required": ["exercise_name", "volume"]
                                        }
                                    }
                                },
                                "required": ["name", "exercises"]
                            }
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Tags for categorization (e.g., ['push', 'upper-body', 'strength'])"
                        }
                    },
                    "required": ["name", "estimated_duration", "difficulty_level", "blocks"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_workout_templates",
                "description": "List available workout templates (PredefinedWorkouts) that can be used in training plans. Returns each template's full exercise list (block, name, volume, rest) — you do NOT need to ask the user what's in a workout.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "discipline": {
                            "type": "string",
                            "description": "Filter by discipline"
                        },
                        "difficulty_level": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"]
                        },
                        "include_common": {
                            "type": "boolean",
                            "description": "Include common/public templates (default: true)"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results (default: 10)"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_workout_template",
                "description": (
                    "Delete the user's OWN workout templates (never common/public ones). "
                    "Use when the user asks to remove/clean up templates. Previews first; "
                    "deletes only when called again with confirm=true. keep_only handles "
                    "'delete everything except X, Y' in one call."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "template_id": {
                            "type": "string",
                            "description": "Delete one template by id."
                        },
                        "name": {
                            "type": "string",
                            "description": "Delete one template by exact name (case-insensitive)."
                        },
                        "keep_only": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Delete ALL of the user's templates EXCEPT these names (case-insensitive)."
                        },
                        "confirm": {
                            "type": "boolean",
                            "description": "Actually delete. Default false = preview only. Set true ONLY after the user confirms the preview."
                        }
                    }
                }
            }
        },
        # ==================== WORKOUT LOG TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "log_workout",
                "description": "Log a completed or planned workout to the user's workout history. Use this to record actual training sessions with sets, reps, weights, and RPE.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Workout title (e.g., 'Morning Push Session', 'Leg Day')"
                        },
                        "date": {
                            "type": "string",
                            "description": "Workout date in ISO format (defaults to today)"
                        },
                        "type": {
                            "type": "string",
                            "enum": ["strength", "cardio", "hybrid", "recovery", "hiit"],
                            "description": "Type of workout"
                        },
                        "status": {
                            "type": "string",
                            "enum": ["planned", "in_progress", "completed", "skipped"],
                            "description": "Workout status (default: completed)"
                        },
                        "durationMinutes": {
                            "type": "integer",
                            "description": "Actual duration in minutes"
                        },
                        "exercises": {
                            "type": "array",
                            "description": "Exercises performed with actual results",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "exerciseName": {
                                        "type": "string",
                                        "description": "Name of the exercise"
                                    },
                                    "sets": {
                                        "type": "array",
                                        "description": "Individual sets performed",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "targetReps": {"type": "integer"},
                                                "actualReps": {"type": "integer"},
                                                "weight": {"type": "number", "description": "Weight in kg"},
                                                "time": {"type": "integer", "description": "Duration in seconds"},
                                                "rpe": {"type": "number", "description": "Rate of Perceived Exertion (1-10)"},
                                                "restSeconds": {"type": "integer"},
                                                "notes": {"type": "string"}
                                            }
                                        }
                                    },
                                    "notes": {"type": "string"}
                                },
                                "required": ["exerciseName", "sets"]
                            }
                        },
                        "notes": {
                            "type": "string",
                            "description": "General workout notes"
                        },
                        "planId": {
                            "type": "string",
                            "description": "Link to training plan if this workout is part of a plan"
                        }
                    },
                    "required": ["title", "type", "exercises"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_workout_history",
                "description": "Get the user's recent workout history to analyze progress and patterns. Returns each workout's full exercise list with sets (target/actual reps, weight, RPE).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "integer",
                            "description": "Number of days to look back (default: 30)"
                        },
                        "type": {
                            "type": "string",
                            "enum": ["strength", "cardio", "hybrid", "recovery", "hiit"],
                            "description": "Filter by workout type"
                        },
                        "status": {
                            "type": "string",
                            "enum": ["planned", "in_progress", "completed", "skipped"],
                            "description": "Filter by status"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results (default: 10)"
                        }
                    }
                }
            }
        },
    ]
