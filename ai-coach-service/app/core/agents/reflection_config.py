"""
Self-reflection configuration for AI Coach.
All reflection-related constants are centralized here.
"""

REFLECTION_CONFIG = {
    # Feature flag - set to False for initial deployment
    "enabled": True,

    # Model selection (cheaper model for reflection to reduce cost)
    "model": "gpt-4o-mini",

    # Trigger conditions - tools that should trigger reflection
    "trigger_tools": [
        "create_plan",
        "create_workout_template",
        "create_goal",
        "add_plan_workout",
    ],

    # Content-based triggers - patterns that indicate a workout/plan suggestion
    # Reflection triggers if response contains ANY of these patterns (case-insensitive)
    "trigger_content_patterns": [
        "sets of",
        "reps",
        "x5", "x8", "x10", "x12", "x15",  # Common rep schemes like "3x10"
        "day 1:", "day 2:", "day 3:",
        "week 1", "week 2", "week 3", "week 4",
        "warm-up", "warm up",
        "cool down", "cool-down",
        "workout plan",
        "training plan",
        "progression plan",
    ],

    # Minimum response length to trigger reflection (characters)
    # Skip short responses
    "min_response_length": 500,

    # Limits to prevent runaway costs and latency
    "timeout_seconds": 10,

    # LLM parameters for reflection calls
    "temperature": 0.3,
    "max_tokens": 2500,

    # Context limits for reflection prompt
    "max_goals_in_context": 5,

    # Observability - log reflection metrics for monitoring
    "log_metrics": True,
}
