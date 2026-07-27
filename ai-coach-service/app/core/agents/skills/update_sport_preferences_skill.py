"""
Skill: update_sport_preferences

Record a change the athlete VOLUNTEERED to their training interests
(profile.sportPreferences) — "I want to get into climbing", "drop the yoga".
Never used to interrogate: interests are set in the profile card or offered in
conversation, and the sensei must not ask about them unprompted.

Writes are atomic dot-path $addToSet/$pull on the one field, so they compose
with the backend's per-key profile updates instead of clobbering them.
NOTE: `users` is backend-owned under the approved single-writer refactor —
when coach writes move behind the backend internal API, this write moves too.
"""

from typing import Any, Dict, List

from bson import ObjectId
from pymongo import ReturnDocument

from app.core.disciplines import DISCIPLINES
from app.core.agents.skills.registry import SkillContext, skill


def _clean(values: Any) -> List[str]:
    """Lowercase, trim, dedupe preserving order. Free text is allowed BY
    DESIGN — 'triathlon' or 'ninja' is a sport in its own right, not just its
    component disciplines — so the only rejections are empty/oversized junk."""
    out: List[str] = []
    for value in values or []:
        if not isinstance(value, str):
            continue
        lower = value.strip().lower()
        if lower and len(lower) <= 60 and lower not in out:
            out.append(lower)
    return out


@skill(
    name="update_sport_preferences",
    description=(
        "Update the athlete's Training Interests (the sports they want in their "
        "life, shown in their profile) — ONLY when they explicitly state an "
        "interest change ('I want to get into climbing', 'I'm training for a "
        "triathlon', 'I'm done with yoga'). Any sport is valid, in the "
        "athlete's own words — keep 'triathlon' as 'triathlon', don't split it "
        "into swimming/cycling/running. Add and/or remove specific sports; "
        "never rewrite the whole list, and never call this to ask or guess. "
        "Confirm the change conversationally afterwards. NOT for spectator "
        "sports they watch (news follows) and NOT for logging activity."
    ),
    parameters={
        "type": "object",
        "properties": {
            "add": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Sports the athlete said they want in their training, in "
                    f"their own words. Common disciplines: {', '.join(DISCIPLINES)} "
                    "— but any sport is valid ('triathlon', 'ninja', 'surfing')."
                ),
            },
            "remove": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Sports the athlete said they no longer want (match their existing list).",
            },
        },
    },
)
async def update_sport_preferences(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    add = _clean(args.get("add"))
    remove = _clean(args.get("remove"))
    # A sport in both lists is a contradictory instruction — drop it from both
    # rather than guessing which the athlete meant.
    both = set(add) & set(remove)
    add = [d for d in add if d not in both]
    remove = [d for d in remove if d not in both]
    if not add and not remove:
        return {
            "success": False,
            "message": "Nothing to change — pass the sports to add and/or remove (canonical disciplines only).",
        }

    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user id."}

    # Mongo forbids $addToSet and $pull on the same path in one update
    # ("would create a conflict"), so apply them as two atomic updates.
    result = None
    if remove:
        result = await ctx.db.users.find_one_and_update(
            {"_id": user_oid},
            {"$pull": {"profile.sportPreferences": {"$in": remove}}},
            return_document=ReturnDocument.AFTER,
        )
    if add:
        result = await ctx.db.users.find_one_and_update(
            {"_id": user_oid},
            {"$addToSet": {"profile.sportPreferences": {"$each": add}}},
            return_document=ReturnDocument.AFTER,
        )
    if result is None:
        return {"success": False, "message": "User not found."}

    current = (result.get("profile") or {}).get("sportPreferences", [])
    parts = []
    if add:
        parts.append(f"added {', '.join(add)}")
    if remove:
        parts.append(f"removed {', '.join(remove)}")
    return {
        "success": True,
        "message": f"Training interests updated ({'; '.join(parts)}). Current interests: {', '.join(current) or 'none'}.",
        "sportPreferences": current,
    }
