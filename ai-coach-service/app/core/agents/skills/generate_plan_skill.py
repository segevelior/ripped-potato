"""
Skill: generate_plan

Builds a multi-week DRAFT training plan aligned to a goal, then validates it.
The planner model (OPENAI_MODEL_PLANNER, falling back to the chat model)
produces a macro SKELETON — periodized phases with per-phase session blueprints,
one intent per week, deloads and measurable milestones. Deterministic code
(plan_builder) normalizes the skeleton, materializes only the first weeks
(rolling horizon; resolve_week fills later weeks from real adherence), and
validates the result. Names produced by the model are checked against the real
exercise library.

"Dry-run by default" here means NO CALENDAR WRITES: it persists a `status:"draft"`
plan (cheap, discardable) and returns it plus a validation report. The user then
reviews and schedules it with `schedule_plan_to_calendar` (which has its own
dry-run/confirm).
"""

import json
from typing import Any, Dict, List, Optional

import structlog
from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge import training_knowledge as tk
from app.core.agents.skills.plan_builder import (
    DEFAULT_HORIZON_WEEKS,
    build_plan_weeks_from_skeleton,
    normalize_skeleton,
    planner_model,
)
from app.core.agents.skills.safety import get_safety_context, format_caveats_for_prompt
from app.core.agents.skills.validate_plan_skill import validate_plan_doc, validate_skeleton

logger = structlog.get_logger()

# Category inference from free-text goals (used only when no goalId is linked).
_CATEGORY_KEYWORDS = {
    "strength": ["strength", "stronger", "1rm", "powerlift", "deadlift", "squat", "bench"],
    "endurance": ["endurance", "run", "5k", "10k", "marathon", "cardio", "cycling", "aerobic"],
    "skill": ["pull-up", "pullup", "muscle-up", "handstand", "planche", "skill", "calisthenic"],
    "weight": ["lose weight", "fat loss", "weight loss", "lean", "cut"],
    "health": ["health", "general fitness", "feel better", "mobility", "wellness"],
}


def infer_category(goal_text: str) -> str:
    low = (goal_text or "").lower()
    for category, words in _CATEGORY_KEYWORDS.items():
        if any(w in low for w in words):
            return category
    return "general"


def pick_workout_days(days_per_week: int, preferred: Optional[List[int]]) -> List[int]:
    """Choose dayOfWeek slots (0=Sun..6=Sat). Prefer the user's days, else spread
    evenly to avoid clustering (which keeps rest gaps between sessions)."""
    days_per_week = max(1, min(7, int(days_per_week)))
    if preferred:
        picked = sorted(set(int(d) for d in preferred if 0 <= int(d) <= 6))[:days_per_week]
        if len(picked) == days_per_week:
            return picked
    # Even spread across the week.
    step = 7 / days_per_week
    return sorted({int(round(i * step)) % 7 for i in range(days_per_week)})


_SYSTEM_PROMPT = (
    "You are an expert multi-discipline strength & endurance coach. You design "
    "periodized macro plans (skeletons) that manage interference between "
    "disciplines. Output JSON only, matching the requested schema exactly."
)


