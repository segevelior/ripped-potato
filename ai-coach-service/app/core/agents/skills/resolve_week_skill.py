"""
Skill: resolve_week

Materialize the next week(s) of a skeleton-based plan into concrete workouts,
adapting volume to the user's recent adherence and health notes. This is the
"rolling horizon" half of the skeleton architecture: generate_plan writes weeks
1-2 concretely and leaves later weeks as intent-only stubs; this skill (called
from chat, train-now, or the weekly internal resolver) fills each week as it
approaches, so the plan tracks reality instead of a 12-week-old guess.

Deterministic — no LLM call: the skeleton's per-phase session blueprints carry
the exercise intelligence; adaptation is pure rules over adherence + safety
(plan_builder.compute_adaptation). Legacy fully-materialized plans no-op.

dry_run defaults FALSE (unlike schedule/adjust): resolving fills an empty week
from the plan's own skeleton — additive, no calendar writes. Scheduling the
resolved week onto the calendar remains a separately-confirmed step.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.plan_builder import (
    DEFAULT_HORIZON_WEEKS,
    compute_adaptation,
    materialize_week,
    week_intent,
    week_is_resolved,
)
from app.core.agents.skills.review_progress_skill import compute_adherence
from app.core.agents.skills.safety import get_safety_context
from app.core.agents.skills.validate_plan_skill import validate_plan_doc

_ADHERENCE_WINDOW_DAYS = 28
_LOW_ADHERENCE_PCT = 70


def pick_target_week(
    weeks: List[Dict[str, Any]], current_week: int, horizon: int,
    explicit: Optional[int] = None,
) -> Optional[int]:
    """Pure: choose which week to resolve. Explicit request wins (if that week
    exists and is unresolved); else the first unresolved week within the
    horizon ahead of the current week."""
    by_number = {w.get("weekNumber"): w for w in weeks}
    if explicit is not None:
        wk = by_number.get(explicit)
        return explicit if wk is not None and not week_is_resolved(wk) else None
    limit = current_week + horizon - 1
    for w in sorted(weeks, key=lambda x: x.get("weekNumber", 0)):
        if not week_is_resolved(w) and w.get("weekNumber", 0) <= limit:
            return w.get("weekNumber")
    return None


def weeks_since_last_deload(weeks: List[Dict[str, Any]], target_week: int) -> Optional[int]:
    """Pure: distance from the most recent deload week before the target."""
    deloads = [w.get("weekNumber", 0) for w in weeks
               if w.get("deloadWeek") and w.get("weekNumber", 0) < target_week]
    return (target_week - max(deloads)) if deloads else None


@skill(
    name="resolve_week",
    description=(
        "Materialize the next week(s) of a skeleton-based training plan into concrete "
        "workouts, adapting volume to recent adherence and health notes. Use when a plan's "
        "upcoming week isn't written out yet, or the user asks to 'finalize'/'resolve' a week. "
        "No-op on fully materialized (legacy) plans. Does NOT touch the calendar — offer "
        "schedule_plan_to_calendar for the resolved week afterward."
    ),
    parameters={
        "type": "object",
        "properties": {
            "plan_id": {"type": "string", "description": "The plan whose next week to resolve."},
            "week_number": {
                "type": "integer", "minimum": 1,
                "description": "Specific week to resolve (default: first unresolved week within the horizon).",
            },
            "horizon": {
                "type": "integer", "minimum": 1, "maximum": 12,
                "description": f"How many weeks ahead of the current week to keep resolved (default {DEFAULT_HORIZON_WEEKS}).",
            },
            "dry_run": {"type": "boolean", "description": "Preview only, no writes. Default false."},
        },
        "required": ["plan_id"],
    },
)
async def resolve_week(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    plan_id = args.get("plan_id")
    if not plan_id:
        return {"success": False, "message": "plan_id is required."}
    try:
        plan_oid = ObjectId(plan_id)
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid plan_id."}

    plan = await ctx.db.plans.find_one({
        "_id": plan_oid, "userId": user_oid,
        "status": {"$in": ["draft", "active", "paused"]},
    })
    if not plan:
        return {"success": False, "message": "Plan not found (or it's already completed)."}

    skeleton = plan.get("skeleton")
    weeks = plan.get("weeks") or []
    if not skeleton:
        return {"success": True, "noop": True,
                "message": "This plan is fully written out already — nothing to resolve."}

    current_week = (plan.get("progress") or {}).get("currentWeek", 1)
    horizon = int(args.get("horizon") or DEFAULT_HORIZON_WEEKS)
    target = pick_target_week(weeks, current_week, horizon, args.get("week_number"))
    if target is None:
        return {"success": True, "noop": True,
                "message": f"All weeks up to week {min(current_week + horizon - 1, len(weeks))} are already finalized."}

    # --- Inputs: schedule days, adherence, safety ---
    schedule = plan.get("schedule") or {}
    workout_days = schedule.get("preferredWorkoutDays") or [1, 3, 5]

    now = datetime.utcnow()
    events = await ctx.db.calendarevents.find({
        "userId": user_oid,
        "date": {"$gte": now - timedelta(days=_ADHERENCE_WINDOW_DAYS), "$lte": now},
        "status": {"$ne": "cancelled"},
    }).to_list(None)
    adherence = compute_adherence(events, now)
    safety = await get_safety_context(ctx, user_id)

    intent = week_intent(skeleton, target)
    prev_intent = week_intent(skeleton, target - 1) if target > 1 else {"volumeMultiplier": 1.0}
    this_mult = float(intent.get("volumeMultiplier", 1.0) or 1.0)
    prev_mult = float(prev_intent.get("volumeMultiplier", 1.0) or 1.0)

    streak = int((plan.get("progress") or {}).get("lowAdherenceStreak", 0) or 0)
    pct = adherence.get("adherencePct")
    new_streak = streak + 1 if (pct is not None and pct < _LOW_ADHERENCE_PCT) else 0

    effective, note, converted_deload = compute_adaptation(
        adherence,
        bool(safety.get("has_flags")),
        this_mult,
        prev_mult,
        consecutive_low_weeks=new_streak,
        weeks_since_deload=weeks_since_last_deload(weeks, target),
    )

    # materialize_week composes intent.volumeMultiplier with the passed factor,
    # so pass the ratio that lands on the adapted effective multiplier.
    ratio = effective / this_mult if this_mult else 1.0
    week = materialize_week(skeleton, target, workout_days, volume_multiplier=ratio, note=note)
    if not week:
        return {"success": False, "message": f"Week {target} isn't covered by the plan's structure — regenerate the plan."}
    if converted_deload:
        week["deloadWeek"] = True
        week["focus"] = week.get("focus") or "Deload"

    # --- Validate the materialized horizon including the new week ---
    resolved_weeks = [w for w in weeks if week_is_resolved(w) and (w.get("workouts") or [])]
    resolved_weeks = [w for w in resolved_weeks if w.get("weekNumber") != target] + [week]
    report = validate_plan_doc(
        {"schedule": {**schedule, "weeksTotal": len(resolved_weeks)}, "weeks": resolved_weeks},
        "general",
    )

    session_count = len(week.get("workouts") or [])
    msg = f"Week {target} is now written out: {session_count} session(s), focus: {week.get('focus') or intent.get('phase', '')}."
    if note:
        msg += f"\n{note}"
    if not report["valid"]:
        msg += "\nHeads up:\n" + "\n".join(f"- {v}" for v in report["violations"])
    msg += "\nWant me to put it on your calendar?"

    if args.get("dry_run", False):
        return {"success": True, "dry_run": True, "week_number": target,
                "adaptation_note": note, "validation": report, "message": msg}

    # --- Write: replace the week element in place ---
    new_weeks = [week if w.get("weekNumber") == target else w for w in weeks]
    total_workouts = sum(len(w.get("workouts", []) or []) for w in new_weeks)
    await ctx.db.plans.update_one(
        {"_id": plan_oid, "userId": user_oid},
        {"$set": {
            "weeks": new_weeks,
            "progress.totalWorkouts": total_workouts,
            "progress.lowAdherenceStreak": 0 if converted_deload else new_streak,
            "updatedAt": now,
        }},
    )

    return {
        "success": True,
        "dry_run": False,
        "week_number": target,
        "sessions": session_count,
        "adaptation_note": note,
        "converted_to_deload": converted_deload,
        "validation": report,
        "message": msg,
    }
