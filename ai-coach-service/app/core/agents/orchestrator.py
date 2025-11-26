"""
Enhanced Agent Orchestrator - OpenAI with comprehensive fitness tools
"""

import json
from typing import Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timedelta

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent

logger = structlog.get_logger()

# System prompt used by the AI coach - shared across streaming and non-streaming endpoints
SYSTEM_PROMPT = """You are an expert AI fitness coach helping users manage their personalized fitness journey. All data you create is personal to this specific user.

TOOL USAGE GUIDELINES:

**Exercises** (User's personal exercise library):
- `list_exercises`: Use this to find exercises. KEY FILTERS:
  - `muscle`: Filter by muscle GROUP (e.g., "Core", "Back", "Chest", "Legs", "Shoulders", "Arms", "Hamstrings", "Glutes", "Quadriceps"). USE THIS when user asks about exercises for a body part! This searches BOTH primary AND secondary muscles.
  - `discipline`: Filter by training type (e.g., "Calisthenics", "Strength Training")
  - `difficulty`: Filter by level ("beginner", "intermediate", "advanced")
  - `equipment`: Filter by equipment needed
  - `name`: Search by exercise name
- `add_exercise`: Add exercises the user can perform. IMPORTANT: Always search first to check if the exercise already exists!

**Grep Tools** (Pattern-matching search for specific exercise names):
- `grep_exercises`: Use this when searching for SPECIFIC exercise names (e.g., "toes to bar", "muscle up"). Good for checking if an exercise exists before adding.
- `grep_workouts`: Search workout templates by name/goal patterns.

WHEN USER ASKS ABOUT EXERCISES BY MUSCLE GROUP (e.g., "what core exercises do I have?", "show me back exercises", "hamstring exercises"):
→ Use `list_exercises` with the `muscle` parameter, NOT grep_exercises!
→ "Core", "Back", "Chest", "Legs", "Hamstrings", "Glutes" etc. are MUSCLE GROUPS, not exercise names.
→ The muscle filter searches BOTH primary AND secondary muscles - so compound exercises like Deadlifts will show up for "Hamstrings" even if hamstrings is a secondary muscle.

**Workout Templates** (Reusable workout designs):
- `create_workout_template`: Create workout templates with blocks (Warm-up, Main Work, Finisher, etc.). These are saved to the user's library and can be reused in training plans.
- `list_workout_templates`: Find existing workout templates.

**Workout Logging** (Training history):
- `log_workout`: Record completed or planned workouts with actual sets, reps, weights, and RPE. This is the user's training log.
- `get_workout_history`: View past workouts to analyze progress.

**Training Plans** (Multi-week programs):
- `create_plan`: Create structured training plans with weekly schedules. Plans can use workout templates or define custom workouts inline.
- `list_plans`: View user's existing plans.
- `update_plan`: Modify plan details or status.
- `add_plan_workout` / `remove_plan_workout`: Manage workouts within plan weeks.

**Goals**:
- `create_goal`: Set fitness goals with target metrics.
- `update_goal`: Update goal progress or details.
- `list_goals`: View user's goals.

**Calendar** (Scheduling workouts):
- `schedule_to_calendar`: Schedule a workout or event to a specific date. Use this when user wants to add a workout to their calendar. Supports 'today', 'tomorrow', or ISO dates.
- `get_calendar_events`: Check what's already scheduled on the user's calendar.

CALENDAR WORKFLOW:
When user asks to add/schedule a workout for a specific date:
1. Design the workout and get user approval
2. Call `schedule_to_calendar` with the workout details (title, date, workoutDetails with exercises)
3. The `schedule_to_calendar` tool creates the calendar event directly - it does NOT need a template first
4. If for today, ask if they want to start training now

IMPORTANT PRINCIPLES:
1. MUSCLE GROUP vs EXERCISE NAME: "Core", "Back", "Chest", "Hamstrings" are muscle groups - use list_exercises with muscle filter. "Plank", "Pull-up", "Deadlift" are exercise names - use grep_exercises.
2. SECONDARY MUSCLES MATTER: When user asks about exercises for a muscle group, remember that compound exercises target multiple muscles. For example, Deadlifts primarily work the back but ALSO work hamstrings and glutes. The list_exercises tool searches BOTH primary AND secondary muscles, so include these results!
3. VERIFY BEFORE ANSWERING: Before saying "you don't have any X exercises", thoroughly check the search results including exercises where X is a secondary muscle.
4. ALWAYS search before adding exercises to avoid duplicates!
5. ONLY report exercises that actually exist in the database - NEVER hallucinate or make up exercises!
6. Everything CREATED is PERSONAL to this user (isCommon=false, createdBy=userId)
7. When creating workouts/exercises, match user's fitness level and available equipment
8. Use proper volume/intensity based on user's fitness level
9. If user mentions they "can do" an exercise, check if it exists first, then add if missing
10. Be conversational and encouraging while being precise with data"""


