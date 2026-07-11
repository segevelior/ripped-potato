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


def _session_timed_minutes(custom: Dict[str, Any]) -> int:
    """Minutes of timed work in a session = sum of set['time'] (seconds) / 60.
    Runs/holds are stored as timed sets, so this is the ground truth for a
    session's aerobic time regardless of its durationMinutes label."""
    seconds = sum(
        int(s.get("time") or 0)
        for ex in (custom.get("exercises") or [])
        for s in (ex.get("sets") or [])
    )
    return seconds // 60


def _aerobic_minutes(workouts_list: List[Dict[str, Any]]) -> int:
    """Aerobic minutes in one week's workouts. Measured from the actual timed work
    in each session (the model sometimes leaves durationMinutes at the target while
    the real run length lives in the sets), falling back to durationMinutes for a
    cardio session that carries no timed sets. Hybrid (strength+run) sessions
    contribute only their timed portion, so strength blocks aren't miscounted."""
    minutes = 0
    for w in workouts_list:
        custom = w.get("customWorkout") or {}
        wtype = (custom.get("type") or "").lower()
        timed = _session_timed_minutes(custom)
        if wtype in tk.AEROBIC_WORKOUT_TYPES:
            minutes += timed or int(custom.get("durationMinutes") or 0)
        elif wtype == "hybrid":
            minutes += timed
    return minutes


def _has_aerobic(weeks: List[Dict[str, Any]]) -> bool:
    """Any aerobic stimulus present? True for cardio/hiit/endurance sessions, and
    for hybrid sessions that carry timed work (embedded runs)."""
    for week in weeks:
        for w in week.get("workouts", []) or []:
            custom = w.get("customWorkout") or {}
            wtype = (custom.get("type") or "").lower()
            if wtype in tk.AEROBIC_WORKOUT_TYPES:
                return True
            if wtype == "hybrid" and any(
                (s.get("time") or 0)
                for ex in (custom.get("exercises") or [])
                for s in (ex.get("sets") or [])
            ):
                return True
    return False


def validate_plan_doc(plan: Dict[str, Any], goal_category: str, check_ramp: bool = True) -> Dict[str, Any]:
    """Pure validator. Returns {valid, violations[], suggestions[], metrics}.

    `check_ramp`: run the materialized week-over-week set-count ramp check (V5).
    Skeleton-based plans should pass check_ramp=False — set counts differ across
    phases by design (different blueprints), not by load ramp, so V5 produces
    false positives there; `validate_skeleton` does the authoritative, deload-aware
    ramp check on the week-intent multipliers instead.
    """
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

    # V2 volume. Set-counting is meaningless for endurance work (a 2-hour run is
    # one "set"), so aerobic-oriented goals are measured in weekly aerobic
    # MINUTES against the WHO floor instead.
    if goal_category.lower() in {"endurance", "weight", "health"}:
        # Aerobic minutes/week. A progressive plan starts low and BUILDS, so the
        # whole-horizon average understates a good beginner plan (early base weeks
        # drag it down). Judge the plan by whether it ever builds to an adequate
        # dose: the peak non-deload week vs the WHO floor. A plan that never reaches
        # the floor is genuinely under-dosing aerobic work for the goal.
        weekly_minutes = [
            _aerobic_minutes(workouts_list)
            for week, (sessions, _s, workouts_list) in zip(weeks, per_week)
            if sessions > 0 and not week.get("deloadWeek")
        ]
        peak_minutes = max(weekly_minutes) if weekly_minutes else 0
        if peak_minutes < tk.WHO_AEROBIC_MIN_MINUTES:
            msg = (
                f"Aerobic volume peaks at ~{peak_minutes} min/week, below the "
                f"{tk.WHO_AEROBIC_MIN_MINUTES} recommended for a {goal_category} goal — "
                f"the plan should build key sessions longer."
            )
            # Strength-only training is a legitimate health plan (WHO also has
            # muscle-strengthening guidance) — advisory there, hard for
            # endurance/weight goals where aerobic work IS the goal.
            if goal_category.lower() == "health":
                suggestions.append(msg)
            else:
                violations.append(msg)
    else:
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

    # V5 ramp — flag aggressive week-over-week volume jumps. Deload-aware: a
    # deload week legitimately drops volume, so the rebuild after it (or the drop
    # into it) is not an "aggressive jump". Skipped entirely for skeleton plans
    # (see check_ramp docstring).
    if check_ramp:
        for i in range(1, len(sets_list)):
            if weeks[i - 1].get("deloadWeek") or weeks[i].get("deloadWeek"):
                continue
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