def _build_llm_prompt(goal_name, category, fitness_level, equipment, duration, days_per_week, weeks, caveats) -> str:
    return f"""Design a {weeks}-week periodized macro plan SKELETON for this athlete. Do NOT write every week's workouts — define phases, weekly intents, and per-phase session blueprints that a deterministic system will expand week by week.

Goal: {goal_name} (category: {category})
Fitness level: {fitness_level}
Training days per week: {days_per_week}
Available equipment: {', '.join(equipment) if equipment else 'bodyweight only'}
Target session length: ~{duration} min
Health caveats (work AROUND these, never program into injured areas):
{caveats}

Evidence-based constraints you MUST respect:
- Insert a deload week every {tk.DELOAD_EVERY_WEEKS_MIN}-{tk.DELOAD_EVERY_WEEKS_MAX} weeks (volume ~60%).
- Weekly volume progression within a phase should not exceed ~{int((tk.WEEKLY_RAMP_CAP - 1) * 100)}%.
- Same muscle group needs >={tk.MIN_HOURS_SAME_MUSCLE}h between hard sessions; manage interference between disciplines (hard leg/run days should not precede key strength sessions).
- Place a milestone at each phase boundary. Milestone `criteria` MUST be objectively verifiable pass/fail — a concrete number (time, distance, reps, load, RPE) or a binary completion event. Never subjective wording like "feels strong", "fatigue mild", or "indicating readiness".
- Dose each discipline realistically for the STATED goal, not a generic template: endurance goals need concrete, progressively building key sessions (put distance/duration and pace in each session's notes, and per-phase weekly volume in volumeTarget — e.g. a marathon plan's long run must actually build toward race-adjacent distance); strength peaks need specificity and a taper (heavier singles/doubles at goal movements, volume dropping into the meet), skill goals need dedicated, frequent, fresh practice slots.
- Keep the numbers mutually consistent: each phase's sessionBlueprints ARE its weekly sessions — a discipline's sessionsPerWeek must equal its blueprint count in that phase, and volumeTarget must match what those blueprints deliver at multiplier 1.0.
- Name sessions specifically for the goal and phase (e.g. "Long Run 26 km", "Squat Opener Singles"), never generic filler.
- The target session length applies to normal strength/skill days ONLY — key endurance sessions (long runs, race simulations) must use their REAL durationMinutes, even far beyond the target, and build progressively across phases.
- weekIntents.volumeMultiplier must tell one coherent story with the phases: build steadily within a phase, drop to ~0.6 ONLY on the weeks listed in deloadWeeks, and taper before a goal event. Do not mark extra deloads outside deloadWeeks.

Return JSON exactly:
{{"skeleton": {{
  "phases": [{{
    "name": "...", "startWeek": 1, "endWeek": 4,
    "focus": "...", "progression": "how load/volume progresses within this phase",
    "disciplines": [{{"discipline": "...", "sessionsPerWeek": 3, "volumeTarget": {{"metric": "km", "weekly": 30}}, "intensity": "..."}}],
    "sessionBlueprints": [{{
      "title": "...", "discipline": "...",
      "type": "strength|cardio|hybrid|recovery|hiit", "durationMinutes": {duration},
      "dayHint": 1,
      "exercises": [{{"exerciseName": "real common exercise name", "sets": 3, "reps": 8,
                     "notes": "pace/tempo/rest prescription if relevant", "timeSeconds": 0}}]
    }}]
  }}],
  "weekIntents": [{{"weekNumber": 1, "phase": "...", "focus": "...", "deload": false, "volumeMultiplier": 1.0}}],
  "deloadWeeks": [5, 10],
  "milestones": [{{"week": 4, "title": "...", "criteria": "measurable pass/fail"}}]
}}}}
Rules: phases contiguous covering weeks 1..{weeks}; one weekIntent per week 1..{weeks}; {days_per_week} sessionBlueprints per phase (one per training day, dayHint 0=Sun..6=Sat); exercises use widely-known names.
`sets` and `reps` MUST be integers. For runs/holds/timed work use reps=1, put the duration in timeSeconds, and the real prescription (pace, intervals, rest) in `notes` — never write prose into sets/reps."""


async def _validate_exercise_names(ctx: SkillContext, user_id: str, names: List[str]) -> List[str]:
    """Best-effort: return names not found in the exercise library (advisory)."""
    if not names:
        return []
    try:
        res = await ctx.exercise_service.grep_exercises(user_id, {"patterns": names})
        return list(res.get("missing", []) or [])
    except Exception:
        return []


