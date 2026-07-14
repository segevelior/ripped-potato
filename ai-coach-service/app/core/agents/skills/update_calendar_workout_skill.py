"""
Skill: update_calendar_workout

Swap, add, or remove ONE exercise inside a scheduled calendar workout.
Calendar events don't embed exercises — they reference a PredefinedWorkout —
so the edit lands on the linked template with copy-on-write semantics:
a shared template (common library / referenced elsewhere) is cloned into a
user-owned copy and the event relinked; an exclusively-owned template is
edited in place. Legacy events that still embed exercises keep the old
in-place behavior. Dry-run by default with a conversational confirm.
Optionally applies the same change to all FUTURE events with the same title.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.core.agents.services.exercise_resolver import ExerciseResolver
from app.core.agents.skills.registry import SkillContext, skill


def resolve_exercise_change(
    exercises: List[Dict[str, Any]],
    operation: str,
    target_exercise: Optional[str],
    new_exercise: Optional[Dict[str, Any]],
) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    """Pure: apply the operation to a copy of a legacy embedded exercise list.

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


def resolve_block_change(
    blocks: List[Dict[str, Any]],
    operation: str,
    target_exercise: Optional[str],
    new_exercise: Optional[Dict[str, Any]],
) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    """Pure: apply the operation to a deep copy of template blocks.

    Returns (new_blocks, summary) — new_blocks is None on failure and summary
    holds the error message. New entries carry no exercise_id yet; the caller
    resolves ids before persisting (blockExerciseSchema requires them).
    """
    operation = (operation or "").lower()
    copied = [
        {**b, "exercises": [dict(ex) for ex in (b.get("exercises") or [])]}
        for b in (blocks or [])
    ]

    def find_target() -> Tuple[int, int]:
        needle = (target_exercise or "").strip().lower()
        for bi, block in enumerate(copied):
            for ei, ex in enumerate(block["exercises"]):
                if needle and needle in (ex.get("exercise_name") or "").lower():
                    return bi, ei
        return -1, -1

    def listed_names() -> str:
        names = [ex.get("exercise_name") or "?" for b in copied for ex in b["exercises"]]
        return ", ".join(names[:30])

    def build_entry() -> Dict[str, Any]:
        return {
            "exercise_name": new_exercise.get("name"),
            "volume": f"{new_exercise.get('sets', 3)}x{new_exercise.get('reps', 8)}",
            "rest": "60s",
            "notes": new_exercise.get("notes") or "",
        }

    if operation == "swap":
        if not target_exercise or not new_exercise:
            return None, "swap needs both target_exercise and new_exercise."
        bi, ei = find_target()
        if bi < 0:
            return None, f"'{target_exercise}' is not in this workout. It has: {listed_names()}"
        old_name = copied[bi]["exercises"][ei].get("exercise_name")
        copied[bi]["exercises"][ei] = build_entry()
        return copied, f"Swap **{old_name}** → **{new_exercise.get('name')}**"

    if operation == "add":
        if not new_exercise:
            return None, "add needs new_exercise."
        if not copied:
            copied = [{"name": "Main Workout", "exercises": []}]
        copied[-1]["exercises"].append(build_entry())
        return copied, f"Add **{new_exercise.get('name')}**"

    if operation == "remove":
        if not target_exercise:
            return None, "remove needs target_exercise."
        bi, ei = find_target()
        if bi < 0:
            return None, f"'{target_exercise}' is not in this workout. It has: {listed_names()}"
        removed = copied[bi]["exercises"].pop(ei)
        return copied, f"Remove **{removed.get('exercise_name')}**"

    return None, f"Unknown operation '{operation}' (use swap, add, or remove)."


async def _is_template_shared(
    ctx: SkillContext,
    user_oid: ObjectId,
    template: Dict[str, Any],
    exclude_event_ids: List[ObjectId],
) -> bool:
    """A template is shared when editing it in place would change something the
    user didn't ask to change: the common library, another user's workout,
    other calendar events, or a training plan that references it."""
    if template.get("isCommon"):
        return True
    if template.get("createdBy") and template["createdBy"] != user_oid:
        return True
    other_refs = await ctx.db.calendarevents.count_documents({
        "workoutTemplateId": template["_id"],
        "_id": {"$nin": exclude_event_ids},
        "status": {"$nin": ["cancelled"]},
    })
    if other_refs > 0:
        return True
    plan_refs = await ctx.db.plans.count_documents({
        "weeks.workouts.predefinedWorkoutId": template["_id"],
    })
    return plan_refs > 0


