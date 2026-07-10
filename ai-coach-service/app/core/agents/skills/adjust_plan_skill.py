"""
Skill: adjust_plan

Modify a live plan mid-cycle — volume, frequency, or insert a deload — then
re-validate. Dry-run by default with conversational confirm. Won't push volume
past the ramp cap without an explicit override + caution (spec).

`apply_adjustment` is a pure transform (unit-tested); the handler validates,
guards the cap, and persists.
"""

import copy
from datetime import datetime
from typing import Any, Dict, List, Tuple

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.knowledge import training_knowledge as tk
from app.core.agents.skills.validate_plan_skill import validate_plan_doc, _week_metrics


def _avg_weekly_sets(weeks: List[Dict[str, Any]]) -> float:
    per = [_week_metrics(w) for w in weeks]
    training = [m for m in per if m[0] > 0]
    return (sum(m[1] for m in training) / len(training)) if training else 0.0


def apply_adjustment(
    weeks: List[Dict[str, Any]],
    change_type: str,
    direction: str,
    magnitude: int,
) -> Tuple[List[Dict[str, Any]], str]:
    """Pure transform. Returns (new_weeks, human description)."""
    weeks = copy.deepcopy(weeks or [])
    change_type = (change_type or "").lower()
    direction = (direction or "increase").lower()
    magnitude = max(1, int(magnitude or 1))
    desc = ""

    if change_type == "volume":
        delta = magnitude if direction == "increase" else -magnitude
        for w in weeks:
            for wo in w.get("workouts", []) or []:
                cw = wo.get("customWorkout")
                if not cw:
                    continue
                for ex in cw.get("exercises", []) or []:
                    sets = ex.get("sets", []) or []
                    if delta > 0:
                        template = dict(sets[-1]) if sets else {"reps": 10}
                        sets = sets + [dict(template) for _ in range(delta)]
                    else:
                        for _ in range(-delta):
                            if len(sets) > 1:
                                sets = sets[:-1]
                    ex["sets"] = sets
        desc = f"{direction}d volume by {magnitude} set(s) per exercise"

    elif change_type == "deload":
        for w in weeks:
            if (w.get("workouts") or []) and not w.get("deloadWeek"):
                w["deloadWeek"] = True
                for wo in w["workouts"]:
                    cw = wo.get("customWorkout")
                    if cw:
                        for ex in cw.get("exercises", []) or []:
                            sets = ex.get("sets", []) or []
                            ex["sets"] = sets[: max(1, round(len(sets) * 0.6))]
                desc = f"added a deload at week {w.get('weekNumber')}"
                break

    elif change_type == "frequency":
        if direction == "decrease":
            for w in weeks:
                if len(w.get("workouts", []) or []) > 1:
                    w["workouts"] = w["workouts"][:-1]
            desc = "reduced training frequency by one day/week"
        else:
            for w in weeks:
                workouts = w.get("workouts", []) or []
                if not workouts:
                    continue
                used = {x.get("dayOfWeek") for x in workouts}
                off = next((d for d in range(7) if d not in used), None)
                if off is not None:
                    extra = copy.deepcopy(workouts[0])
                    extra["dayOfWeek"] = off
                    w["workouts"] = workouts + [extra]
            desc = "added one training day/week"

    return weeks, desc


