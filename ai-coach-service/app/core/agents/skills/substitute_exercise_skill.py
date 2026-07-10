"""
Skill: substitute_exercise

Swap an exercise for one with a similar training stimulus, respecting the user's
available equipment. Matching is deterministic: same movement pattern + primary-
muscle overlap + strain similarity, preserving the sets/reps target.

Safety: if the reason is pain/injury, this does NOT prescribe a rehab swap — it
routes to a caution (spec: work around clinician-cleared limitations only).

Pure helpers (equipment_ok, score_substitute) are unit-tested without a DB.
"""

from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge.movement import infer_movement_pattern
from app.core.agents.skills.safety import _INJURY_HINT_TERMS

# Equipment values that always count as "available" (bodyweight / none).
_ALWAYS_AVAILABLE = {"", "bodyweight", "none", "body weight"}


def equipment_ok(candidate_equipment: List[str], available: set) -> bool:
    """True if every piece the candidate needs is available (or it's bodyweight)."""
    needed = [e for e in (candidate_equipment or []) if (e or "").lower() not in _ALWAYS_AVAILABLE]
    if not needed:
        return True
    return all((e or "").lower() in available for e in needed)


def _muscle_overlap(a: List[str], b: List[str]) -> float:
    sa = {m.lower() for m in (a or [])}
    sb = {m.lower() for m in (b or [])}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def score_substitute(original: Dict[str, Any], candidate: Dict[str, Any]) -> float:
    """Stimulus-match score (higher = closer). Deterministic."""
    score = 0.0
    # Movement pattern is the strongest signal.
    if infer_movement_pattern(original) and infer_movement_pattern(original) == infer_movement_pattern(candidate):
        score += 3.0
    # Primary muscle overlap.
    score += 4.0 * _muscle_overlap(original.get("muscles", []), candidate.get("muscles", []))
    # Secondary muscle overlap (smaller weight).
    score += 1.0 * _muscle_overlap(original.get("secondaryMuscles", []), candidate.get("secondaryMuscles", []))
    # Strain similarity.
    o_strain, c_strain = original.get("strain") or {}, candidate.get("strain") or {}
    if o_strain.get("intensity") and o_strain.get("intensity") == c_strain.get("intensity"):
        score += 1.0
    if o_strain.get("load") and o_strain.get("load") == c_strain.get("load"):
        score += 1.0
    return round(score, 3)


def _is_pain_reason(reason: str) -> bool:
    low = (reason or "").lower()
    return any(term in low for term in _INJURY_HINT_TERMS)


async def _load_original(ctx: SkillContext, user_oid: Any, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ownership = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}
    ex_id = args.get("exercise_id")
    if ex_id:
        try:
            return await ctx.db.exercises.find_one({"_id": ObjectId(ex_id), **ownership})
        except Exception:
            return None
    name = args.get("exercise_name")
    if name:
        return await ctx.db.exercises.find_one({
            "name": {"$regex": f"^{name}$", "$options": "i"}, **ownership,
        })
    return None


@skill(
    name="substitute_exercise",
    description=(
        "Find a replacement exercise with a similar training stimulus (same movement "
        "pattern and muscles) that fits the user's available equipment — e.g. when they "
        "lack a machine or want variety. If the reason is pain or injury, it will NOT "
        "just swap the movement; it routes to a safety caution instead."
    ),
    parameters={
        "type": "object",
        "properties": {
            "exercise_id": {"type": "string", "description": "ID of the exercise to replace."},
            "exercise_name": {"type": "string", "description": "Name of the exercise to replace (if no ID)."},
            "reason": {"type": "string", "description": "Why swap (equipment, preference, pain, variety)."},
            "equipment": {"type": "array", "items": {"type": "string"}, "description": "Override available equipment (default: profile)."},
        },
    },
)
async def substitute_exercise(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    # Pain-driven requests route to safety, not a rehab swap.
    if _is_pain_reason(args.get("reason", "")):
        return {
            "success": True,
            "routed": "safety",
            "message": (
                "Since this is about pain or an injury, I won't just swap in another loaded "
                "movement. If a clinician has cleared you to train around it, tell me which area "
                "to avoid and I'll suggest a variation. Otherwise please rest it or check with a "
                "professional — I can't prescribe rehab."
            ),
        }

    original = await _load_original(ctx, user_oid, args)
    if not original:
        return {"success": False, "message": "I couldn't find that exercise to substitute."}

    # Available equipment: explicit override, else the user's profile.
    if args.get("equipment") is not None:
        equipment_list = args["equipment"]
    else:
        user = await ctx.db.users.find_one({"_id": user_oid}, {"profile.preferences.equipment": 1})
        equipment_list = (((user or {}).get("profile") or {}).get("preferences") or {}).get("equipment") or []
    available = {(e or "").lower() for e in equipment_list} | _ALWAYS_AVAILABLE

    # Candidate pool: shares at least one primary muscle, different exercise.
    ownership = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}
    query = {"muscles": {"$in": original.get("muscles", [])}, "_id": {"$ne": original["_id"]}, **ownership}
    candidates = await ctx.db.exercises.find(query).to_list(100)

    scored = [
        (score_substitute(original, c), c)
        for c in candidates
        if equipment_ok(c.get("equipment", []), available)
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    scored = [s for s in scored if s[0] > 0]

    if not scored:
        return {
            "success": True,
            "message": f"I couldn't find a good substitute for **{original.get('name')}** with your available equipment.",
            "substitute": None,
        }

    best_score, best = scored[0]
    alternatives = [
        {"id": str(c["_id"]), "name": c.get("name"), "score": sc}
        for sc, c in scored[1:4]
    ]
    return {
        "success": True,
        "message": (
            f"Swap **{original.get('name')}** → **{best.get('name')}** "
            f"(similar {', '.join(original.get('muscles', [])) or 'stimulus'}; match {best_score})."
        ),
        "substitute": {
            "id": str(best["_id"]),
            "name": best.get("name"),
            "stimulusMatchScore": best_score,
            "muscles": best.get("muscles", []),
            "equipment": best.get("equipment", []),
        },
        "alternatives": alternatives,
    }
