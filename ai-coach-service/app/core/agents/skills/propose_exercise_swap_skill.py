"""Propose an in-workout exercise swap as a dry-run preview card.

Used by the mid-workout "Ask the Sensei" chat (the `[EXERCISE SWAP ...]`
message marker). Unlike `substitute_exercise` it NEVER hard-blocks on pain —
the conversation itself handles caution — and it mutates nothing: the result
carries a `preview_card` the UI renders as a tappable <exercise-swap> card,
and the swap is applied client-side through the live session's own pipeline.
"""

from typing import Any, Dict, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.substitute_exercise_skill import (
    _ALWAYS_AVAILABLE,
    _is_pain_reason,
    _load_original,
    equipment_ok,
    score_substitute,
)

PAIN_CAUTION = (
    "Since pain is involved: keep it light, stop if symptoms appear, and if this "
    "keeps happening get it checked — I can't prescribe rehab."
)


async def _load_replacement(ctx: SkillContext, user_oid: ObjectId, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Resolve an explicitly requested replacement from the catalog, if any."""
    return await _load_original(
        ctx,
        user_oid,
        {"exercise_id": args.get("replacement_id"), "exercise_name": args.get("replacement_name")},
    )


def _card_new_entry(args: Dict[str, Any], original: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """A replacement that isn't in the catalog — the client materializes it.

    Muscles are required by the Exercise model, so when the model omits them
    the original's muscles are inherited (same trade-off as substitute_rank)."""
    muscles = args.get("replacement_muscles") or (original or {}).get("muscles") or []
    return {
        "id": None,
        "name": args.get("replacement_name"),
        "muscles": muscles,
        "equipment": args.get("replacement_equipment") or [],
        "isNew": True,
    }


def _card_catalog_entry(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name"),
        "muscles": doc.get("muscles", []) or [],
        "equipment": doc.get("equipment", []) or [],
        "isNew": False,
    }


@skill(
    name="propose_exercise_swap",
    description=(
        "Propose swapping an exercise in the user's LIVE workout session (the "
        "[EXERCISE SWAP ...] context). Returns a preview card the user can tap to "
        "apply — it changes nothing by itself. Use it once you know what to suggest; "
        "if the user reports pain, converse first (where does it hurt? cleared to "
        "train?) and then propose something that avoids the painful area."
    ),
    parameters={
        "type": "object",
        "properties": {
            "exercise_id": {"type": "string", "description": "ID of the session exercise to replace (from the [EXERCISE SWAP] marker)."},
            "exercise_name": {"type": "string", "description": "Name of the session exercise to replace (if no ID)."},
            "replacement_id": {"type": "string", "description": "Catalog ID of the replacement, when the user (or you) already picked one."},
            "replacement_name": {"type": "string", "description": "Replacement name — catalog name, or a well-known exercise not in the catalog."},
            "replacement_muscles": {"type": "array", "items": {"type": "string"}, "description": "Primary muscles, ONLY for a replacement that's not in the catalog."},
            "replacement_equipment": {"type": "array", "items": {"type": "string"}, "description": "Equipment, ONLY for a replacement that's not in the catalog."},
            "reason": {"type": "string", "description": "Why the user wants to swap (pain, equipment, variety, too hard...)."},
            "offer_permanent": {"type": "boolean", "description": "Offer to also update the workout template (recurring reason + template-linked session)."},
        },
    },
)
async def propose_exercise_swap(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    original = await _load_original(ctx, user_oid, args)
    original_name = (original or {}).get("name") or args.get("exercise_name") or "that exercise"

    reason = args.get("reason") or ""
    painful = _is_pain_reason(reason)

    # Resolve the replacement: explicit pick > best-scored candidate.
    replacement_doc = await _load_replacement(ctx, user_oid, args)
    new_entry: Optional[Dict[str, Any]] = None
    note = None

    if replacement_doc is not None:
        new_entry = _card_catalog_entry(replacement_doc)
    elif args.get("replacement_name"):
        new_entry = _card_new_entry(args, original)
        note = "New exercise — it will be added to your catalog when applied."
    elif original is not None:
        user = await ctx.db.users.find_one({"_id": user_oid}, {"profile.preferences.equipment": 1})
        equipment_list = (((user or {}).get("profile") or {}).get("preferences") or {}).get("equipment") or []
        available = {(e or "").lower() for e in equipment_list} | _ALWAYS_AVAILABLE

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
        if painful and scored:
            # Prefer lower-strain candidates when pain is in play.
            low = [s for s in scored if (s[1].get("strain") or {}).get("intensity") in ("low", "moderate")]
            scored = low or scored
        if scored:
            new_entry = _card_catalog_entry(scored[0][1])

    if new_entry is None or not new_entry.get("name"):
        return {
            "success": False,
            "message": (
                f"I couldn't resolve a replacement for {original_name}. "
                "Ask the user what they'd like to swap in, or name a specific exercise."
            ),
        }

    offer_permanent = bool(args.get("offer_permanent")) or painful

    card = {
        "v": 1,
        "old": {
            "id": str(original["_id"]) if original else None,
            "name": original_name,
        },
        "new": new_entry,
        "reason": reason or None,
        "offerPermanent": offer_permanent,
        "note": note,
    }

    caution = f" {PAIN_CAUTION}" if painful else ""
    return {
        "success": True,
        "dry_run": True,
        "preview_card_tag": "exercise-swap",
        "message": (
            f"Proposed swap: {original_name} → {new_entry['name']}. "
            "The user is already shown a tappable swap card in the UI — do NOT repeat "
            "the details or output any tag yourself. Reply with ONE short sentence "
            f"explaining why this fits.{caution}"
        ),
        "proposal": {"old": card["old"], "new": card["new"], "offerPermanent": offer_permanent},
        "preview_card": card,
    }