@skill(
    name="adjust_plan",
    description=(
        "Adjust a live training plan mid-cycle: change volume (sets), frequency (days/week), "
        "or insert a deload. Re-validates the result. Previews first; writes only on confirm "
        "(dry_run=false). Won't push volume past the safe ramp without override=true."
    ),
    parameters={
        "type": "object",
        "properties": {
            "plan_id": {"type": "string", "description": "The plan to adjust."},
            "change_type": {"type": "string", "enum": ["volume", "frequency", "deload"]},
            "direction": {"type": "string", "enum": ["increase", "decrease"], "description": "For volume/frequency."},
            "magnitude": {"type": "integer", "description": "Sets/days to change (default 1).", "minimum": 1},
            "override": {"type": "boolean", "description": "Allow exceeding the ramp cap (with caution). Default false."},
            "dry_run": {"type": "boolean", "description": "Preview only. Default true."},
        },
        "required": ["plan_id", "change_type"],
    },
)
async def adjust_plan(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    plan_id = args.get("plan_id")
    change_type = args.get("change_type")
    if not plan_id or not change_type:
        return {"success": False, "message": "plan_id and change_type are required."}
    try:
        plan_oid = ObjectId(plan_id)
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid plan_id."}

    plan = await ctx.db.plans.find_one({"_id": plan_oid, "userId": user_oid})
    if not plan:
        return {"success": False, "message": "Plan not found."}

    direction = args.get("direction", "increase")
    magnitude = int(args.get("magnitude") or 1)
    override = bool(args.get("override", False))

    old_avg = _avg_weekly_sets(plan.get("weeks", []) or [])
    new_weeks, desc = apply_adjustment(plan.get("weeks", []) or [], change_type, direction, magnitude)
    if not desc:
        return {"success": False, "message": "That adjustment didn't change anything — try a different change_type/direction."}
    new_avg = _avg_weekly_sets(new_weeks)

    # Cap guard: a volume increase that jumps past the ramp cap needs override.
    if change_type == "volume" and direction == "increase" and old_avg > 0 and not override:
        if new_avg > old_avg * tk.WEEKLY_RAMP_HARD_FLAG:
            return {
                "success": True,
                "needs_confirmation": "override",
                "message": (
                    f"That would raise weekly volume from ~{old_avg:.0f} to ~{new_avg:.0f} sets "
                    f"(> the {int((tk.WEEKLY_RAMP_HARD_FLAG-1)*100)}% ramp guideline). That's a big jump — "
                    f"confirm with override to proceed, or make a smaller increase."
                ),
            }

    # Re-validate the modified plan.
    goal_category = "general"
    if plan.get("goalId"):
        try:
            goal = await ctx.db.goals.find_one({"_id": plan["goalId"], "userId": user_oid}, {"category": 1})
            goal_category = (goal or {}).get("category") or "general"
        except Exception:
            pass
    report = validate_plan_doc({"schedule": plan.get("schedule") or {}, "weeks": new_weeks}, goal_category)

    if args.get("dry_run", True):
        msg = f"Proposed change: {desc} (~{old_avg:.0f} → ~{new_avg:.0f} sets/wk).\n\n"
        msg += ("Validation looks good. " if report["valid"] else
                "Note:\n" + "\n".join(f"- {v}" for v in report["violations"]) + "\n\n")
        msg += "Apply it?"
        return {"success": True, "dry_run": True, "description": desc, "validation": report, "message": msg}

    total_workouts = sum(len(w.get("workouts", []) or []) for w in new_weeks)
    update: Dict[str, Any] = {
        "weeks": new_weeks,
        "progress.totalWorkouts": total_workouts,
        "updatedAt": datetime.utcnow(),
    }
    extra_msg = ""

    # Skeleton plans: a volume adjustment must also scale the intents of weeks
    # that aren't materialized yet, or resolve_week would re-materialize them
    # from the unadjusted skeleton next week and silently revert the change.
    skeleton = plan.get("skeleton")
    if skeleton:
        unresolved = {w.get("weekNumber") for w in new_weeks if w.get("resolved") is False}
        if change_type == "volume" and old_avg > 0 and unresolved:
            factor = new_avg / old_avg
            intents = []
            for wi in skeleton.get("weekIntents") or []:
                wi = dict(wi)
                if wi.get("weekNumber") in unresolved:
                    try:
                        wi["volumeMultiplier"] = max(0.1, min(2.0, float(wi.get("volumeMultiplier", 1.0)) * factor))
                    except (TypeError, ValueError):
                        pass
                intents.append(wi)
            update["skeleton.weekIntents"] = intents
        elif change_type == "frequency":
            extra_msg = (
                "\n\nNote: this changed the weeks that are already written out. The plan's underlying "
                "structure still expects the original frequency, so upcoming weeks will come out at the "
                "old frequency — if you want the change permanent, I should regenerate the plan."
            )

    await ctx.db.plans.update_one({"_id": plan_oid, "userId": user_oid}, {"$set": update})
    return {
        "success": True,
        "dry_run": False,
        "description": desc,
        "validation": report,
        "message": f"Done — {desc}. Weekly volume is now ~{new_avg:.0f} sets." + extra_msg,
    }
