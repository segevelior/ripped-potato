"""
Exercise tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List


def get_exercise_tools() -> List[Dict[str, Any]]:
    """Return exercise-related tool definitions"""
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
    ]
