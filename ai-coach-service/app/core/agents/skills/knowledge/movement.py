"""
Movement-pattern inference for exercises.

The Exercise model has no movementPattern field (see the skills roadmap). Until
that's added (or replaced by a vector-search KB), we infer a coarse pattern from
the exercise name, falling back to its primary muscle. Pure functions — no DB.

Patterns are the standard primal categories used for substitution matching:
push / pull / squat / hinge / carry / core / cardio.
"""

from typing import Any, Dict, List, Optional

# Name keywords -> movement pattern. Order matters: earlier patterns win.
MOVEMENT_PATTERNS: Dict[str, List[str]] = {
    "hinge": ["deadlift", "romanian", "rdl", "hip thrust", "good morning", "kettlebell swing", "swing", "hip hinge"],
    "squat": ["squat", "lunge", "leg press", "step-up", "step up", "split squat", "pistol"],
    "pull": ["pull-up", "pullup", "chin-up", "chinup", "row", "lat pulldown", "pulldown", "curl", "face pull", "muscle-up"],
    "push": ["bench", "push-up", "pushup", "press", "dip", "overhead", "ohp", "fly", "pushdown", "extension", "handstand"],
    "carry": ["carry", "farmer", "suitcase", "waiter"],
    "core": ["plank", "crunch", "sit-up", "situp", "hollow", "leg raise", "knee raise", "ab wheel", "rollout", "russian twist"],
    "cardio": ["run", "jog", "sprint", "bike", "cycl", "rowing", "erg", "burpee", "jump rope", "skip", "swim", "elliptical"],
}

# Primary muscle -> pattern fallback when the name isn't recognized.
MUSCLE_TO_PATTERN: Dict[str, str] = {
    "chest": "push", "shoulders": "push", "triceps": "push", "delts": "push",
    "back": "pull", "lats": "pull", "biceps": "pull", "traps": "pull", "rhomboids": "pull",
    "quads": "squat", "quadriceps": "squat", "calves": "squat",
    "glutes": "hinge", "hamstrings": "hinge", "lower back": "hinge",
    "core": "core", "abs": "core", "obliques": "core",
}


def infer_movement_pattern(exercise: Dict[str, Any]) -> Optional[str]:
    """Best-effort pattern from name, then primary muscle. None if unknown."""
    name = (exercise.get("name") or "").lower()
    for pattern, keywords in MOVEMENT_PATTERNS.items():
        if any(kw in name for kw in keywords):
            return pattern
    for muscle in exercise.get("muscles", []) or []:
        pattern = MUSCLE_TO_PATTERN.get((muscle or "").lower())
        if pattern:
            return pattern
    return None