@skill(
    name="generate_plan",
    description=(
        "Generate a multi-week DRAFT training plan tailored to the user's goal, level, "
        "equipment and any health caveats, then validate it. Does NOT touch the calendar — "
        "it creates a draft plan for review; the user schedules it afterward with "
        "schedule_plan_to_calendar."
    ),
    parameters={
        "type": "object",
        "properties": {
            "goal_id": {"type": "string", "description": "ID of an existing goal to build the plan around."},
            "goal_text": {"type": "string", "description": "Free-text goal if no goal_id (e.g. 'first pull-up in 8 weeks')."},
            "weeks": {"type": "integer", "description": "Plan length in weeks (default 8, min 2, max 26 = 6 months).", "minimum": 2, "maximum": 26},
            "days_per_week": {"type": "integer", "description": "Training days/week (default: from profile, else 3).", "minimum": 1, "maximum": 7},
            "name": {"type": "string", "description": "Optional plan name."},
        },
    },
)
async def generate_plan(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    # --- Resolve goal ---
    goal_name = args.get("goal_text") or ""
    category = "general"
    goal_id = args.get("goal_id")
    linked_goal_oid = None
    if goal_id:
        try:
            linked_goal_oid = ObjectId(goal_id)
            goal = await ctx.db.goals.find_one({"_id": linked_goal_oid, "userId": user_oid})
            if goal:
                goal_name = goal.get("name", goal_name)
                category = goal.get("category", "general")
        except Exception:
            linked_goal_oid = None
    elif goal_name:
        category = infer_category(goal_name)

    if not goal_name:
        return {
            "success": True,
            "needs_input": "goal",
            "message": "What's the goal for this plan? (e.g. 'build strength', 'run a 5k', 'first pull-up')",
        }

    # --- Profile (must-have check: availability) ---
    user = await ctx.db.users.find_one({"_id": user_oid}, {"profile": 1})
    profile = (user or {}).get("profile") or {}
    prefs = profile.get("preferences") or {}
    fitness_level = profile.get("fitnessLevel", "beginner")
    equipment = prefs.get("equipment") or []
    duration = prefs.get("workoutDuration") or 45
    # Product bounds: 2 weeks minimum (anything shorter isn't a plan), 26 weeks
    # (6 months) maximum. The tool schema enforces this too; clamp defensively.
    weeks = max(2, min(26, int(args.get("weeks") or 8)))
    days_per_week = int(args.get("days_per_week") or len(prefs.get("workoutDays") or []) or 3)

    # --- Safety caveats ---
    safety = await get_safety_context(ctx, user_id)

    # --- LLM: generate the macro skeleton (planner model) ---
    if ctx.openai_client is None:
        return {"success": False, "message": "Plan generation is unavailable (no model client)."}
    prompt = _build_llm_prompt(
        goal_name, category, fitness_level, equipment, duration, days_per_week, weeks,
        format_caveats_for_prompt(safety),
    )
    model = planner_model(ctx.settings)
    tuning = ctx.settings.llm_tuning_params(temperature=0.4)
    # Reasoning tokens count against max_completion_tokens — without headroom a
    # reasoning model burns the whole budget thinking and returns empty content.
    max_tokens = 16000 if "reasoning_effort" in tuning else 6000
    logger.info("generate_plan LLM call", model=model, weeks=weeks,
                days_per_week=days_per_week, tuning=tuning)
    try:
        resp = await ctx.openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=max_tokens,
            **tuning,
        )
        raw_skeleton = json.loads(resp.choices[0].message.content).get("skeleton", {})
    except Exception as e:
        return {"success": False, "message": f"Couldn't generate the plan: {e}"}

    skeleton = normalize_skeleton(raw_skeleton, weeks, days_per_week)
    if not skeleton or not skeleton.get("phases"):
        return {"success": False, "message": "The plan came back empty — try again or refine the goal."}
    skeleton["generatedBy"] = model

    # --- Deterministic scaffold: materialize the first weeks, stub the rest ---
    workout_days = pick_workout_days(days_per_week, prefs.get("workoutDays"))
    horizon = min(DEFAULT_HORIZON_WEEKS, weeks)
    plan_weeks = build_plan_weeks_from_skeleton(skeleton, workout_days, weeks, horizon=horizon)
    resolved_weeks = [w for w in plan_weeks if w.get("resolved") is not False]

    # --- Validate before writing ---
    # validate_plan_doc stays authoritative for the MATERIALIZED horizon only
    # (empty stubs would trigger false violations); the skeleton gets its own
    # structural/frequency check.
    plan_name = args.get("name") or f"{weeks}-Week {goal_name} Plan"
    report = validate_plan_doc(
        {"schedule": {"weeksTotal": len(resolved_weeks), "workoutsPerWeek": len(workout_days)},
         "weeks": resolved_weeks},
        category,
    )
    skeleton_report = validate_skeleton(skeleton, category, weeks)

    unverified = await _validate_exercise_names(
        ctx, user_id,
        [ex.get("exerciseName", "")
         for phase in skeleton.get("phases", [])
         for bp in phase.get("sessionBlueprints", [])
         for ex in bp.get("exercises", []) if ex.get("exerciseName")],
    )

    # --- Persist DRAFT plan (no calendar writes) ---
    create_args = {
        "name": plan_name,
        "description": f"AI-generated draft for: {goal_name}",
        "schedule": {
            "weeksTotal": weeks,
            "workoutsPerWeek": len(workout_days),
            "restDays": sorted(set(range(7)) - set(workout_days)),
            "preferredWorkoutDays": workout_days,
        },
        "weeks": plan_weeks,
        "skeleton": skeleton,
        "tags": ["ai-generated", "draft"],
    }
    if linked_goal_oid:
        create_args["goalId"] = str(linked_goal_oid)

    create_result = await ctx.plan_service.create_plan(user_id, create_args)
    if not create_result.get("success"):
        return {"success": False, "message": create_result.get("message", "Failed to save the draft plan.")}

    phase_names = " → ".join(p.get("name", "?") for p in skeleton.get("phases", []))
    milestones = skeleton.get("milestones", [])
    msg = (
        f"📋 Drafted **{plan_name}** — {weeks} weeks, {len(workout_days)} days/week.\n"
        f"Phases: {phase_names}."
        + (f" Milestones at week {', '.join(str(m['week']) for m in milestones)}." if milestones else "")
        + f"\nThe first {len(resolved_weeks)} week(s) are fully written out; later weeks follow the "
        f"plan's structure and get finalized from your actual training as you go.\n\n"
    )
    all_violations = report["violations"] + skeleton_report["violations"]
    if all_violations:
        msg += "A few things to review:\n" + "\n".join(f"- {v}" for v in all_violations) + "\n\n"
    else:
        msg += "It passes the quality checks. "
    if unverified:
        msg += f"Note: {len(unverified)} exercise name(s) weren't found in your library and may be created on scheduling.\n\n"
    msg += "Want me to put it on your calendar?"

    return {
        "success": True,
        "dry_run": True,
        "plan_id": create_result.get("plan_id"),
        "name": plan_name,
        "weeks": weeks,
        "days_per_week": len(workout_days),
        "resolved_weeks": len(resolved_weeks),
        "validation": report,
        "skeleton_validation": skeleton_report,
        "unverified_exercises": unverified,
        "message": msg,
    }
