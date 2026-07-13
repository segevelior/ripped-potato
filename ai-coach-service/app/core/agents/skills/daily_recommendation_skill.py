"""
Skill: get_daily_recommendation

Fetch (or lazily generate) the user's daily suggested workout — the "Today's
Pick" shown on the Dashboard / Train Now page, persisted in dailyRecommendations.

Reuses the Train Now endpoint's generator and its per-user locks so a dashboard
load racing a chat question produces ONE generation and both surfaces show the
same pick (TOR-19: the sensei must never invent a competing suggestion).
"""

import re
from typing import Any, Dict

from app.core.agents.skills.registry import SkillContext, skill
from app.services.recommendation_service import RecommendationService

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Handed to the model alongside the suggestion so it presents the pick as the
# thing already on the user's dashboard, not as a brand-new idea.
_PRESENTATION_NOTE = (
    "This is the Today's Pick already shown on the user's Dashboard / Train Now "
    "page — present it as such, not as a new suggestion of yours."
)


@skill(
    name="get_daily_recommendation",
    description=(
        "Fetch the user's daily suggested workout (\"Today's Pick\" on the Dashboard / "
        "Train Now page) with full blocks, exercises, sets and reasoning. If none exists "
        "yet for today, it generates and persists one (the same suggestion the dashboard "
        "will show). Use whenever the user asks what to do/train today, about \"today's "
        "pick\"/suggested workout, or wants its details — especially when the calendar "
        "has nothing scheduled today."
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
        },
    },
)
async def get_daily_recommendation(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    # Lazy import (same pattern as ensure_current_week_resolved) — the endpoint
    # module owns the generator and the per-user generation locks.
    from app.api.v1 import train_now as train_now_module

    recommendation_service = RecommendationService(ctx.db)

    today_date, timezone_hint = await train_now_module._get_user_local_date(ctx.db, user_id)

    date_arg = (args.get("date") or "today").strip().lower()
    if date_arg in ("", "today"):
        target_date = today_date
    elif _DATE_RE.match(date_arg):
        target_date = date_arg
    else:
        return {"success": False, "message": f"Invalid date '{args.get('date')}' — use 'today' or YYYY-MM-DD."}

    is_today = target_date == today_date

    doc = await recommendation_service.get_for_date(user_id, target_date)
    if doc and doc.get("suggestion"):
        return _found(doc, target_date, is_today, cached=True)

    generate_if_missing = args.get("generate_if_missing", True)
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

    # Generate under the SAME per-user lock as GET /train-now so a dashboard
    # load racing this chat turn results in one generation and one shared pick.
    import asyncio

    lock = train_now_module._generation_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        doc = await recommendation_service.get_for_date(user_id, target_date)
        if doc and doc.get("suggestion"):
            return _found(doc, target_date, is_today, cached=True)
        result = await train_now_module._generate_and_persist(
            ctx.db, ctx.settings, {"user_id": user_id}, user_id, target_date, timezone_hint
        )

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
        "cached": False,
        "suggestion": result.get("suggestion"),
        "note": _PRESENTATION_NOTE,
    }


def _found(doc: Dict[str, Any], target_date: str, is_today: bool, cached: bool) -> Dict[str, Any]:
    generated_at = doc.get("generatedAt")
    out = {
        "success": True,
        "date": target_date,
        "cached": cached,
        "suggestion": doc.get("suggestion"),
        "generated_at": generated_at.isoformat() + "Z" if generated_at else None,
    }
    if is_today:
        out["note"] = _PRESENTATION_NOTE
    return out
