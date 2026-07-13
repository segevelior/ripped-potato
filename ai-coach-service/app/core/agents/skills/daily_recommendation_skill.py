"""
Skill: get_daily_recommendation

Fetch (or lazily generate, or refresh) the user's daily suggested workout —
the "Today's Pick" shown on the Dashboard / Train Now page, persisted in
dailyRecommendations.

Delegates to daily_pick_service.get_or_generate_today_pick, the same entry
point the GET /train-now endpoint uses (shared per-user lock), so a dashboard
load racing a chat turn produces ONE generation and both surfaces show the
same pick (TOR-19: the sensei must never invent a competing suggestion).
"""

import re
from datetime import datetime
from typing import Any, Dict

from app.core.agents.skills.registry import SkillContext, skill
from app.services.daily_pick_service import get_or_generate_today_pick, get_user_local_date
from app.services.recommendation_service import RecommendationService

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Handed to the model alongside the suggestion so it presents the pick as the
# thing already on the user's dashboard, not as a brand-new idea.
_PRESENTATION_NOTE = (
    "This is the Today's Pick already shown on the user's Dashboard / Train Now "
    "page — present it as such, not as a new suggestion of yours."
)
_REFRESHED_NOTE = (
    "This is a fresh Today's Pick that REPLACES the previous one — the Dashboard / "
    "Train Now page now shows this new suggestion too."
)


@skill(
    name="get_daily_recommendation",
    description=(
        "Fetch the user's daily suggested workout (\"Today's Pick\" on the Dashboard / "
        "Train Now page) with full blocks, exercises, sets and reasoning. If none exists "
        "yet for today, it generates and persists one (the same suggestion the dashboard "
        "will show). Use whenever the user asks what to do/train today, about \"today's "
        "pick\"/suggested workout, or wants its details — especially when the calendar "
        "has nothing scheduled today. If the user dislikes today's pick and wants a "
        "different one, call it with refresh=true to regenerate (the dashboard updates too)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": "'today' (default) or a past YYYY-MM-DD within the last 30 days.",
            },
            "generate_if_missing": {
                "type": "boolean",
                "description": "Generate a fresh pick when none exists (only applies to today). Default true.",
            },
            "refresh": {
                "type": "boolean",
                "description": "Discard today's pick and generate a different one (only applies to today). Use when the user rejects the current pick. Default false.",
            },
        },
    },
)
async def get_daily_recommendation(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    recommendation_service = RecommendationService(ctx.db)

    today_date, _timezone = await get_user_local_date(ctx.db, user_id)

    date_arg = (args.get("date") or "today").strip().lower()
    if date_arg in ("", "today"):
        target_date = today_date
    elif _DATE_RE.match(date_arg):
        target_date = date_arg
    else:
        return {"success": False, "message": f"Invalid date '{args.get('date')}' — use 'today' or YYYY-MM-DD."}

    is_today = target_date == today_date
    # Explicit `is`-checks: the model may pass null for optionals, which must
    # keep the defaults (generate on, refresh off) rather than flip them.
    refresh = is_today and args.get("refresh") is True
    generate_if_missing = args.get("generate_if_missing") is not False

    if not refresh:
        doc = await recommendation_service.get_for_date(user_id, target_date)
        if doc and doc.get("suggestion"):
            return _found(doc, target_date, is_today)
        if not is_today or not generate_if_missing:
            return {
                "success": True,
                "date": target_date,
                "suggestion": None,
                "message": (
                    "No daily recommendation was generated for that date."
                    if not is_today
                    else "No Today's Pick has been generated yet today."
                ),
            }

    # Generate (or regenerate) through the shared service — same per-user lock
    # as GET /train-now, so dashboard + chat converge on one pick.
    result = await get_or_generate_today_pick(ctx.db, ctx.settings, user_id, refresh=refresh)

    if not result.get("success"):
        return {
            "success": False,
            "date": target_date,
            "suggestion": None,
            "message": result.get("error") or "Could not generate today's suggestion.",
        }
    return {
        "success": True,
        "date": target_date,
        "cached": bool(result.get("cached")),
        "suggestion": result.get("suggestion"),
        "note": _REFRESHED_NOTE if refresh else _PRESENTATION_NOTE,
    }


def _found(doc: Dict[str, Any], target_date: str, is_today: bool) -> Dict[str, Any]:
    generated_at = doc.get("generatedAt")
    out = {
        "success": True,
        "date": target_date,
        "cached": True,
        "suggestion": doc.get("suggestion"),
        "generated_at": generated_at.isoformat() + "Z" if isinstance(generated_at, datetime) else None,
    }
    if is_today:
        out["note"] = _PRESENTATION_NOTE
    return out
