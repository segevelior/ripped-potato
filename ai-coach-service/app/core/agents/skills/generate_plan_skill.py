"""
Skill: generate_plan

Builds a multi-week DRAFT training plan aligned to a goal, then validates it.
The split follows the spec: the model chooses/justifies exercises (a set of
weekly workout "blueprints"); deterministic code does the scaffolding — assigning
training days, repeating blueprints across weeks, inserting deloads, and marking
rest days. Names produced by the model are checked against the real exercise
library.

"Dry-run by default" here means NO CALENDAR WRITES: it persists a `status:"draft"`
plan (cheap, discardable) and returns it plus a validation report. The user then
reviews and schedules it with `schedule_plan_to_calendar` (which has its own
dry-run/confirm).
"""

import json
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge import training_knowledge as tk
from app.core.agents.skills.safety import get_safety_context, format_caveats_for_prompt
from app.core.agents.skills.validate_plan_skill import validate_plan_doc

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


def _scale_sets(base_sets: int, is_deload: bool) -> int:
    """Deload weeks cut volume ~40%; otherwise keep the blueprint volume."""
    if is_deload:
        return max(1, round(base_sets * 0.6))
    return max(1, base_sets)


def build_plan_weeks(
    blueprints: List[Dict[str, Any]],
    workout_days: List[int],
    weeks: int,
) -> List[Dict[str, Any]]:
    """Pure: expand weekly blueprints across N weeks with deloads + rest days."""
    out: List[Dict[str, Any]] = []

    for wn in range(1, weeks + 1):
        # Deload every DELOAD_EVERY_WEEKS_MAX weeks (e.g. week 6, 12) for long plans.
        is_deload = tk.expects_deload(weeks) and wn % tk.DELOAD_EVERY_WEEKS_MAX == 0
        workouts = []
        for i, day in enumerate(workout_days):
            bp = blueprints[i % len(blueprints)]
            exercises = []
            for ex in bp.get("exercises", []) or []:
                base_sets = int(ex.get("sets", 3) or 3)
                reps = int(ex.get("reps", 10) or 10)
                # Distinct dict per set (avoid aliasing the same object N times).
                exercises.append({
                    "exerciseName": ex.get("exerciseName", ""),
                    "sets": [{"reps": reps} for _ in range(_scale_sets(base_sets, is_deload))],
                })
            workouts.append({
                "dayOfWeek": day,
                "workoutType": "custom",
                "customWorkout": {
                    "title": bp.get("title", "Workout"),
                    "type": bp.get("type", "strength"),
                    "durationMinutes": int(bp.get("durationMinutes", 45) or 45),
                    "exercises": exercises,
                },
            })
        out.append({
            "weekNumber": wn,
            "focus": "Deload" if is_deload else "",
            "deloadWeek": is_deload,
            # Off-days are implicit — we don't materialize a calendar event for
            # every rest day (that would flood the calendar). Explicit rest/deload
            # events remain available via the plan's restDays when deliberately set.
            "restDays": [],
            "workouts": workouts,
        })
    return out


_SYSTEM_PROMPT = (
    "You are a strength & conditioning coach. Design a weekly set of workout "
    "'blueprints' (one per training day) for the user's goal. Output JSON only."
)


def _build_llm_prompt(goal_name, category, fitness_level, equipment, duration, days_per_week, caveats) -> str:
    return f"""Design {days_per_week} distinct workout blueprints for one training week.

Goal: {goal_name} (category: {category})
Fitness level: {fitness_level}
Available equipment: {', '.join(equipment) if equipment else 'bodyweight only'}
Target session length: ~{duration} min
Health caveats (work AROUND these, never program into injured areas):
{caveats}

Return JSON exactly:
{{"workouts": [
  {{"title": "...", "type": "strength|cardio|hybrid|recovery|hiit", "durationMinutes": {duration},
    "focus": "short phrase",
    "exercises": [{{"exerciseName": "real common exercise name", "sets": 3, "reps": 10}}]}}
]}}
Rules: {days_per_week} blueprints; 3-6 exercises each; use widely-known exercise names; match equipment and level."""


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
            "weeks": {"type": "integer", "description": "Plan length in weeks (default 8).", "minimum": 1, "maximum": 52},
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
    weeks = int(args.get("weeks") or 8)
    days_per_week = int(args.get("days_per_week") or len(prefs.get("workoutDays") or []) or 3)

    # --- Safety caveats ---
    safety = await get_safety_context(ctx, user_id)

    # --- LLM: generate weekly blueprints ---
    if ctx.openai_client is None:
        return {"success": False, "message": "Plan generation is unavailable (no model client)."}
    prompt = _build_llm_prompt(
        goal_name, category, fitness_level, equipment, duration, days_per_week,
        format_caveats_for_prompt(safety),
    )
    try:
        resp = await ctx.openai_client.chat.completions.create(
            model=ctx.settings.openai_model,
            messages=[{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_completion_tokens=2000,
        )
        blueprints = json.loads(resp.choices[0].message.content).get("workouts", [])
    except Exception as e:
        return {"success": False, "message": f"Couldn't generate the plan: {e}"}

    if not blueprints:
        return {"success": False, "message": "The plan came back empty — try again or refine the goal."}

    # --- Deterministic scaffold ---
    workout_days = pick_workout_days(days_per_week, prefs.get("workoutDays"))
    plan_weeks = build_plan_weeks(blueprints, workout_days, weeks)

    # --- Validate before writing ---
    plan_name = args.get("name") or f"{weeks}-Week {goal_name} Plan"
    plan_doc_for_validation = {
        "schedule": {"weeksTotal": weeks, "workoutsPerWeek": len(workout_days)},
        "weeks": plan_weeks,
    }
    report = validate_plan_doc(plan_doc_for_validation, category)

    unverified = await _validate_exercise_names(
        ctx, user_id,
        [ex.get("exerciseName", "") for bp in blueprints for ex in bp.get("exercises", []) if ex.get("exerciseName")],
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
        "tags": ["ai-generated", "draft"],
    }
    if linked_goal_oid:
        create_args["goalId"] = str(linked_goal_oid)

    create_result = await ctx.plan_service.create_plan(user_id, create_args)
    if not create_result.get("success"):
        return {"success": False, "message": create_result.get("message", "Failed to save the draft plan.")}

    msg = (
        f"📋 Drafted **{plan_name}** — {weeks} weeks, {len(workout_days)} days/week"
        f" ({report['metrics']['avg_weekly_sets']} sets/wk).\n\n"
    )
    if report["valid"]:
        msg += "It passes the quality checks. "
    else:
        msg += "A few things to review:\n" + "\n".join(f"- {v}" for v in report["violations"]) + "\n\n"
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
        "validation": report,
        "unverified_exercises": unverified,
        "message": msg,
    }
