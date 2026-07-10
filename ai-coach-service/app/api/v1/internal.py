"""
Internal (cron-invoked) endpoints. Not user-facing: authenticated by a shared
secret header (X-Internal-Key vs INTERNAL_API_KEY), not a user JWT — the Render
cron can't mint user tokens.

POST /internal/resolve-weeks — the weekly resolver for skeleton plans:
for every ACTIVE skeleton plan (unless the user opted out via
settings.autoAdvance == false):
  1. advance progress.currentWeek by AT MOST one week if >=7 days elapsed since
     the last advancement (incremental on purpose — recomputing from startDate
     would skip weeks for plans that were paused),
  2. resolve unresolved weeks up to currentWeek+1 (adherence-adaptive), and
  3. schedule the newly resolved weeks onto the calendar (slot-idempotent).

Each plan is processed in its own try/except: one bad plan never aborts the
rest. The response is a per-plan summary for cron logs.

The lazy hook in train-now covers the gaps (cron outage, mid-week activation).
"""

import secrets
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.core.agents.context_factory import build_skill_context
from app.core.agents.skills.plan_builder import compute_current_week, week_is_resolved
from app.core.agents.skills.resolve_week_skill import resolve_week
from app.core.agents.skills.schedule_plan_skill import schedule_plan_to_calendar

import structlog

router = APIRouter()
logger = structlog.get_logger()

# Safety valve: resolve at most this many weeks per plan per run.
_MAX_RESOLVES_PER_PLAN = 3


def _check_internal_key(provided: str) -> None:
    settings = get_settings()
    expected = settings.internal_api_key
    if not expected or not provided or not secrets.compare_digest(str(provided), str(expected)):
        raise HTTPException(status_code=403, detail="Forbidden")


async def resolve_plan(ctx, plan: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    """Process one active skeleton plan: advance week, resolve, schedule."""
    plan_id = str(plan["_id"])
    user_id = str(plan["userId"])
    summary: Dict[str, Any] = {"plan_id": plan_id, "advanced": False, "resolved_weeks": [], "scheduled": 0}

    progress = plan.get("progress") or {}
    schedule = plan.get("schedule") or {}
    weeks_total = schedule.get("weeksTotal") or len(plan.get("weeks") or [])

    # 1. Incremental week advancement (never recompute from startDate).
    new_week, new_anchor, changed = compute_current_week(
        progress.get("currentWeek", 1),
        weeks_total,
        progress.get("weekAdvancedAt"),
        plan.get("startDate"),
        now,
    )
    # Respect a further-along week written by the backend's completion-based
    # advanceToNextWeek — take the later of the two writers.
    current_week = max(new_week, progress.get("currentWeek", 1))
    if changed and current_week == new_week:
        await ctx.db.plans.update_one(
            {"_id": plan["_id"]},
            {"$set": {"progress.currentWeek": current_week, "progress.weekAdvancedAt": new_anchor}},
        )
        summary["advanced"] = True

    # 2. Resolve unresolved weeks up to currentWeek+1.
    for _ in range(_MAX_RESOLVES_PER_PLAN):
        result = await resolve_week(ctx, user_id, {"plan_id": plan_id, "horizon": 2})
        if not result.get("success") or result.get("noop"):
            break
        summary["resolved_weeks"].append(result.get("week_number"))

    # 3. Schedule the resolved range (slot-idempotent; re-runs insert nothing).
    if summary["resolved_weeks"]:
        sched = await schedule_plan_to_calendar(ctx, user_id, {
            "plan_id": plan_id,
            "weeks": min(current_week + 1, weeks_total),
            "dry_run": False,
        })
        summary["scheduled"] = sched.get("events_created", 0)
        if not sched.get("success"):
            summary["schedule_error"] = sched.get("message")

    return summary


@router.post("/resolve-weeks")
async def resolve_weeks(x_internal_key: str = Header(default="")) -> Dict[str, Any]:
    _check_internal_key(x_internal_key)
    from app.main import db

    ctx = build_skill_context(db)
    now = datetime.utcnow()

    # Active skeleton plans only. Paused plans are deliberately excluded (they
    # resume advancing at +1/week when reactivated). autoAdvance opt-out is
    # EXPLICIT false only — a missing flag means enabled, otherwise the feature
    # would be dead for every existing plan.
    plans = await db.plans.find({
        "status": "active",
        "skeleton": {"$exists": True},
        "settings.autoAdvance": {"$ne": False},
    }).to_list(None)

    results: List[Dict[str, Any]] = []
    errors = 0
    for plan in plans:
        try:
            results.append(await resolve_plan(ctx, plan, now))
        except Exception as e:  # one bad plan must not abort the rest
            errors += 1
            logger.error("resolve-weeks failed for plan", plan_id=str(plan.get("_id")), error=str(e))
            results.append({"plan_id": str(plan.get("_id")), "error": str(e)})

    summary = {"plans_processed": len(plans), "errors": errors, "results": results}
    logger.info("resolve-weeks run complete", plans=len(plans), errors=errors)
    return summary
