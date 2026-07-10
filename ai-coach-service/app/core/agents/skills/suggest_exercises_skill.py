"""
Skill: suggest_exercises

Recommend exercises for a muscle group / movement pattern / skill within the
user's equipment and health caveats. Deterministic retrieval + filtering (the
orchestrator model does the conversational justification around the result).

For a skill goal (pull-up, handstand, ...) it points at generate_plan /
progression generation rather than a flat list.

`select_exercises` is a pure ranking helper unit-tested without a DB.
"""

from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge.movement import infer_movement_pattern
from app.core.agents.skills.substitute_exercise_skill import equipment_ok, _ALWAYS_AVAILABLE
from app.core.agents.skills.safety import get_safety_context

_DIFFICULTY_ORDER = {"beginner": 0, "intermediate": 1, "advanced": 2}


def _matches_flagged(exercise: Dict[str, Any], flagged_terms: List[str]) -> bool:
    """True if the exercise name/muscles reference a flagged (injured) area."""
    hay = (exercise.get("name", "") + " " + " ".join(exercise.get("muscles", []) or [])).lower()
    return any(term and term in hay for term in flagged_terms)


def select_exercises(
    candidates: List[Dict[str, Any]],
    available: set,
    movement_pattern: Optional[str],
    flagged_terms: List[str],
    limit: int,
) -> List[Dict[str, Any]]:
    """Pure: filter by equipment / pattern / safety, rank easiest-first."""
    picked = []
    for ex in candidates:
        if not equipment_ok(ex.get("equipment", []), available):
            continue
        if movement_pattern and infer_movement_pattern(ex) != movement_pattern:
            continue
        if _matches_flagged(ex, flagged_terms):
            continue
        picked.append(ex)

    picked.sort(key=lambda e: (_DIFFICULTY_ORDER.get((e.get("difficulty") or "beginner").lower(), 1), e.get("name", "")))
    return picked[:limit]


@skill(
    name="suggest_exercises",
    description=(
        "Suggest exercises for a muscle group, movement pattern, or goal that fit the "
        "user's available equipment and avoid any flagged/injured areas. For a skill goal "
        "(e.g. first pull-up, handstand), recommends building a progression instead of a flat list."
    ),
    parameters={
        "type": "object",
        "properties": {
            "muscle_group": {"type": "string", "description": "Target muscle (e.g. 'chest', 'hamstrings')."},
            "movement_pattern": {"type": "string", "description": "push|pull|squat|hinge|carry|core|cardio."},
            "skill": {"type": "string", "description": "A skill goal (e.g. 'pull-up', 'handstand')."},
            "difficulty": {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
            "equipment": {"type": "array", "items": {"type": "string"}, "description": "Override available equipment."},
            "limit": {"type": "integer", "description": "Max results (default 8)."},
        },
    },
)
async def suggest_exercises(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    # Skill goals want a progression, not a flat list.
    if args.get("skill"):
        return {
            "success": True,
            "is_skill": True,
            "message": (
                f"'{args['skill']}' is a skill best trained with a progression ladder. "
                f"Want me to generate a plan for it (generate_plan) so you build up step by step?"
            ),
        }

    limit = int(args.get("limit") or 8)
    movement_pattern = (args.get("movement_pattern") or "").lower() or None

    if args.get("equipment") is not None:
        equipment_list = args["equipment"]
    else:
        user = await ctx.db.users.find_one({"_id": user_oid}, {"profile.preferences.equipment": 1})
        equipment_list = (((user or {}).get("profile") or {}).get("preferences") or {}).get("equipment") or []
    available = {(e or "").lower() for e in equipment_list} | _ALWAYS_AVAILABLE

    safety = await get_safety_context(ctx, user_id)
    flagged_terms = safety.get("flagged_terms", [])

    ownership = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}
    query: Dict[str, Any] = dict(ownership)
    if args.get("muscle_group"):
        query["muscles"] = {"$regex": args["muscle_group"], "$options": "i"}
    if args.get("difficulty"):
        query["difficulty"] = args["difficulty"]

    candidates = await ctx.db.exercises.find(query).to_list(150)
    picked = select_exercises(candidates, available, movement_pattern, flagged_terms, limit)

    if not picked:
        return {
            "success": True,
            "exercises": [],
            "message": "I couldn't find exercises matching that with your available equipment.",
        }

    exercises = [
        {
            "id": str(e["_id"]),
            "name": e.get("name"),
            "muscles": e.get("muscles", []),
            "equipment": e.get("equipment", []),
            "difficulty": e.get("difficulty"),
            "pattern": infer_movement_pattern(e),
        }
        for e in picked
    ]
    note = ""
    if safety.get("has_flags"):
        note = " (filtered to avoid your noted areas)"
    return {
        "success": True,
        "exercises": exercises,
        "message": f"Found {len(exercises)} option(s){note}.",
    }
