"""Shared dedup helper for the exercise-creation tool paths.

Both write paths that can insert an exercise (ExerciseService.add_exercise and the
MCP McpTools._add_exercise) use this so the reuse message + workout hint can never
drift between them.
"""
import re
from typing import Any, Dict, Optional

from bson import ObjectId


async def existing_exercise_reuse_response(db, user_id: str, name: str) -> Optional[Dict[str, Any]]:
    """Return a "reuse, don't duplicate" tool response if an exercise with this exact
    (case-insensitive) name already exists for the user — a common one OR one they
    created. Returns None when the name is new (caller should insert).

    ``created=False`` is deliberate: reusing an existing exercise is NOT the same as
    completing the user's request. When a workout template shares the name, the hint
    steers a mis-classified "add my workout" request to create_workout_template.
    """
    name_regex = {"$regex": f"^{re.escape(name)}$", "$options": "i"}
    visibility = {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]}
    existing = await db.exercises.find_one({"name": name_regex, **visibility})
    if not existing:
        return None
    template = await db.predefinedworkouts.find_one({"name": name_regex, **visibility}, {"_id": 1})
    return {
        "success": True,
        "already_exists": True,
        "created": False,
        "exercise_id": str(existing["_id"]),
        "message": f"'{existing['name']}' already exists — reused it, did NOT create anything new.",
        "hint": (
            "A workout template with this name also exists; if the user asked to add a "
            "WORKOUT, call create_workout_template instead of adding an exercise."
        ) if template else None,
    }
