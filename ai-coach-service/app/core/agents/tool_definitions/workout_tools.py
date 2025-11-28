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
                "description": "Create a reusable workout template (PredefinedWorkout) that can be used in training plans. Workouts are organized into blocks (Warm-up, Main Work, Finisher, etc.).",
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
                        "blocks": {
                            "type": "array",
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
                "description": "List available workout templates (PredefinedWorkouts) that can be used in training plans.",
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
                "description": "Get the user's recent workout history to analyze progress and patterns.",
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
