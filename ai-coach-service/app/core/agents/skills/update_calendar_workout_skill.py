"""
Skill: update_calendar_workout

Swap, add, or remove ONE exercise inside a scheduled calendar workout's
embedded exercise list (workoutDetails.exercises). Dry-run by default with a
conversational confirm, matching reschedule_session. Optionally applies the
same change to all FUTURE events with the same title (e.g. "dragon flag on
every Strength and Conditioning day").
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill


def resolve_exercise_change(
    exercises: List[Dict[str, Any]],
    operation: str,
    target_exercise: Optional[str],
    new_exercise: Optional[Dict[str, Any]],
) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    """Pure: apply the operation to a copy of the exercise list.

    Returns (new_list, summary) — new_list is None on failure and summary
    holds the error message.
    """
    operation = (operation or "").lower()

    def find_target() -> int:
        needle = (target_exercise or "").strip().lower()
        for i, ex in enumerate(exercises):
            if needle and needle in (ex.get("exerciseName") or "").lower():
                return i
        return -1

    if operation == "swap":
        if not target_exercise or not new_exercise:
            return None, "swap needs both target_exercise and new_exercise."
        idx = find_target()
        if idx < 0:
            names = ", ".join((ex.get("exerciseName") or "?") for ex in exercises[:30])
            return None, f"'{target_exercise}' is not in this workout. It has: {names}"
        updated = [dict(ex) for ex in exercises]
        old_name = updated[idx].get("exerciseName")
        updated[idx] = {
            "exerciseId": None,
            "exerciseName": new_exercise.get("name"),
            "targetSets": new_exercise.get("sets", 3),
            "targetReps": new_exercise.get("reps", 8),
            "notes": new_exercise.get("notes"),
            "sets": [],
        }
        return updated, f"Swap **{old_name}** → **{new_exercise.get('name')}**"

    if operation == "add":
        if not new_exercise:
            return None, "add needs new_exercise."
        updated = [dict(ex) for ex in exercises]
        updated.append({
            "exerciseId": None,
            "exerciseName": new_exercise.get("name"),
            "targetSets": new_exercise.get("sets", 3),
            "targetReps": new_exercise.get("reps", 8),
            "notes": new_exercise.get("notes"),
            "sets": [],
        })
        return updated, f"Add **{new_exercise.get('name')}**"

    if operation == "remove":
        if not target_exercise:
            return None, "remove needs target_exercise."
        idx = find_target()
        if idx < 0:
            names = ", ".join((ex.get("exerciseName") or "?") for ex in exercises[:30])
            return None, f"'{target_exercise}' is not in this workout. It has: {names}"
        updated = [dict(ex) for ex in exercises]
        removed = updated.pop(idx)
        return updated, f"Remove **{removed.get('exerciseName')}**"

    return None, f"Unknown operation '{operation}' (use swap, add, or remove)."


@skill(
    name="update_calendar_workout",
    description=(
        "Swap, add, or remove ONE exercise inside a scheduled calendar workout. Use this to "
        "actually apply a change like 'replace Russian Twists with Dragon Flag in Sunday's "
        "Strength workout'. Previews the change first; only writes after the user confirms "
        "(dry_run=false). Can apply the same change to all future events with the same title."
    ),
    parameters={
        "type": "object",
        "properties": {
            "event_id": {
                "type": "string",
                "description": "The calendar event to modify (from get_calendar_events).",
            },
            "operation": {
                "type": "string",
                "enum": ["swap", "add", "remove"],
                "description": "swap = replace target_exercise with new_exercise; add = append new_exercise; remove = delete target_exercise.",
            },
            "target_exercise": {
                "type": "string",
                "description": "Name (or unique part of the name) of the exercise to swap out / remove.",
            },
            "new_exercise": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "sets": {"type": "integer", "description": "Target sets (default 3)"},
                    "reps": {"type": "integer", "description": "Target reps (default 8)"},
                    "notes": {"type": "string"},
                },
                "required": ["name"],
                "description": "The exercise to add / swap in.",
            },
            "apply_to_recurring": {
                "type": "boolean",
                "description": "Also apply to all FUTURE scheduled events whose title starts the same way (e.g. every 'Strength and Conditioning'). Default false.",
            },
            "dry_run": {
                "type": "boolean",
                "description": "Preview only. Default true; set false to apply after the user confirms.",
            },
        },
        "required": ["event_id", "operation"],
    },
)
async def update_calendar_workout(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    event_id = args.get("event_id")
    if not event_id:
        return {"success": False, "message": "event_id is required."}
    try:
        event_oid = ObjectId(event_id)
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid event_id."}

    event = await ctx.db.calendarevents.find_one({"_id": event_oid, "userId": user_oid})
    if not event:
        return {"success": False, "message": "I couldn't find that workout on your calendar."}

    exercises = (event.get("workoutDetails") or {}).get("exercises") or []
    updated, summary = resolve_exercise_change(
        exercises,
        args.get("operation"),
        args.get("target_exercise"),
        args.get("new_exercise"),
    )
    if updated is None:
        return {"success": False, "message": summary}

    title = event.get("title", "workout")
    date_str = event["date"].strftime("%A, %B %d") if event.get("date") else "?"

    # Find sibling future events with the same base title (recurring pattern).
    apply_recurring = bool(args.get("apply_to_recurring"))
    sibling_ids: List[ObjectId] = []
    if apply_recurring:
        base_title = title.split("(")[0].strip()
        cursor = ctx.db.calendarevents.find({
            "userId": user_oid,
            "_id": {"$ne": event_oid},
            "title": {"$regex": f"^{base_title}", "$options": "i"},
            "date": {"$gte": datetime.utcnow()},
            "status": {"$ne": "cancelled"},
        })
        sibling_ids = [e["_id"] async for e in cursor]

    scope = f"**{title}** on {date_str}"
    if apply_recurring and sibling_ids:
        scope += f" and **{len(sibling_ids)} more upcoming** '{title.split('(')[0].strip()}' sessions"

    dry_run = args.get("dry_run", True)
    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "message": f"{summary} in {scope}.\n\nConfirm?",
        }

    now = datetime.utcnow()
    await ctx.db.calendarevents.update_one(
        {"_id": event_oid, "userId": user_oid},
        {"$set": {"workoutDetails.exercises": updated, "updatedAt": now}},
    )
    changed = 1

    # Apply the same operation to each sibling independently (their exercise
    # lists may differ slightly).
    for sid in sibling_ids:
        sib = await ctx.db.calendarevents.find_one({"_id": sid, "userId": user_oid})
        if not sib:
            continue
        sib_exercises = (sib.get("workoutDetails") or {}).get("exercises") or []
        sib_updated, _ = resolve_exercise_change(
            sib_exercises,
            args.get("operation"),
            args.get("target_exercise"),
            args.get("new_exercise"),
        )
        if sib_updated is not None:
            await ctx.db.calendarevents.update_one(
                {"_id": sid, "userId": user_oid},
                {"$set": {"workoutDetails.exercises": sib_updated, "updatedAt": now}},
            )
            changed += 1

    return {
        "success": True,
        "dry_run": False,
        "events_changed": changed,
        "message": f"Done — {summary.lower()} in {changed} session(s).",
    }