class AgentOrchestrator:
    """Enhanced orchestrator with comprehensive fitness management tools"""

    def __init__(self, db: AsyncIOMotorDatabase, redis_client=None):
        self.db = db
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        self.data_reader = DataReaderAgent(db)
        
    def get_tools(self) -> List[Dict[str, Any]]:
        """Define available tools for the LLM - comprehensive fitness management"""
        return [
            # ==================== EXERCISE TOOLS ====================
            {
                "type": "function",
                "function": {
                    "name": "add_exercise",
                    "description": "Add a new exercise to the user's personal exercise library. Use this when a user mentions they can do an exercise or wants to track a specific movement.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Exercise name (e.g., 'Muscle Ups', 'Weighted Dips', 'Archer Pull-ups')"
                            },
                            "muscles": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Primary muscles worked (e.g., ['Chest', 'Triceps', 'Shoulders'])"
                            },
                            "secondaryMuscles": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Secondary muscles involved (e.g., ['Core', 'Forearms'])"
                            },
                            "discipline": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Training disciplines (e.g., ['Calisthenics', 'Strength Training', 'Powerlifting'])"
                            },
                            "difficulty": {
                                "type": "string",
                                "enum": ["beginner", "intermediate", "advanced"],
                                "description": "Difficulty level based on strength/skill requirements"
                            },
                            "equipment": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Equipment needed (e.g., ['Pull-up Bar', 'Dip Bars', 'Rings'] or [] for bodyweight)"
                            },
                            "description": {
                                "type": "string",
                                "description": "Brief description of the exercise and its benefits"
                            },
                            "instructions": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Step-by-step instructions for proper form"
                            },
                            "strain": {
                                "type": "object",
                                "properties": {
                                    "intensity": {
                                        "type": "string",
                                        "enum": ["low", "moderate", "high", "max"],
                                        "description": "How demanding the exercise is"
                                    },
                                    "load": {
                                        "type": "string",
                                        "enum": ["bodyweight", "light", "moderate", "heavy"],
                                        "description": "Typical loading pattern"
                                    },
                                    "durationType": {
                                        "type": "string",
                                        "enum": ["reps", "time", "distance"],
                                        "description": "How the exercise is measured"
                                    },
                                    "typicalVolume": {
                                        "type": "string",
                                        "description": "Typical volume (e.g., '3x8', '30 seconds', '5x5')"
                                    }
                                }
                            }
                        },
                        "required": ["name", "muscles", "discipline", "difficulty"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_exercises",
                    "description": "Search and list available exercises from the database. Use this to find exercises by muscle group, discipline, or difficulty. Searches BOTH primary AND secondary muscles - so compound exercises like Deadlifts will appear when filtering for 'Hamstrings' even if it's a secondary muscle.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Search by exercise name (e.g., 'toes to bar', 'pull-up', 'muscle up')"
                            },
                            "muscle": {
                                "type": "string",
                                "description": "Filter by muscle group (e.g., 'Chest', 'Back', 'Legs', 'Core', 'Hamstrings', 'Glutes'). Searches BOTH primary AND secondary muscles!"
                            },
                            "discipline": {
                                "type": "string",
                                "description": "Filter by discipline (e.g., 'Calisthenics', 'Strength Training')"
                            },
                            "difficulty": {
                                "type": "string",
                                "enum": ["beginner", "intermediate", "advanced"],
                                "description": "Filter by difficulty level"
                            },
                            "equipment": {
                                "type": "string",
                                "description": "Filter by required equipment"
                            },
                            "include_common": {
                                "type": "boolean",
                                "description": "Include common/public exercises (default: true)"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of results (default: 20)"
                            }
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "grep_exercises",
                    "description": "Fast pattern-matching search across ALL exercises available to the user (both common/public exercises and user's custom exercises). Use this to find exercises by name patterns, or check which exercises from a list exist. Supports regex patterns, fuzzy matching, and bulk searching. Returns matches sorted by relevance, plus similar exercises if no exact match found.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of search patterns (regex supported). Examples: ['pull.?up', 'dip', 'squat', 'hollow.*hold'] or exact names ['Pull-Ups', 'Dips']"
                            },
                            "output_mode": {
                                "type": "string",
                                "enum": ["matches", "missing", "both"],
                                "description": "Output mode: 'matches' (only found), 'missing' (only not found), 'both' (default). Use 'both' to also get similar exercises when exact match not found."
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Max results per pattern (default: 5)"
                            }
                        },
                        "required": ["patterns"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "grep_workouts",
                    "description": "Fast pattern-matching search across ALL workout templates available to the user (both common/public and user's custom workouts). Use this to find workouts by name or goal patterns. Supports regex patterns and bulk searching.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patterns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of search patterns (regex supported). Examples: ['upper.*body', 'push', 'endurance']"
                            },
                            "search_fields": {
                                "type": "array",
                                "items": {"type": "string", "enum": ["name", "goal", "tags"]},
                                "description": "Fields to search in (default: ['name', 'goal'])"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Max results per pattern (default: 5)"
                            }
                        },
                        "required": ["patterns"]
                    }
                }
            },
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
            }
        ]

    async def process_request(self, message: str, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Process user request with OpenAI function calling"""

        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        context_str = f"""USER PROFILE:
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'not specified'}
- Preferred Workout Duration: {user_profile.get('workoutDuration', 'not set')} minutes
- Workout Days per Week: {len(user_profile.get('workoutDays', []))}