def validate_skeleton(skeleton: Dict[str, Any], goal_category: str, weeks_total: int) -> Dict[str, Any]:
    """Pure structural/quality checks over a plan skeleton (macro layer).
    Complements validate_plan_doc, which only sees materialized weeks."""
    violations: List[str] = []
    suggestions: List[str] = []
    phases = skeleton.get("phases") or []

    if not phases:
        return {"valid": False, "violations": ["The skeleton has no phases."], "suggestions": []}

    # Coverage: contiguous phases over 1..weeks_total (normalize_skeleton should
    # guarantee this; validating catches regressions).
    covered = set()
    for p in phases:
        covered.update(range(int(p.get("startWeek", 0)), int(p.get("endWeek", -1)) + 1))
    missing = [w for w in range(1, weeks_total + 1) if w not in covered]
    if missing:
        violations.append(f"Weeks not covered by any phase: {missing}.")

    # Frequency: per-phase discipline sessions vs the goal minimum.
    min_sessions = tk.min_sessions_for_goal(goal_category)
    for p in phases:
        total = sum(int(d.get("sessionsPerWeek", 0) or 0) for d in (p.get("disciplines") or []))
        if total and total < min_sessions:
            violations.append(
                f"Phase '{p.get('name')}' plans {total} sessions/week; a {goal_category} goal needs at least {min_sessions}."
            )

    # Deload cadence for long plans.
    if tk.expects_deload(weeks_total) and not skeleton.get("deloadWeeks"):
        suggestions.append(
            f"Plans of {weeks_total} weeks benefit from a deload every "
            f"{tk.DELOAD_EVERY_WEEKS_MIN}–{tk.DELOAD_EVERY_WEEKS_MAX} weeks; none is marked."
        )

    # Ramp: week-intent multiplier jumps beyond the hard flag.
    intents = sorted(skeleton.get("weekIntents") or [], key=lambda i: i.get("weekNumber", 0))
    for i in range(1, len(intents)):
        prev = float(intents[i - 1].get("volumeMultiplier", 1.0) or 1.0)
        cur = float(intents[i].get("volumeMultiplier", 1.0) or 1.0)
        if prev > 0 and not intents[i - 1].get("deload") and cur > prev * tk.WEEKLY_RAMP_HARD_FLAG:
            violations.append(
                f"Week {intents[i].get('weekNumber')} volume intent jumps "
                f"{((cur / prev) - 1) * 100:.0f}% over the prior week (aggressive)."
            )

    # Goal specificity: aerobic-oriented goals need aerobic blueprints somewhere.
    if goal_category.lower() in {"endurance", "health", "weight"}:
        has_aerobic = any(
            ((bp.get("type") or "").lower() in tk.AEROBIC_WORKOUT_TYPES)
            for p in phases for bp in (p.get("sessionBlueprints") or [])
        )
        if not has_aerobic:
            suggestions.append(f"A {goal_category} goal should include aerobic/cardio sessions.")

    return {"valid": len(violations) == 0, "violations": violations, "suggestions": suggestions}


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

    # Skeleton-based plans: check materialized weeks only (stubs are intent-only
    # by design) and add the macro-layer checks.
    skeleton = plan.get("skeleton")
    if skeleton:
        resolved = [w for w in (plan.get("weeks") or []) if w.get("resolved") is not False]
        report = validate_plan_doc(
            {"schedule": {**(plan.get("schedule") or {}), "weeksTotal": len(resolved)}, "weeks": resolved},
            goal_category,
            check_ramp=False,  # skeleton plans: ramp is checked by validate_skeleton
        )
        skel_report = validate_skeleton(
            skeleton, goal_category,
            (plan.get("schedule") or {}).get("weeksTotal") or len(plan.get("weeks") or []),
        )
        report["violations"] += skel_report["violations"]
        report["suggestions"] += skel_report["suggestions"]
        report["valid"] = report["valid"] and skel_report["valid"]
    else:
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
