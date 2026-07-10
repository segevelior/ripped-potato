"""
Skill: validate_plan

Deterministic Tier-2 quality checks over a training plan document, using the
sourced constants in knowledge/training_knowledge.py. No writes, no LLM — pure
logic so it's fully testable and reused by generate_plan and adjust_plan.

Checks (all computable from the Plan doc alone):
- frequency: sessions/week vs the goal minimum
- volume: working sets/week vs the goal minimum
- rest: at least one rest day per training week
- deload: a deload week exists for long-enough plans (advisory)
- ramp: no aggressive week-over-week volume jump
- goal specificity: endurance/health/weight goals include aerobic work

Set counting: custom workouts contribute len(exercises[].sets); predefined
workouts are counted with a fixed proxy (we don't resolve their template here).
"""

from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge import training_knowledge as tk

# Sets assumed per predefined workout when we can't resolve its template.
_PREDEFINED_SET_PROXY = 12


def _week_metrics(week: Dict[str, Any]) -> Tuple[int, int, List[Dict[str, Any]]]:
    """Return (sessions, working_sets, workouts) for one week."""
    workouts = week.get("workouts", []) or []
    sets = 0
    for w in workouts:
        if w.get("workoutType") == "custom":
            custom = w.get("customWorkout") or {}
            for ex in custom.get("exercises", []) or []:
                sets += len(ex.get("sets", []) or [])
        else:
            sets += _PREDEFINED_SET_PROXY
    return len(workouts), sets, workouts


def _has_aerobic(weeks: List[Dict[str, Any]]) -> bool:
    for week in weeks:
        for w in week.get("workouts", []) or []:
            wtype = ((w.get("customWorkout") or {}).get("type") or "").lower()
            if wtype in tk.AEROBIC_WORKOUT_TYPES:
                return True
    return False


def validate_plan_doc(plan: Dict[str, Any], goal_category: str) -> Dict[str, Any]:
    """Pure validator. Returns {valid, violations[], suggestions[], metrics}."""
    violations: List[str] = []
    suggestions: List[str] = []

    weeks = sorted(plan.get("weeks", []) or [], key=lambda w: w.get("weekNumber", 0))
    weeks_total = (plan.get("schedule") or {}).get("weeksTotal") or len(weeks)

    if not weeks or all(not (w.get("workouts") or []) for w in weeks):
        return {
            "valid": False,
            "violations": ["The plan has no workouts."],
            "suggestions": ["Add workouts to each training week before scheduling."],
            "metrics": {"weeks_total": weeks_total, "avg_sessions_per_week": 0, "avg_weekly_sets": 0, "has_deload": False},
        }

    per_week = [_week_metrics(w) for w in weeks]
    sessions_list = [m[0] for m in per_week]
    sets_list = [m[1] for m in per_week]
    training_weeks = [m for m in per_week if m[0] > 0]
    avg_sessions = sum(sessions_list) / len(training_weeks) if training_weeks else 0
    avg_sets = sum(sets_list) / len(training_weeks) if training_weeks else 0

    # V1 frequency
    min_sessions = tk.min_sessions_for_goal(goal_category)
    if avg_sessions < min_sessions:
        violations.append(
            f"Only ~{avg_sessions:.1f} sessions/week; a {goal_category} goal needs at least {min_sessions}."
        )

    # V2 volume
    min_sets = tk.min_weekly_sets_for_goal(goal_category)
    if avg_sets < min_sets:
        violations.append(
            f"~{avg_sets:.0f} working sets/week is below the ~{min_sets} recommended for a {goal_category} goal."
        )

    # V3 rest — each training week should leave at least one day off
    for week, (sessions, _sets, _w) in zip(weeks, per_week):
        rest_days = week.get("restDays", []) or []
        if sessions >= 7 and not rest_days:
            violations.append(f"Week {week.get('weekNumber')} schedules training every day with no rest day.")

    # V4 deload (advisory)
    has_deload = any(w.get("deloadWeek") for w in weeks)
    if tk.expects_deload(weeks_total) and not has_deload:
        suggestions.append(
            f"Plans of {weeks_total} weeks benefit from a deload every {tk.DELOAD_EVERY_WEEKS_MIN}–{tk.DELOAD_EVERY_WEEKS_MAX} weeks; none is marked."
        )

    # V5 ramp — flag aggressive week-over-week volume jumps
    for i in range(1, len(sets_list)):
        prev, cur = sets_list[i - 1], sets_list[i]
        if prev > 0 and cur > prev * tk.WEEKLY_RAMP_HARD_FLAG:
            violations.append(
                f"Week {weeks[i].get('weekNumber')} volume jumps {((cur/prev)-1)*100:.0f}% over the prior week (aggressive)."
            )

    # V6 goal specificity — aerobic-oriented goals need aerobic work
    if goal_category.lower() in {"endurance", "health", "weight"} and not _has_aerobic(weeks):
        suggestions.append(
            f"A {goal_category} goal should include aerobic/cardio sessions ({tk.WHO_AEROBIC_MIN_MINUTES}–{tk.WHO_AEROBIC_MAX_MINUTES} min/week)."
        )

    return {
        "valid": len(violations) == 0,
        "violations": violations,
        "suggestions": suggestions,
        "metrics": {
            "weeks_total": weeks_total,
            "avg_sessions_per_week": round(avg_sessions, 1),
            "avg_weekly_sets": round(avg_sets),
            "has_deload": has_deload,
        },
    }


async def _resolve_goal_category(ctx: SkillContext, plan: Dict[str, Any], user_oid: Any) -> str:
    """Best-effort goal category from the plan's linked goal; default 'general'."""
    goal_id = plan.get("goalId")
    if not goal_id:
        return "general"
    try:
        goal = await ctx.db.goals.find_one({"_id": goal_id, "userId": user_oid}, {"category": 1})
        return (goal or {}).get("category") or "general"
    except Exception:
        return "general"


@skill(
    name="validate_plan",
    description=(
        "Check a training plan for quality/safety issues (volume, frequency, rest, "
        "deload, ramp, goal fit) BEFORE scheduling it or after the user edits it. "
        "Returns violations and suggestions; does not modify anything."
    ),
    parameters={
        "type": "object",
        "properties": {
            "plan_id": {"type": "string", "description": "The ID of the plan to validate."},
        },
        "required": ["plan_id"],
    },
)
async def validate_plan(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    plan_id = args.get("plan_id")
    if not plan_id:
        return {"success": False, "message": "plan_id is required."}
    try:
        plan_oid = ObjectId(plan_id)
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid plan_id."}

    plan = await ctx.db.plans.find_one({"_id": plan_oid, "userId": user_oid})
    if not plan:
        return {"success": False, "message": "Plan not found."}

    goal_category = await _resolve_goal_category(ctx, plan, user_oid)
    report = validate_plan_doc(plan, goal_category)

    if report["valid"]:
        msg = f"✅ Plan looks solid ({report['metrics']['avg_sessions_per_week']} sessions/wk, ~{report['metrics']['avg_weekly_sets']} sets/wk)."
        if report["suggestions"]:
            msg += " A couple of optional improvements:\n" + "\n".join(f"- {s}" for s in report["suggestions"])
    else:
        msg = "⚠️ A few things to fix:\n" + "\n".join(f"- {v}" for v in report["violations"])
        if report["suggestions"]:
            msg += "\n\nOptional:\n" + "\n".join(f"- {s}" for s in report["suggestions"])

    return {"success": True, "message": msg, **report}
