"""
Skill: show_plan

Read-only drill-down into an existing plan, for progressive disclosure. This is
the path the coach uses to SHOW a plan — "show me the draft", "what's in week 3",
"see the workouts". It returns a layered, renderable view at the requested depth
so the coach can reveal the plan top-down (phases → weeks → workouts → exercises)
instead of re-running generate_plan (which builds a NEW draft and only ever handed
back counts — the reason plans were invisible and got duplicated).

No writes, no LLM. Pure read + plan_builder's layered-view helpers.

Levels:
  - overview: phases + milestones (the shape of the plan)
  - weeks:    per-week focus + workout titles (default)
  - week:     one week drilled down to every workout's exercises/sets/times
  - workout:  same detail as `week`, scoped to a single day
"""

from typing import Any, Dict

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.plan_builder import build_plan_overview


async def _resolve_plan(ctx: SkillContext, user_oid: ObjectId, plan_id: str = None) -> Dict[str, Any]:
    """Load the requested plan, or the user's most-recent non-completed plan
    (draft/active/paused) when no id is given — so "show me the plan" just works."""
    if plan_id:
        try:
            return await ctx.db.plans.find_one({"_id": ObjectId(plan_id), "userId": user_oid})
        except Exception:
            return None
    return await ctx.db.plans.find_one(
        {"userId": user_oid, "status": {"$in": ["draft", "active", "paused"]}},
        sort=[("updatedAt", -1)],
    )


@skill(
    name="show_plan",
    description=(
        "Show the contents of an existing training plan at the depth requested, for "
        "progressively revealing it to the user. USE THIS (not generate_plan) whenever the "
        "user wants to SEE a plan they already have — 'show me the draft/plan', 'what's in "
        "week 3', 'see the workouts'. Read-only. Defaults to the user's most recent plan when "
        "no plan_id is given. Levels: 'overview' (phases + milestones), 'weeks' (each week's "
        "focus + workout titles), 'week' (one week's full workouts/exercises/sets), 'workout' "
        "(a single day in detail)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "plan_id": {"type": "string", "description": "Plan to show (default: the user's most recent draft/active plan)."},
            "level": {
                "type": "string",
                "enum": ["overview", "weeks", "week", "workout"],
                "description": "Disclosure depth (default 'weeks'). Use 'week'/'workout' with week_number to drill into exercises.",
            },
            "week_number": {"type": "integer", "minimum": 1, "description": "Required for level 'week' or 'workout'."},
            "day_of_week": {"type": "integer", "minimum": 0, "maximum": 6, "description": "For level 'workout': 0=Sun..6=Sat."},
        },
    },
)
async def show_plan(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    plan = await _resolve_plan(ctx, user_oid, args.get("plan_id"))
    if not plan:
        return {"success": True, "not_found": True,
                "message": "I don't see a plan to show yet — want me to build one for a goal?"}

    level = args.get("level") or "weeks"
    week_number = args.get("week_number")
    if level in ("week", "workout") and week_number is None:
        # Nothing specified to drill into — fall back to the week list so the
        # coach can ask which week rather than erroring.
        level = "weeks"

    skeleton = plan.get("skeleton") or {}
    weeks = plan.get("weeks") or []
    overview = build_plan_overview(skeleton, weeks, level=level, week_number=week_number)

    schedule = plan.get("schedule") or {}
    result: Dict[str, Any] = {
        "success": True,
        "plan_id": str(plan["_id"]),
        "name": plan.get("name", ""),
        "status": plan.get("status"),
        "weeks_total": schedule.get("weeksTotal") or len(weeks),
        "days_per_week": schedule.get("workoutsPerWeek"),
        "level": level,
        "overview": overview,
    }

    # For a single-day request, narrow the week's workouts to the chosen day.
    if level == "workout" and overview.get("week"):
        day = args.get("day_of_week")
        workouts = overview["week"].get("workouts", [])
        if day is not None:
            workouts = [w for w in workouts if w.get("dayOfWeek") == day]
        if not workouts:
            result["message"] = f"No workout found for that day in week {week_number}."
            return result
        result["overview"]["week"]["workouts"] = workouts

    if level in ("week", "workout") and not (overview.get("week")):
        result["message"] = f"Week {week_number} isn't in this plan."
    return result
