"""
Training plan tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_plan_tools() -> List[Dict[str, Any]]:
    """Return training plan-related tool definitions"""
    return [
        # ==================== TRAINING PLAN TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "create_plan",
                "description": "Create a new multi-week training plan for the user. Plans contain weekly workout schedules that can reference workout templates or define custom workouts.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Plan name (e.g., '8-Week Strength Program', 'Beginner Calisthenics Journey')"
                        },
                        "description": {
                            "type": "string",
                            "description": "Plan description and goals"
                        },
                        "goalId": {
                            "type": "string",
                            "description": "Link to a fitness goal this plan supports"
                        },
                        "schedule": {
                            "type": "object",
                            "description": "Plan schedule configuration",
                            "properties": {
                                "weeksTotal": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "maximum": 52,
                                    "description": "Total number of weeks"
                                },
                                "workoutsPerWeek": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "maximum": 7,
                                    "description": "Target workouts per week"
                                },
                                "restDays": {
                                    "type": "array",
                                    "items": {"type": "integer", "minimum": 0, "maximum": 6},
                                    "description": "Preferred rest days (0=Sunday, 6=Saturday)"
                                },
                                "preferredWorkoutDays": {
                                    "type": "array",
                                    "items": {"type": "integer", "minimum": 0, "maximum": 6},
                                    "description": "Preferred workout days"
                                }
                            },
                            "required": ["weeksTotal", "workoutsPerWeek"]
                        },
                        "weeks": {
                            "type": "array",
                            "description": "Weekly workout definitions",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "weekNumber": {"type": "integer", "minimum": 1},
                                    "focus": {"type": "string", "description": "Weekly focus (e.g., 'Volume', 'Intensity', 'Deload')"},
                                    "description": {"type": "string"},
                                    "deloadWeek": {"type": "boolean", "description": "Is this a deload/recovery week?"},
                                    "workouts": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "dayOfWeek": {"type": "integer", "minimum": 0, "maximum": 6},
                                                "workoutType": {"type": "string", "enum": ["predefined", "custom"]},
                                                "predefinedWorkoutId": {"type": "string"},
                                                "customWorkout": {
                                                    "type": "object",
                                                    "properties": {
                                                        "title": {"type": "string"},
                                                        "type": {"type": "string", "enum": ["strength", "cardio", "hybrid", "recovery", "hiit"]},
                                                        "durationMinutes": {"type": "integer"},
                                                        "exercises": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "object",
                                                                "properties": {
                                                                    "exerciseName": {"type": "string"},
                                                                    "sets": {
                                                                        "type": "array",
                                                                        "items": {
                                                                            "type": "object",
                                                                            "properties": {
                                                                                "reps": {"type": "integer"},
                                                                                "time": {"type": "integer"},
                                                                                "weight": {"type": "number"},
                                                                                "restSeconds": {"type": "integer"}
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                },
                                                "notes": {"type": "string"},
                                                "isOptional": {"type": "boolean"}
                                            },
                                            "required": ["dayOfWeek", "workoutType"]
                                        }
                                    }
                                },
                                "required": ["weekNumber"]
                            }
                        },
                        "settings": {
                            "type": "object",
                            "properties": {
                                "autoAdvance": {"type": "boolean", "description": "Automatically advance to next week"},
                                "allowModifications": {"type": "boolean", "description": "Allow user to modify workouts"},
                                "sendReminders": {"type": "boolean"},
                                "difficultyAdjustment": {"type": "string", "enum": ["auto", "manual", "none"]}
                            }
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["name", "schedule"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_plans",
                "description": "List the user's training plans.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["draft", "active", "paused", "completed", "abandoned"],
                            "description": "Filter by status"
                        },
                        "include_templates": {
                            "type": "boolean",
                            "description": "Include plan templates (default: false)"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_plan",
                "description": "Update a training plan's details, schedule, or status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string", "description": "The ID of the plan to update"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "status": {"type": "string", "enum": ["draft", "active", "paused", "completed", "abandoned"]},
                        "startDate": {"type": "string", "description": "ISO date string"},
                        "goalId": {"type": "string"},
                        "schedule": {
                            "type": "object",
                            "properties": {
                                "weeksTotal": {"type": "integer", "minimum": 1, "maximum": 52},
                                "workoutsPerWeek": {"type": "integer", "minimum": 1, "maximum": 7},
                                "restDays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}},
                                "preferredWorkoutDays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}}
                            }
                        }
                    },
                    "required": ["plan_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "add_plan_workout",
                "description": "Add a workout to a specific week and day in a training plan.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "weekNumber": {"type": "integer", "minimum": 1},
                        "dayOfWeek": {"type": "integer", "minimum": 0, "maximum": 6, "description": "0=Sunday, 6=Saturday"},
                        "workoutType": {"type": "string", "enum": ["predefined", "custom"]},
                        "predefinedWorkoutId": {"type": "string", "description": "Required if workoutType is 'predefined'"},
                        "customWorkout": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "type": {"type": "string", "enum": ["strength", "cardio", "hybrid", "recovery", "hiit"]},
                                "durationMinutes": {"type": "integer"},
                                "exercises": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "exerciseName": {"type": "string"},
                                            "sets": {
                                                "type": "array",
                                                "items": {
                                                    "type": "object",
                                                    "properties": {
                                                        "reps": {"type": "integer"},
                                                        "time": {"type": "integer"},
                                                        "weight": {"type": "number"},
                                                        "restSeconds": {"type": "integer"}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "notes": {"type": "string"},
                        "isOptional": {"type": "boolean"}
                    },
                    "required": ["plan_id", "weekNumber", "dayOfWeek", "workoutType"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "remove_plan_workout",
                "description": "Remove a workout from a specific week in a training plan.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "weekNumber": {"type": "integer", "minimum": 1},
                        "workoutIndex": {"type": "integer", "description": "Index of workout in the week's workouts array"},
                        "weeklyWorkoutId": {"type": "string", "description": "Or the _id of the workout subdocument"}
                    },
                    "required": ["plan_id", "weekNumber"]
                }
            }
        },
    ]