@skill(
    name="update_calendar_workout",
    description=(
        "Swap, add, or remove ONE exercise inside a scheduled calendar workout. Use this to "
        "actually apply a change like 'replace Russian Twists with Dragon Flag in Sunday's "
        "Strength workout'. The change lands on the workout the event links to: if that workout "
        "is shared (common library or used by other sessions), a personalized copy is created "
        "for this event. Previews the change first; only writes after the user confirms "
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

    template = None
    if event.get("workoutTemplateId"):
        template = await ctx.db.predefinedworkouts.find_one({"_id": event["workoutTemplateId"]})

    operation = args.get("operation")
    target_exercise = args.get("target_exercise")
    new_exercise = args.get("new_exercise")

    if template is not None:
        updated_blocks, summary = resolve_block_change(
            template.get("blocks") or [], operation, target_exercise, new_exercise
        )
        if updated_blocks is None:
            return {"success": False, "message": summary}
    else:
        # Legacy event without a template link: edit the embedded list in place.
        exercises = (event.get("workoutDetails") or {}).get("exercises") or []
        updated_exercises, summary = resolve_exercise_change(
            exercises, operation, target_exercise, new_exercise
        )
        if updated_exercises is None:
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

    shared = False
    if template is not None:
        shared = await _is_template_shared(ctx, user_oid, template, [event_oid, *sibling_ids])

    dry_run = args.get("dry_run", True)
    if dry_run:
        if template is not None:
            effect = (
                f"\n\nThis creates a personalized copy of **{template.get('name')}** for "
                "these session(s) — the original workout stays unchanged."
                if shared
                else f"\n\nThis edits your workout **{template.get('name')}** directly."
            )
        else:
            effect = ""
        return {
            "success": True,
            "dry_run": True,
            "message": f"{summary} in {scope}.{effect}\n\nConfirm?",
        }

    now = datetime.utcnow()

    if template is None:
        # Legacy path: embedded lists edited per event.
        await ctx.db.calendarevents.update_one(
            {"_id": event_oid, "userId": user_oid},
            {"$set": {"workoutDetails.exercises": updated_exercises, "updatedAt": now}},
        )
        changed = 1
        for sid in sibling_ids:
            sib = await ctx.db.calendarevents.find_one({"_id": sid, "userId": user_oid})
            if not sib:
                continue
            sib_exercises = (sib.get("workoutDetails") or {}).get("exercises") or []
            sib_updated, _ = resolve_exercise_change(
                sib_exercises, operation, target_exercise, new_exercise
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

    # blockExerciseSchema requires exercise_id on every entry — resolve the
    # edited blocks (entries that already have an id pass straight through).
    resolved_blocks, _report = await ExerciseResolver(ctx.db).resolve_blocks(
        user_id, updated_blocks, on_ambiguous="best_effort"
    )

    if shared:
        # Copy-on-write: clone into a user-owned workout and relink the
        # event(s); the shared original stays untouched.
        clone = {
            "name": template.get("name"),
            "goal": template.get("goal", ""),
            "primary_disciplines": template.get("primary_disciplines") or ["General Fitness"],
            "estimated_duration": template.get("estimated_duration", 45),
            "difficulty_level": template.get("difficulty_level", "intermediate"),
            "blocks": resolved_blocks,
            "tags": sorted(set((template.get("tags") or []) + ["ai-generated", "customized"])),
            "isCommon": False,
            "createdBy": user_oid,
            "createdAt": now,
            "updatedAt": now,
        }
        insert_result = await ctx.db.predefinedworkouts.insert_one(clone)
        new_template_id = insert_result.inserted_id
        relink_ids = [event_oid]
        # Only siblings that share THIS template follow the relink — a sibling
        # linked to a different workout shouldn't silently change workouts.
        for sid in sibling_ids:
            sib = await ctx.db.calendarevents.find_one({"_id": sid, "userId": user_oid})
            if sib and sib.get("workoutTemplateId") == template["_id"]:
                relink_ids.append(sid)
        await ctx.db.calendarevents.update_many(
            {"_id": {"$in": relink_ids}, "userId": user_oid},
            {"$set": {"workoutTemplateId": new_template_id, "updatedAt": now}},
        )
        changed = len(relink_ids)
        note = " (personalized copy created — the shared workout is unchanged)"
    else:
        # Exclusively ours: edit the template in place. Every event linked to
        # it — including same-template siblings — sees the change automatically.
        await ctx.db.predefinedworkouts.update_one(
            {"_id": template["_id"]},
            {"$set": {"blocks": resolved_blocks, "updatedAt": now}},
        )
        changed = 1
        if sibling_ids:
            changed += await ctx.db.calendarevents.count_documents({
                "_id": {"$in": sibling_ids},
                "workoutTemplateId": template["_id"],
            })
        note = ""

    return {
        "success": True,
        "dry_run": False,
        "events_changed": changed,
        "message": f"Done — {summary.lower()} in {changed} session(s){note}.",
    }
