"""
Lightweight safety context for training skills.

This is NOT a medical screening gate. It surfaces caveats from data we already
have — `health`-category memories and the user's free-text `profile.injuries[]`
— so any skill that programs training can pass them into its LLM step and avoid
loading injured areas. A full PAR-Q/clearance gate is deliberately out of scope.

`build_safety_context` is a pure function (unit-testable); `get_safety_context`
fetches the inputs and calls it.
"""

from typing import Any, Dict, List

from bson import ObjectId

# Terms in a health note that imply "work around this", surfaced to the model.
_INJURY_HINT_TERMS = (
    "injury", "injured", "pain", "strain", "sprain", "tear", "surgery",
    "post-op", "hernia", "tendonitis", "tendinitis", "impingement",
    "condition", "asthma", "diabetes", "pregnan", "cardiac", "heart",
    "blood pressure", "hypertension",
)


def build_safety_context(health_memories: List[Dict[str, Any]], injuries: List[str]) -> Dict[str, Any]:
    """Pure: turn health memories + injuries into an inline caveat bundle."""
    caveats: List[str] = []
    flagged_terms: List[str] = []

    for mem in health_memories or []:
        content = (mem.get("content") or "").strip()
        if not content:
            continue
        caveats.append(content)
        low = content.lower()
        for term in _INJURY_HINT_TERMS:
            if term in low and term not in flagged_terms:
                flagged_terms.append(term)

    for injury in injuries or []:
        injury = (injury or "").strip()
        if injury:
            caveats.append(f"Reported injury/limitation: {injury}")
            flagged_terms.append(injury.lower())

    # If anything is flagged, hint the model to keep intensity conservative.
    intensity_hint = "conservative" if caveats else "normal"

    return {
        "caveats": caveats,
        "flagged_terms": flagged_terms,
        "intensity_hint": intensity_hint,
        "has_flags": bool(caveats),
    }


async def get_safety_context(ctx: Any, user_id: str) -> Dict[str, Any]:
    """Fetch health memories + profile injuries and build the caveat bundle."""
    health_memories: List[Dict[str, Any]] = []
    try:
        memories = await ctx.memory_service.get_user_memories(user_id)
        health_memories = [m for m in (memories or []) if m.get("category") == "health"]
    except Exception:
        health_memories = []

    injuries: List[str] = []
    try:
        user = await ctx.db.users.find_one({"_id": ObjectId(user_id)}, {"profile.injuries": 1})
        injuries = ((user or {}).get("profile") or {}).get("injuries") or []
    except Exception:
        injuries = []

    return build_safety_context(health_memories, injuries)


def format_caveats_for_prompt(safety: Dict[str, Any]) -> str:
    """Render caveats as a short prompt block, or an explicit 'none'."""
    caveats = safety.get("caveats") or []
    if not caveats:
        return "None reported."
    return "\n".join(f"- {c}" for c in caveats)