USER DATA:
- {len(data_context.get('exercises', []))} exercises in library
- {len(data_context.get('workouts', []))} recent workouts
- {len(data_context.get('goals', []))} active goals
- {len(data_context.get('plans', []))} training plans"""

        # Use the shared system prompt constant
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_str}\n\nUser: {message}"}
        ]

        try:
            # Call OpenAI with function calling
            response = await self.client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                tools=self.get_tools(),
                tool_choice="auto",
                temperature=0.7
            )

            response_message = response.choices[0].message

            # Handle tool calls
            if response_message.tool_calls:
                tool_results = []

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)

                    logger.info(f"Executing tool: {function_name}")

                    # Execute the tool - route to appropriate handler
                    result = await self._execute_tool(user_id, function_name, function_args)

                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "result": result
                    })

                # Get final response with tool results
                messages.append(response_message)
                for tool_result in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_result["tool_call_id"],
                        "content": json.dumps(tool_result["result"])
                    })

                final_response = await self.client.chat.completions.create(
                    model="gpt-4-turbo-preview",
                    messages=messages,
                    temperature=0.7
                )

                return {
                    "message": final_response.choices[0].message.content,
                    "type": "tool_execution",
                    "confidence": 0.95
                }
            else:
                # No tool use, just conversation
                return {
                    "message": response_message.content,
                    "type": "conversation",
                    "confidence": 0.9
                }

        except Exception as e:
            logger.error(f"Error in orchestrator: {e}")
            return {
                "message": "I encountered an error. Please try again.",
                "type": "error",
                "confidence": 0.5
            }

    def _get_tool_description(self, function_name: str, function_args: Dict[str, Any]) -> str:
        """Get user-friendly description for a tool call"""
        descriptions = {
            # Exercise tools
            "add_exercise": f"Adding {function_args.get('name', 'exercise')} to your library",
            "list_exercises": f"Searching exercises by {function_args.get('muscle', function_args.get('name', 'filter'))}",
            "grep_exercises": f"Searching for {', '.join(function_args.get('patterns', ['exercises'])[:3])}",
            "grep_workouts": f"Searching workouts: {', '.join(function_args.get('patterns', ['workouts'])[:3])}",
            # Workout template tools
            "create_workout_template": f"Creating workout template: {function_args.get('name', 'workout')}",
            "list_workout_templates": "Browsing workout templates",
            # Workout log tools
            "log_workout": f"Logging workout: {function_args.get('title', 'workout')}",
            "get_workout_history": "Fetching your workout history",
            # Plan tools
            "create_plan": f"Creating training plan: {function_args.get('name', 'plan')}",
            "list_plans": "Fetching your training plans",
            "update_plan": "Updating your training plan",
            "add_plan_workout": f"Adding workout to week {function_args.get('weekNumber', '')}",
            "remove_plan_workout": f"Removing workout from week {function_args.get('weekNumber', '')}",
            # Goal tools
            "create_goal": f"Setting up goal: {function_args.get('name', 'fitness goal')}",
            "update_goal": "Updating your fitness goal",
            "list_goals": "Fetching your fitness goals",
            # Calendar tools
            "schedule_to_calendar": f"Scheduling {function_args.get('title', 'event')} for {function_args.get('date', 'your calendar')}",
            "get_calendar_events": "Checking your calendar"
        }
        return descriptions.get(function_name, f"Processing {function_name}")

    async def process_request_streaming(
        self,
        message: str,
        user_context: Dict[str, Any],
        conversation_history: List[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process user request with streaming, yielding events for real-time UI updates.

        Yields events:
        - {"type": "token", "content": "..."} - Individual response tokens
        - {"type": "tool_start", "tool": "...", "description": "..."} - Tool execution started
        - {"type": "tool_complete", "tool": "...", "success": bool, "message": "..."} - Tool finished
        - {"type": "complete", "full_response": "..."} - Stream finished
        - {"type": "error", "message": "..."} - Error occurred
        """
        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing streaming request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Build context string
        context_str = f"""User has:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} workouts
- {len(data_context.get('goals', []))} goals"""

        # Build messages array with conversation history
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        # Add conversation history if available
        if conversation_history:
            for hist_msg in conversation_history:
                role = "user" if hist_msg.get("role") == "human" else "assistant"
                messages.append({
                    "role": role,
                    "content": hist_msg.get("content", "")
                })
            # Add current message without context prefix (history provides context)
            messages.append({"role": "user", "content": message})
        else:
            # First message - include context
            messages.append({"role": "user", "content": f"{context_str}\n\nUser: {message}"})

        # Track the full response
        full_response = []

        try:
            # Create streaming completion with tools
            logger.info(f"Calling OpenAI API with model: {self.settings.openai_model} and {len(self.get_tools())} tools")
            stream = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice="auto",
                temperature=0.7,
                max_tokens=1500,
                stream=True
            )

            tool_calls_data = {}  # Accumulate tool call chunks by index

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta

                # Stream content tokens
                if delta.content:
                    token = delta.content
                    full_response.append(token)
                    yield {"type": "token", "content": token}

                # Accumulate tool call chunks
                if delta.tool_calls:
                    for tool_call_chunk in delta.tool_calls:
                        index = tool_call_chunk.index
                        if index not in tool_calls_data:
                            tool_calls_data[index] = {
                                "id": "",
                                "function": {"name": "", "arguments": ""}
                            }

                        if tool_call_chunk.id:
                            tool_calls_data[index]["id"] = tool_call_chunk.id
                        if tool_call_chunk.function:
                            if tool_call_chunk.function.name:
                                tool_calls_data[index]["function"]["name"] += tool_call_chunk.function.name
                            if tool_call_chunk.function.arguments:
                                tool_calls_data[index]["function"]["arguments"] += tool_call_chunk.function.arguments

                # Check for finish reason
                if choice.finish_reason == "tool_calls" and tool_calls_data:
                    logger.info(f"Executing {len(tool_calls_data)} tool calls...")

                    # Add newline before tool execution
                    yield {"type": "token", "content": "\n\n"}

                    # Execute each tool call
                    tool_results = []
                    for index in sorted(tool_calls_data.keys()):
                        tool_data = tool_calls_data[index]
                        function_name = tool_data["function"]["name"]
                        function_args = json.loads(tool_data["function"]["arguments"])

                        logger.info(f"Executing {function_name} with args: {function_args}")

                        # Yield tool start event
                        tool_description = self._get_tool_description(function_name, function_args)
                        yield {
                            "type": "tool_start",
                            "tool": function_name,
                            "description": tool_description
                        }

                        # Execute tool
                        result = await self._execute_tool(user_id, function_name, function_args)

                        logger.info(f"Tool {function_name} result: {result}")

                        tool_results.append({
                            "tool_call_id": tool_data["id"],
                            "role": "tool",
                            "content": json.dumps(result)
                        })

                        # Yield tool complete event
                        yield {
                            "type": "tool_complete",
                            "tool": function_name,
                            "success": result.get("success", False),
                            "message": result.get("message", "")
                        }

                    # Build message history with tool results for final response
                    messages.append({
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tool_calls_data[i]["id"],
                                "type": "function",
                                "function": {
                                    "name": tool_calls_data[i]["function"]["name"],
                                    "arguments": tool_calls_data[i]["function"]["arguments"]
                                }
                            }
                            for i in sorted(tool_calls_data.keys())
                        ]
                    })

                    for tool_result in tool_results:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_result["tool_call_id"],
                            "content": tool_result["content"]
                        })

                    # Stream the final response after tool execution
                    logger.info("Getting final response after tool execution...")
                    final_stream = await self.client.chat.completions.create(
                        model=self.settings.openai_model,
                        messages=messages,
                        temperature=0.7,
                        max_tokens=500,
                        stream=True
                    )

                    async for final_chunk in final_stream:
                        final_choice = final_chunk.choices[0] if final_chunk.choices else None
                        if final_choice and final_choice.delta.content:
                            token = final_choice.delta.content
                            full_response.append(token)
                            yield {"type": "token", "content": token}

            # Yield completion event with full response
            yield {
                "type": "complete",
                "full_response": "".join(full_response)
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}

    async def _execute_tool(self, user_id: str, function_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Route tool calls to appropriate handlers"""
        tool_handlers = {
            # Exercise tools
            "add_exercise": self._add_exercise,
            "list_exercises": self._list_exercises,
            "grep_exercises": self._grep_exercises,
            "grep_workouts": self._grep_workouts,
            # Workout template tools
            "create_workout_template": self._create_workout_template,
            "list_workout_templates": self._list_workout_templates,
            # Workout log tools
            "log_workout": self._log_workout,
            "get_workout_history": self._get_workout_history,
            # Plan tools
            "create_plan": self._create_plan,
            "list_plans": self._list_plans,
            "update_plan": self._update_plan,
            "add_plan_workout": self._add_plan_workout,
            "remove_plan_workout": self._remove_plan_workout,
            # Goal tools
            "create_goal": self._create_goal,
            "update_goal": self._update_goal,
            "list_goals": self._list_goals,
            # Calendar tools
            "schedule_to_calendar": self._schedule_to_calendar,
            "get_calendar_events": self._get_calendar_events,
        }

        handler = tool_handlers.get(function_name)
        if handler:
            return await handler(user_id, args)
        else:
            return {"error": f"Unknown function: {function_name}"}
    
    # ==================== EXERCISE TOOL HANDLERS ====================

    async def _add_exercise(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add an exercise to the user's personal exercise library"""
        try:
            # Build strain object with defaults
            strain_input = args.get("strain", {})
            strain = {
                "intensity": strain_input.get("intensity", "moderate"),
                "load": strain_input.get("load", "bodyweight"),
                "durationType": strain_input.get("durationType", "reps"),
                "typicalVolume": strain_input.get("typicalVolume", "3x10")
            }

            exercise_data = {
                "name": args["name"],
                "description": args.get("description", f"{args['name']} - a {args.get('difficulty', 'intermediate')} level exercise"),
                "muscles": args.get("muscles", ["Full Body"]),
                "secondaryMuscles": args.get("secondaryMuscles", []),
                "discipline": args.get("discipline", ["General Fitness"]),
                "equipment": args.get("equipment", []),
                "difficulty": args.get("difficulty", "intermediate"),
                "instructions": args.get("instructions", [f"Perform {args['name']} with proper form and control"]),
                "strain": strain,
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.exercises.insert_one(exercise_data)

            if result.inserted_id:
                logger.info(f"Added exercise {args['name']} for user {user_id}")
                return {
                    "success": True,
                    "message": f"Added '{args['name']}' to your exercise library!",
                    "exercise_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to add exercise"}

        except Exception as e:
            logger.error(f"Error adding exercise: {e}")
            return {"success": False, "message": str(e)}

    async def _list_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List exercises from the database with optional filters"""
        try:
            # Build the base ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build additional filters
            additional_filters: List[Dict[str, Any]] = []

            # Name search (for finding specific exercises like "toes to bar")
            if args.get("name"):
                additional_filters.append({
                    "name": {"$regex": args["name"], "$options": "i"}
                })

            # Muscle filter (search primary and secondary muscles)
            if args.get("muscle"):
                muscle_pattern = args["muscle"]
                additional_filters.append({
                    "$or": [
                        {"muscles": {"$regex": muscle_pattern, "$options": "i"}},
                        {"secondaryMuscles": {"$regex": muscle_pattern, "$options": "i"}}
                    ]
                })

            # Discipline filter
            if args.get("discipline"):
                additional_filters.append({
                    "discipline": {"$regex": args["discipline"], "$options": "i"}
                })

            # Difficulty filter
            if args.get("difficulty"):
                additional_filters.append({"difficulty": args["difficulty"]})

            # Equipment filter
            if args.get("equipment"):
                additional_filters.append({
                    "equipment": {"$regex": args["equipment"], "$options": "i"}
                })

            # Combine all filters with $and
            if additional_filters:
                query = {"$and": [ownership_filter] + additional_filters}
            else:
                query = ownership_filter

            limit = args.get("limit", 20)

            logger.info(f"list_exercises query for user {user_id}: {query}")

            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "secondaryMuscles": 1, "difficulty": 1, "equipment": 1, "discipline": 1, "description": 1}
            ).limit(limit).to_list(None)

            logger.info(f"list_exercises found {len(exercises)} exercises")

            # Format results
            results = []
            for ex in exercises:
                results.append({
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "equipment": ex.get("equipment", []),
                    "discipline": ex.get("discipline", [])
                })

            return {
                "success": True,
                "count": len(results),
                "exercises": results
            }

        except Exception as e:
            logger.error(f"Error listing exercises: {e}")
            return {"success": False, "message": str(e)}

    async def _grep_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across exercises using regex.
        Similar to ripgrep - searches all exercises and returns matches per pattern.
        Also finds SIMILAR exercises when exact match fails (fuzzy matching).
        """
        try:
            import re
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            output_mode = args.get("output_mode", "both")
            limit_per_pattern = args.get("limit", 5)

            # Build ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Extract keywords from all patterns for broader search
            all_keywords = set()
            for pattern in patterns:
                # Extract words (remove special chars, split)
                words = re.findall(r'[a-zA-Z]+', pattern.lower())
                # Filter out very short words and common words
                stopwords = {'to', 'the', 'a', 'an', 'in', 'on', 'with', 'for', 'and', 'or'}
                keywords = [w for w in words if len(w) > 2 and w not in stopwords]
                all_keywords.update(keywords)

            # Build broader search: match ANY keyword for fuzzy results
            keyword_regex = "|".join(all_keywords) if all_keywords else "|".join(patterns)

            query = {
                "$and": [
                    ownership_filter,
                    {"name": {"$regex": keyword_regex, "$options": "i"}}
                ]
            }

            # Fetch all potentially matching exercises (broader search)
            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "difficulty": 1, "discipline": 1, "equipment": 1, "description": 1, "_id": 1}
            ).to_list(None)

            # Build lookup with descriptions for user context
            all_exercises = [
                {
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "discipline": ex.get("discipline", []),
                    "equipment": ex.get("equipment", []),
                    "description": ex.get("description", "")[:100]  # First 100 chars of description
                }
                for ex in exercises
            ]

            # Helper function to calculate similarity score
            def similarity_score(pattern: str, exercise_name: str) -> float:
                """Calculate how similar a pattern is to an exercise name"""
                pattern_lower = pattern.lower()
                name_lower = exercise_name.lower()

                # Exact match
                if pattern_lower == name_lower:
                    return 1.0

                # Pattern is substring of name or vice versa
                if pattern_lower in name_lower or name_lower in pattern_lower:
                    return 0.9

                # Word overlap scoring
                pattern_words = set(re.findall(r'[a-zA-Z]+', pattern_lower))
                name_words = set(re.findall(r'[a-zA-Z]+', name_lower))

                if not pattern_words or not name_words:
                    return 0.0

                # Calculate Jaccard-like similarity
                intersection = len(pattern_words & name_words)
                union = len(pattern_words | name_words)

                if union == 0:
                    return 0.0

                base_score = intersection / union

                # Boost if key words match (longer words are more significant)
                key_matches = sum(1 for w in pattern_words if len(w) > 3 and w in name_words)
                boost = key_matches * 0.15

                return min(base_score + boost, 0.85)  # Cap at 0.85 for non-exact matches

            # Match each pattern to its results
            results_by_pattern = {}
            similar_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                scored_matches = []
                for ex in all_exercises:
                    score = similarity_score(pattern, ex["name"])
                    if score > 0:
                        scored_matches.append((score, ex))

                # Sort by score descending
                scored_matches.sort(key=lambda x: x[0], reverse=True)

                # Separate exact/high matches from similar matches
                exact_matches = [ex for score, ex in scored_matches if score >= 0.85]
                similar_matches = [
                    {**ex, "similarity": f"{int(score * 100)}%"}
                    for score, ex in scored_matches
                    if 0.3 <= score < 0.85
                ][:limit_per_pattern]

                if exact_matches:
                    results_by_pattern[pattern] = exact_matches[:limit_per_pattern]
                    matched_patterns.add(pattern)
                elif similar_matches:
                    # No exact match but found similar exercises
                    similar_by_pattern[pattern] = similar_matches
                    missing_patterns.append(pattern)
                else:
                    missing_patterns.append(pattern)

            # Build response based on output_mode
            response: Dict[str, Any] = {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns)
            }

            if output_mode in ("matches", "both"):
                response["matches"] = results_by_pattern

            if output_mode in ("missing", "both"):
                response["missing"] = missing_patterns

            # Add similar matches (always include if found)
            if similar_by_pattern:
                response["similar"] = similar_by_pattern
                response["has_similar"] = True

            # Summary for quick overview
            response["summary"] = f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            if similar_by_pattern:
                response["summary"] += f". Found {len(similar_by_pattern)} similar exercise(s) that might be what you're looking for"
            elif missing_patterns and len(missing_patterns) <= 10:
                response["summary"] += f". Missing: {', '.join(missing_patterns[:5])}"
                if len(missing_patterns) > 5:
                    response["summary"] += f" (+{len(missing_patterns) - 5} more)"

            return response

        except Exception as e:
            logger.error(f"Error in grep_exercises: {e}")
            return {"success": False, "message": str(e)}

    async def _grep_workouts(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across workout templates using regex.
        """
        try:
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            limit_per_pattern = args.get("limit", 5)
            search_fields = args.get("search_fields", ["name", "goal"])

            # Build ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build combined regex pattern
            combined_regex = "|".join(f"({p})" for p in patterns)

            # Build field search conditions
            field_conditions = []
            if "name" in search_fields:
                field_conditions.append({"name": {"$regex": combined_regex, "$options": "i"}})
            if "goal" in search_fields:
                field_conditions.append({"goal": {"$regex": combined_regex, "$options": "i"}})
            if "tags" in search_fields:
                field_conditions.append({"tags": {"$regex": combined_regex, "$options": "i"}})

            query = {
                "$and": [
                    ownership_filter,
                    {"$or": field_conditions} if field_conditions else {}
                ]
            }

            # Fetch matching workouts
            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "tags": 1, "blocks": 1, "_id": 1}
            ).to_list(None)

            # Build lookup
            all_workouts = [
                {
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "tags": w.get("tags", []),
                    "exercise_count": sum(len(b.get("exercises", [])) for b in w.get("blocks", []))
                }
                for w in workouts
            ]

            # Match each pattern
            import re
            results_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                try:
                    regex = re.compile(pattern, re.IGNORECASE)
                    matches = []
                    for w in all_workouts:
                        # Search in configured fields
                        if ("name" in search_fields and regex.search(w["name"])) or \
                           ("goal" in search_fields and regex.search(w["goal"])) or \
                           ("tags" in search_fields and any(regex.search(t) for t in w["tags"])):
                            matches.append(w)

                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)
                except re.error:
                    pattern_lower = pattern.lower()
                    matches = [w for w in all_workouts if pattern_lower in w["name"].lower() or pattern_lower in w["goal"].lower()]
                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)

            return {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns),
                "matches": results_by_pattern,
                "missing": missing_patterns,
                "summary": f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            }

        except Exception as e:
            logger.error(f"Error in grep_workouts: {e}")
            return {"success": False, "message": str(e)}

    # ==================== WORKOUT TEMPLATE TOOL HANDLERS ====================

    async def _create_workout_template(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a workout template (PredefinedWorkout) with blocks structure"""
        try:
            # Get existing exercises to link IDs
            existing_exercises = await self.db.exercises.find(
                {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]},
                {"name": 1, "_id": 1}
            ).to_list(None)
            exercise_map = {ex["name"].lower(): ex["_id"] for ex in existing_exercises}

            # Process blocks and link exercise IDs
            blocks = []
            for block in args.get("blocks", []):
                block_exercises = []
                for ex in block.get("exercises", []):
                    exercise_name = ex.get("exercise_name", "")
                    exercise_id = exercise_map.get(exercise_name.lower())

                    block_exercises.append({
                        "exercise_id": exercise_id,
                        "exercise_name": exercise_name,
                        "volume": ex.get("volume", "3x10"),
                        "rest": ex.get("rest", "60s"),
                        "notes": ex.get("notes", "")
                    })

                blocks.append({
                    "name": block.get("name", "Main Work"),
                    "exercises": block_exercises
                })

            workout_data = {
                "name": args["name"],
                "goal": args.get("goal", ""),
                "primary_disciplines": args.get("primary_disciplines", []),
                "estimated_duration": args.get("estimated_duration", 45),
                "difficulty_level": args.get("difficulty_level", "intermediate"),
                "blocks": blocks,
                "tags": args.get("tags", []),
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "popularity": 0,
                "ratings": {"average": 0, "count": 0},
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.predefinedworkouts.insert_one(workout_data)

            if result.inserted_id:
                total_exercises = sum(len(b.get("exercises", [])) for b in blocks)
                logger.info(f"Created workout template '{args['name']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Created workout template '{args['name']}' with {len(blocks)} blocks and {total_exercises} exercises!",
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create workout template"}

        except Exception as e:
            logger.error(f"Error creating workout template: {e}")
            return {"success": False, "message": str(e)}

    async def _list_workout_templates(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List workout templates (PredefinedWorkouts)"""
        try:
            # Build the base ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build additional filters
            additional_filters: List[Dict[str, Any]] = []

            if args.get("name"):
                additional_filters.append({
                    "name": {"$regex": args["name"], "$options": "i"}
                })
            if args.get("discipline"):
                additional_filters.append({
                    "primary_disciplines": {"$regex": args["discipline"], "$options": "i"}
                })
            if args.get("difficulty_level"):
                additional_filters.append({"difficulty_level": args["difficulty_level"]})

            # Combine all filters with $and
            if additional_filters:
                query = {"$and": [ownership_filter] + additional_filters}
            else:
                query = ownership_filter

            limit = args.get("limit", 10)

            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "blocks": 1, "primary_disciplines": 1}
            ).limit(limit).to_list(None)

            results = []
            for w in workouts:
                total_exercises = sum(len(b.get("exercises", [])) for b in w.get("blocks", []))
                results.append({
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "disciplines": w.get("primary_disciplines", []),
                    "total_exercises": total_exercises
                })

            return {
                "success": True,
                "count": len(results),
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error listing workout templates: {e}")
            return {"success": False, "message": str(e)}

    # ==================== WORKOUT LOG TOOL HANDLERS ====================

    async def _log_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Log a workout to the user's workout history"""
        try:
            # Get exercise IDs for the exercises
            existing_exercises = await self.db.exercises.find(
                {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]},
                {"name": 1, "_id": 1}
            ).to_list(None)
            exercise_map = {ex["name"].lower(): ex["_id"] for ex in existing_exercises}

            # Process exercises
            formatted_exercises = []
            for i, ex in enumerate(args.get("exercises", [])):
                exercise_name = ex.get("exerciseName", "")
                exercise_id = exercise_map.get(exercise_name.lower())

                sets = []
                for s in ex.get("sets", []):
                    set_data = {
                        "targetReps": s.get("targetReps"),
                        "actualReps": s.get("actualReps"),
                        "weight": s.get("weight"),
                        "time": s.get("time"),
                        "rpe": s.get("rpe"),
                        "restSeconds": s.get("restSeconds", 60),
                        "notes": s.get("notes", ""),
                        "isCompleted": s.get("actualReps") is not None or s.get("time") is not None
                    }
                    sets.append(set_data)

                formatted_exercises.append({
                    "exerciseId": exercise_id,
                    "exerciseName": exercise_name,
                    "order": i,
                    "sets": sets,
                    "notes": ex.get("notes", "")
                })

            # Parse date or use today
            workout_date = datetime.utcnow()
            if args.get("date"):
                try:
                    workout_date = datetime.fromisoformat(args["date"].replace("Z", "+00:00"))
                except Exception:
                    pass

            workout_data = {
                "userId": ObjectId(user_id),
                "title": args["title"],
                "date": workout_date,
                "type": args.get("type", "strength"),
                "status": args.get("status", "completed"),
                "durationMinutes": args.get("durationMinutes"),
                "exercises": formatted_exercises,
                "totalStrain": 0,
                "muscleStrain": {
                    "chest": 0, "back": 0, "shoulders": 0,
                    "arms": 0, "legs": 0, "core": 0
                },
                "notes": args.get("notes", ""),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Link to plan if provided
            if args.get("planId"):
                try:
                    workout_data["planId"] = ObjectId(args["planId"])
                except Exception:
                    pass

            result = await self.db.workouts.insert_one(workout_data)

            if result.inserted_id:
                logger.info(f"Logged workout '{args['title']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Logged '{args['title']}' with {len(formatted_exercises)} exercises!",
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to log workout"}

        except Exception as e:
            logger.error(f"Error logging workout: {e}")
            return {"success": False, "message": str(e)}

    async def _get_workout_history(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get user's workout history"""
        try:
            days = args.get("days", 30)
            start_date = datetime.utcnow() - timedelta(days=days)

            query: Dict[str, Any] = {
                "userId": ObjectId(user_id),
                "date": {"$gte": start_date}
            }

            if args.get("type"):
                query["type"] = args["type"]
            if args.get("status"):
                query["status"] = args["status"]

            limit = args.get("limit", 10)

            workouts = await self.db.workouts.find(
                query,
                {"title": 1, "date": 1, "type": 1, "status": 1, "durationMinutes": 1, "exercises": 1}
            ).sort("date", -1).limit(limit).to_list(None)

            results = []
            for w in workouts:
                results.append({
                    "id": str(w["_id"]),
                    "title": w["title"],
                    "date": w["date"].isoformat() if w.get("date") else None,
                    "type": w.get("type"),
                    "status": w.get("status"),
                    "duration": w.get("durationMinutes"),
                    "exercise_count": len(w.get("exercises", []))
                })

            return {
                "success": True,
                "count": len(results),
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error getting workout history: {e}")
            return {"success": False, "message": str(e)}

    # ==================== PLAN TOOL HANDLERS ====================

    async def _create_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a training plan"""
        try:
            schedule = args.get("schedule", {})

            # Process weeks if provided
            weeks = []
            for week_data in args.get("weeks", []):
                week = {
                    "_id": ObjectId(),
                    "weekNumber": week_data.get("weekNumber", 1),
                    "focus": week_data.get("focus", ""),
                    "description": week_data.get("description", ""),
                    "deloadWeek": week_data.get("deloadWeek", False),
                    "workouts": [],
                    "restDays": []
                }

                # Process workouts for this week
                for workout in week_data.get("workouts", []):
                    weekly_workout = {
                        "_id": ObjectId(),
                        "dayOfWeek": workout.get("dayOfWeek", 1),
                        "workoutType": workout.get("workoutType", "custom"),
                        "notes": workout.get("notes", ""),
                        "isOptional": workout.get("isOptional", False)
                    }

                    if workout.get("workoutType") == "predefined" and workout.get("predefinedWorkoutId"):
                        try:
                            weekly_workout["predefinedWorkoutId"] = ObjectId(workout["predefinedWorkoutId"])
                        except Exception:
                            pass
                    elif workout.get("customWorkout"):
                        custom = workout["customWorkout"]
                        exercises = []
                        for ex in custom.get("exercises", []):
                            exercises.append({
                                "exerciseName": ex.get("exerciseName", ""),
                                "sets": ex.get("sets", [])
                            })
                        weekly_workout["customWorkout"] = {
                            "title": custom.get("title", ""),
                            "type": custom.get("type", "strength"),
                            "durationMinutes": custom.get("durationMinutes", 45),
                            "exercises": exercises
                        }

                    week["workouts"].append(weekly_workout)

                weeks.append(week)

            plan_data = {
                "userId": ObjectId(user_id),
                "name": args["name"],
                "description": args.get("description", ""),
                "status": "draft",
                "schedule": {
                    "weeksTotal": schedule.get("weeksTotal", 4),
                    "workoutsPerWeek": schedule.get("workoutsPerWeek", 3),
                    "restDays": schedule.get("restDays", [0, 6]),
                    "preferredWorkoutDays": schedule.get("preferredWorkoutDays", [1, 3, 5])
                },
                "weeks": weeks,
                "progress": {
                    "currentWeek": 1,
                    "completedWorkouts": 0,
                    "totalWorkouts": sum(len(w.get("workouts", [])) for w in weeks),
                    "skippedWorkouts": 0,
                    "adherencePercentage": 0
                },
                "settings": args.get("settings", {
                    "autoAdvance": True,
                    "allowModifications": True,
                    "sendReminders": True,
                    "difficultyAdjustment": "manual"
                }),
                "tags": args.get("tags", []),
                "isTemplate": False,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Link to goal if provided
            if args.get("goalId"):
                try:
                    plan_data["goalId"] = ObjectId(args["goalId"])
                except Exception:
                    pass

            result = await self.db.plans.insert_one(plan_data)

            if result.inserted_id:
                logger.info(f"Created plan '{args['name']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Created plan '{args['name']}' ({schedule.get('weeksTotal', 4)} weeks, {schedule.get('workoutsPerWeek', 3)} workouts/week)!",
                    "plan_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create plan"}

        except Exception as e:
            logger.error(f"Error creating plan: {e}")
            return {"success": False, "message": str(e)}

    async def _list_plans(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List user's training plans"""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}

            if args.get("status"):
                query["status"] = args["status"]

            include_templates = args.get("include_templates", False)
            if not include_templates:
                query["isTemplate"] = {"$ne": True}

            plans = await self.db.plans.find(
                query,
                {"name": 1, "description": 1, "status": 1, "schedule": 1, "progress": 1, "startDate": 1}
            ).sort("updatedAt", -1).to_list(None)

            results = []
            for p in plans:
                results.append({
                    "id": str(p["_id"]),
                    "name": p["name"],
                    "description": p.get("description", ""),
                    "status": p.get("status"),
                    "weeks_total": p.get("schedule", {}).get("weeksTotal"),
                    "workouts_per_week": p.get("schedule", {}).get("workoutsPerWeek"),
                    "current_week": p.get("progress", {}).get("currentWeek"),
                    "adherence": p.get("progress", {}).get("adherencePercentage"),
                    "start_date": p["startDate"].isoformat() if p.get("startDate") else None
                })

            return {
                "success": True,
                "count": len(results),
                "plans": results
            }

        except Exception as e:
            logger.error(f"Error listing plans: {e}")
            return {"success": False, "message": str(e)}

    # ==================== GOAL TOOL HANDLERS ====================

    async def _list_goals(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List user's fitness goals"""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}

            if args.get("category"):
                query["category"] = args["category"]
            if args.get("isActive") is not None:
                query["isActive"] = args["isActive"]

            goals = await self.db.goals.find(
                query,
                {"name": 1, "category": 1, "description": 1, "targetMetrics": 1, "deadline": 1, "isActive": 1}
            ).sort("createdAt", -1).to_list(None)

            results = []
            for g in goals:
                results.append({
                    "id": str(g["_id"]),
                    "name": g["name"],
                    "category": g.get("category"),
                    "description": g.get("description", ""),
                    "target_metrics": g.get("targetMetrics", {}),
                    "deadline": g["deadline"].isoformat() if g.get("deadline") else None,
                    "is_active": g.get("isActive", True)
                })

            return {
                "success": True,
                "count": len(results),
                "goals": results
            }

        except Exception as e:
            logger.error(f"Error listing goals: {e}")
            return {"success": False, "message": str(e)}
    
    async def _create_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a fitness goal with target metrics"""
        try:
            goal_data = {
                "userId": ObjectId(user_id),
                "name": args["name"],
                "category": args.get("category", "skill"),
                "description": args.get("description", ""),
                "difficulty": args.get("difficulty", "intermediate"),
                "targetMetrics": args.get("targetMetrics", {}),
                "isActive": True,
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Parse deadline if provided
            if args.get("deadline"):
                try:
                    goal_data["deadline"] = datetime.fromisoformat(args["deadline"].replace("Z", "+00:00"))
                except Exception:
                    pass

            result = await self.db.goals.insert_one(goal_data)

            if result.inserted_id:
                logger.info(f"Created goal '{args['name']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Created goal: '{args['name']}'!",
                    "goal_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create goal"}

        except Exception as e:
            logger.error(f"Error creating goal: {e}")
            return {"success": False, "message": str(e)}

    async def _update_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing fitness goal"""
        try:
            goal_id = args.get("goal_id")
            if not goal_id:
                return {"success": False, "message": "Missing required parameter: goal_id"}

            # Build updates - support both old and new field names
            updates: Dict[str, Any] = {}

            if args.get("name"):
                updates["name"] = args["name"]
            if args.get("description"):
                updates["description"] = args["description"]
            if args.get("targetMetrics"):
                updates["targetMetrics"] = args["targetMetrics"]
            if args.get("isActive") is not None:
                updates["isActive"] = args["isActive"]
            if args.get("deadline"):
                try:
                    updates["deadline"] = datetime.fromisoformat(args["deadline"].replace("Z", "+00:00"))
                except Exception:
                    pass

            if not updates:
                return {"success": False, "message": "No valid fields to update"}

            updates["updatedAt"] = datetime.utcnow()

            result = await self.db.goals.update_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "Updated goal successfully!"}
            else:
                return {"success": False, "message": "Goal not found or no changes made"}

        except Exception as e:
            logger.error(f"Error updating goal: {e}")
            return {"success": False, "message": str(e)}

    async def _update_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update a plan's top-level fields and schedule"""
        try:
            plan_id = args.get("plan_id")
            if not plan_id:
                return {"success": False, "message": "Missing required parameter: plan_id"}

            # Fetch plan to verify ownership
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            # Prepare updates
            allowed_top_fields = ["name", "description", "status", "goalId", "startDate"]
            updates: Dict[str, Any] = {}
            for field in allowed_top_fields:
                if field in args and args[field] is not None:
                    if field in ("goalId",):
                        updates[field] = ObjectId(args[field])
                    elif field == "startDate":
                        # Parse ISO date string into datetime for Mongo Date type
                        try:
                            updates[field] = datetime.fromisoformat(args[field].replace("Z", "+00:00"))
                        except Exception:
                            updates[field] = args[field]
                    else:
                        updates[field] = args[field]

            if "schedule" in args and isinstance(args["schedule"], dict):
                schedule_updates = {}
                for key in ["weeksTotal", "workoutsPerWeek", "restDays", "preferredWorkoutDays"]:
                    if key in args["schedule"] and args["schedule"][key] is not None:
                        schedule_updates[key] = args["schedule"][key]
                if schedule_updates:
                    updates["schedule"] = {**plan.get("schedule", {}), **schedule_updates}

            if not updates:
                return {"success": False, "message": "No valid fields to update"}

            updates["updatedAt"] = datetime.utcnow()

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "✅ Updated plan successfully!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error updating plan: {e}")
            return {"success": False, "message": str(e)}

    async def _add_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add a weekly workout to a specific week in a user's plan"""
        try:
            required = ["plan_id", "weekNumber", "dayOfWeek", "workoutType"]
            for r in required:
                if r not in args:
                    return {"success": False, "message": f"Missing required parameter: {r}"}

            plan_id = args["plan_id"]
            week_number = int(args["weekNumber"])
            day_of_week = int(args["dayOfWeek"])
            workout_type = args["workoutType"]

            # Load plan and verify ownership
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            weeks = plan.get("weeks", []) or []

            # Find or create the target week
            target_week = next((w for w in weeks if w.get("weekNumber") == week_number), None)
            if not target_week:
                target_week = {
                    "_id": ObjectId(),
                    "weekNumber": week_number,
                    "workouts": [],
                    "restDays": [],
                    "deloadWeek": False
                }
                weeks.append(target_week)

            workouts = target_week.get("workouts", []) or []

            weekly_workout: Dict[str, Any] = {
                "_id": ObjectId(),
                "dayOfWeek": day_of_week,
                "workoutType": workout_type,
                "notes": args.get("notes"),
                "isOptional": bool(args.get("isOptional", False))
            }

            if workout_type == "predefined":
                predefined_id = args.get("predefinedWorkoutId")
                if not predefined_id:
                    return {"success": False, "message": "predefinedWorkoutId is required for workoutType 'predefined'"}
                weekly_workout["predefinedWorkoutId"] = ObjectId(predefined_id)
            elif workout_type == "custom":
                custom = args.get("customWorkout") or {}
                # Normalize nested exercises ObjectId fields if present
                exercises = custom.get("exercises", [])
                normalized_exercises = []
                for ex in exercises:
                    ex_copy = dict(ex)
                    if ex_copy.get("exerciseId"):
                        try:
                            ex_copy["exerciseId"] = ObjectId(ex_copy["exerciseId"])  # may be absent
                        except Exception:
                            pass
                    normalized_exercises.append(ex_copy)
                weekly_workout["customWorkout"] = {
                    "title": custom.get("title"),
                    "type": custom.get("type"),
                    "durationMinutes": custom.get("durationMinutes"),
                    "exercises": normalized_exercises
                }
            else:
                return {"success": False, "message": "Invalid workoutType. Expected 'predefined' or 'custom'"}

            # Append and persist
            workouts.append(weekly_workout)
            target_week["workouts"] = workouts

            # Replace/merge week back into weeks array
            for i, w in enumerate(weeks):
                if w.get("weekNumber") == week_number:
                    weeks[i] = target_week
                    break

            update_doc = {
                "weeks": weeks,
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": update_doc}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "✅ Added workout to plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error adding plan workout: {e}")
            return {"success": False, "message": str(e)}

    async def _remove_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Remove a weekly workout from a specific week in a user's plan"""
        try:
            plan_id = args.get("plan_id")
            week_number = args.get("weekNumber")
            weekly_workout_id = args.get("weeklyWorkoutId")
            workout_index = args.get("workoutIndex")

            if not plan_id or not week_number:
                return {"success": False, "message": "Missing required parameters: plan_id, weekNumber"}

            # Load plan
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            weeks = plan.get("weeks", []) or []
            target_week = next((w for w in weeks if w.get("weekNumber") == int(week_number)), None)
            if not target_week:
                return {"success": False, "message": "Week not found in plan"}

            workouts = target_week.get("workouts", []) or []

            removed = False
            if weekly_workout_id:
                filtered = [w for w in workouts if str(w.get("_id")) != str(weekly_workout_id)]
                removed = len(filtered) != len(workouts)
                workouts = filtered
            elif workout_index is not None:
                try:
                    idx = int(workout_index)
                    if 0 <= idx < len(workouts):
                        workouts.pop(idx)
                        removed = True
                except Exception:
                    pass
            else:
                return {"success": False, "message": "Provide either weeklyWorkoutId or workoutIndex"}

            if not removed:
                return {"success": False, "message": "No matching workout found to remove"}

            target_week["workouts"] = workouts
            for i, w in enumerate(weeks):
                if w.get("weekNumber") == int(week_number):
                    weeks[i] = target_week
                    break

            update_doc = {
                "weeks": weeks,
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": update_doc}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "✅ Removed workout from plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error removing plan workout: {e}")
            return {"success": False, "message": str(e)}

    # ==================== CALENDAR TOOL HANDLERS ====================

    async def _schedule_to_calendar(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Schedule a workout or event to the user's calendar"""
        try:
            # Parse date - handle 'today', 'tomorrow', or ISO date
            date_str = args.get("date", "")
            if date_str.lower() == "today":
                event_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_str.lower() == "tomorrow":
                event_date = (datetime.utcnow() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            else:
                try:
                    event_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    # Try parsing as YYYY-MM-DD
                    event_date = datetime.strptime(date_str, "%Y-%m-%d")

            title = args.get("title", "Workout")
            event_type = args.get("type", "workout")
            workout_details = args.get("workoutDetails", {})
            notes = args.get("notes", "")

            # Build the calendar event document
            event_data = {
                "userId": ObjectId(user_id),
                "date": event_date,
                "title": title,
                "type": event_type,
                "status": "scheduled",
                "notes": notes,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Add workout details if this is a workout event
            if event_type == "workout" and workout_details:
                # Look up exercise IDs
                exercises = []
                for ex in workout_details.get("exercises", []):
                    exercise_name = ex.get("exerciseName", "")
                    # Try to find the exercise in the database
                    existing_ex = await self.db.exercises.find_one({
                        "name": {"$regex": f"^{exercise_name}$", "$options": "i"},
                        "$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]
                    })

                    exercises.append({
                        "exerciseId": existing_ex["_id"] if existing_ex else None,
                        "exerciseName": exercise_name,
                        "targetSets": ex.get("targetSets", 3),
                        "targetReps": ex.get("targetReps", 10),
                        "notes": ex.get("notes", "")
                    })

                event_data["workoutDetails"] = {
                    "type": workout_details.get("workoutType", "strength"),
                    "estimatedDuration": workout_details.get("estimatedDuration", 45),
                    "exercises": exercises
                }

            # Insert into calendarevents collection (Mongoose uses lowercase, no underscore)
            result = await self.db.calendarevents.insert_one(event_data)

            if result.inserted_id:
                # Format the date nicely for the response
                formatted_date = event_date.strftime("%A, %B %d, %Y")
                exercise_count = len(workout_details.get("exercises", [])) if workout_details else 0

                response_msg = f"✅ Scheduled **{title}** for **{formatted_date}**!"
                if event_type == "workout" and exercise_count > 0:
                    duration = workout_details.get("estimatedDuration", 45)
                    response_msg += f"\n\n📋 **{exercise_count} exercises** | ⏱️ **~{duration} min**"

                # Check if it's today
                today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                if event_date.date() == today.date():
                    response_msg += "\n\n🎯 **This is for today!** Would you like to start training now?"

                logger.info(f"Scheduled calendar event '{title}' for user {user_id} on {formatted_date}")
                return {
                    "success": True,
                    "message": response_msg,
                    "event_id": str(result.inserted_id),
                    "date": formatted_date,
                    "is_today": event_date.date() == today.date()
                }
            else:
                return {"success": False, "message": "Failed to create calendar event"}

        except Exception as e:
            logger.error(f"Error scheduling to calendar: {e}")
            return {"success": False, "message": f"Error scheduling event: {str(e)}"}

    async def _get_calendar_events(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get user's calendar events for a date range"""
        try:
            # Parse dates
            start_str = args.get("startDate")
            end_str = args.get("endDate")

            if start_str:
                try:
                    start_date = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                except Exception:
                    start_date = datetime.strptime(start_str, "%Y-%m-%d")
            else:
                start_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

            if end_str:
                try:
                    end_date = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                except Exception:
                    end_date = datetime.strptime(end_str, "%Y-%m-%d")
            else:
                end_date = start_date + timedelta(days=7)

            # Build query
            query = {
                "userId": ObjectId(user_id),
                "date": {"$gte": start_date, "$lte": end_date},
                "status": {"$ne": "cancelled"}
            }

            # Filter by type if provided
            event_type = args.get("type")
            if event_type:
                query["type"] = event_type

            # Fetch events (Mongoose uses lowercase, no underscore for collection name)
            events = await self.db.calendarevents.find(query).sort("date", 1).to_list(100)

            if not events:
                start_fmt = start_date.strftime("%B %d")
                end_fmt = end_date.strftime("%B %d, %Y")
                return {
                    "success": True,
                    "message": f"No events scheduled from {start_fmt} to {end_fmt}.",
                    "events": []
                }

            # Format events for response
            formatted_events = []
            for event in events:
                formatted_events.append({
                    "id": str(event["_id"]),
                    "date": event["date"].strftime("%Y-%m-%d"),
                    "dayOfWeek": event["date"].strftime("%A"),
                    "title": event.get("title", "Untitled"),
                    "type": event.get("type", "workout"),
                    "status": event.get("status", "scheduled"),
                    "duration": event.get("workoutDetails", {}).get("estimatedDuration"),
                    "exerciseCount": len(event.get("workoutDetails", {}).get("exercises", [])),
                    "notes": event.get("notes", "")
                })

            # Build summary message
            workout_count = sum(1 for e in formatted_events if e["type"] == "workout")
            rest_count = sum(1 for e in formatted_events if e["type"] == "rest")

            summary = f"Found **{len(formatted_events)} events** from {start_date.strftime('%B %d')} to {end_date.strftime('%B %d')}:"
            if workout_count > 0:
                summary += f"\n- 💪 **{workout_count}** workout(s)"
            if rest_count > 0:
                summary += f"\n- 😴 **{rest_count}** rest day(s)"

            return {
                "success": True,
                "message": summary,
                "events": formatted_events
            }

        except Exception as e:
            logger.error(f"Error getting calendar events: {e}")
            return {"success": False, "message": f"Error fetching calendar: {str(e)}"}