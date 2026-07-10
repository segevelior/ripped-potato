"""
Skill: schedule_plan_to_calendar

Expands a whole training plan into calendar events and bulk-inserts them in one
tool call. This replaces the fragile "one schedule_to_calendar call per event"
loop that ran out of tool-call budget on multi-week plans.

Safety: dry-run by default. The first call returns a preview and writes nothing;
after the user confirms, the model re-calls with dry_run=false to write. (The
legacy structured pending_change flow is dead code, so confirmation is
conversational — same as every other tool here.)

Idempotency: each event records planId/planWeek/planDay, so re-runs dedup against
already-scheduled slots instead of duplicating.

Pure helpers (_compute_event_date, _build_events, _parse_volume, ...) take no DB
and are unit-tested directly.
"""

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill


# ---------------------------------------------------------------------------
# Pure helpers (no DB — unit-testable)
# ---------------------------------------------------------------------------

def _midnight(dt: datetime) -> datetime:
    """Strip tz + time so all dates compare cleanly at UTC midnight."""
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _parse_start_date(value: Any) -> Optional[datetime]:
    """Parse a start date. Accepts a datetime, 'today'/'tomorrow', ISO, or
    YYYY-MM-DD. Returns a naive UTC-midnight datetime, or None if unparseable."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return _midnight(value)
    if not isinstance(value, str):
        return None

    text = value.strip().lower()
    if text == "today":
        return _midnight(datetime.utcnow())
    if text == "tomorrow":
        return _midnight(datetime.utcnow() + timedelta(days=1))
    try:
        return _midnight(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except Exception:
        try:
            return _midnight(datetime.strptime(value, "%Y-%m-%d"))
        except Exception:
            return None


def _sunday0(dt: datetime) -> int:
    """Weekday with Sunday=0..Saturday=6 (matches the plan's dayOfWeek)."""
    return (dt.weekday() + 1) % 7


def _compute_event_date(start_date: datetime, week_number: int, day_of_week: int) -> datetime:
    """Map (weekNumber, dayOfWeek 0=Sun) onto a concrete date.

    The first occurrence of day_of_week falls on or after start_date, then whole
    weeks are added. Never produces a date before start_date.
    """
    offset = (day_of_week - _sunday0(start_date) + 7) % 7
    return start_date + timedelta(days=offset + 7 * (week_number - 1))


def _parse_volume(volume: Any) -> tuple[int, int]:
    """Parse a PredefinedWorkout volume string like '3x10' / '3 x 8-12' into
    (sets, reps). Falls back to (3, 10)."""
    m = re.match(r"\s*(\d+)\s*[xX]\s*(\d+)", str(volume or ""))
    if m:
        return int(m.group(1)), int(m.group(2))
    return 3, 10


def _resolve_workout_content(workout: Dict[str, Any], template_map: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve a plan workout (predefined or custom) into title + workoutDetails
    fields. `template_map` maps str(predefinedWorkoutId) -> template document."""
    if workout.get("workoutType") == "predefined":
        tmpl = template_map.get(str(workout.get("predefinedWorkoutId")))
        if tmpl:
            exercises = []
            for block in tmpl.get("blocks", []) or []:
                for ex in block.get("exercises", []) or []:
                    sets, reps = _parse_volume(ex.get("volume"))
                    exercises.append({
                        "exerciseId": ex.get("exercise_id"),
                        "exerciseName": ex.get("exercise_name", ""),
                        "targetSets": sets,
                        "targetReps": reps,
                        "notes": ex.get("notes", ""),
                    })
            return {
                "title": tmpl.get("name", "Workout"),
                "type": "strength",
                "duration": tmpl.get("estimated_duration", 45),
                "exercises": exercises,
                "template_id": workout.get("predefinedWorkoutId"),
            }
        # Referenced template is missing — degrade gracefully.
        return {"title": "Workout", "type": "strength", "duration": 45, "exercises": [], "template_id": None}

    # Custom inline workout
    custom = workout.get("customWorkout") or {}
    exercises = []
    for ex in custom.get("exercises", []) or []:
        sets_arr = ex.get("sets", []) or []
        first = sets_arr[0] if sets_arr and isinstance(sets_arr[0], dict) else {}
        exercises.append({
            "exerciseName": ex.get("exerciseName", ""),
            "targetSets": len(sets_arr) or 3,
            "targetReps": first.get("reps") or 10,
            "notes": "",
        })
    return {
        "title": custom.get("title") or "Workout",
        "type": custom.get("type", "strength"),
        "duration": custom.get("durationMinutes", 45),
        "exercises": exercises,
        "template_id": None,
    }


def _build_events(
    plan: Dict[str, Any],
    start_date: datetime,
    weeks_cap: Optional[int],
    template_map: Dict[str, Any],
    user_oid: Any,
    plan_oid: Any,
    now: datetime,
) -> List[Dict[str, Any]]:
    """Expand a plan into calendar-event documents (ready for insert_many).

    Emits workout events (type 'deload' for deload weeks, else 'workout') plus a
    'rest' event for each restDays entry. Each event carries planId/planWeek/
    planDay for back-linking and idempotency.
    """
    events: List[Dict[str, Any]] = []
    weeks = sorted(plan.get("weeks", []) or [], key=lambda w: w.get("weekNumber", 0))
    if weeks_cap:
        weeks = [w for w in weeks if w.get("weekNumber", 0) <= weeks_cap]

    for week in weeks:
        week_number = week.get("weekNumber", 1)
        is_deload = bool(week.get("deloadWeek", False))

        for workout in week.get("workouts", []) or []:
            day = workout.get("dayOfWeek", 1)
            date = _compute_event_date(start_date, week_number, day)
            content = _resolve_workout_content(workout, template_map)
            event = {
                "userId": user_oid,
                "planId": plan_oid,
                "planWeek": week_number,
                "planDay": day,
                "date": date,
                "title": f"{content['title']} ({date.strftime('%b %d')})",
                "type": "deload" if is_deload else "workout",
                "status": "scheduled",
                "notes": workout.get("notes") or "",
                "workoutDetails": {
                    "type": content["type"],
                    "estimatedDuration": content["duration"],
                    "exercises": content["exercises"],
                },
                "createdAt": now,
                "updatedAt": now,
            }
            if content.get("template_id"):
                event["workoutTemplateId"] = content["template_id"]
            events.append(event)

        for rest_day in week.get("restDays", []) or []:
            date = _compute_event_date(start_date, week_number, rest_day)
            events.append({
                "userId": user_oid,
                "planId": plan_oid,
                "planWeek": week_number,
                "planDay": rest_day,
                "date": date,
                "title": f"Rest Day ({date.strftime('%b %d')})",
                "type": "rest",
                "status": "scheduled",
                "notes": "",
                "createdAt": now,
                "updatedAt": now,
            })

    events.sort(key=lambda e: e["date"])
    return events


def _serialize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """JSON-safe view of a proposed event for a dry-run preview (no ObjectId /
    datetime — the orchestrator json.dumps() tool results)."""
    return {
        "date": event["date"].strftime("%Y-%m-%d"),
        "dayName": event["date"].strftime("%A"),
        "week": event["planWeek"],
        "title": event["title"],
        "type": event["type"],
        "exerciseCount": len(event.get("workoutDetails", {}).get("exercises", [])),
    }


def _format_preview(
    plan: Dict[str, Any],
    proposed: List[Dict[str, Any]],
    already_scheduled: List[Dict[str, Any]],
    conflicts: List[Dict[str, Any]],
    start_date: datetime,
) -> str:
    workouts = [e for e in proposed if e["type"] in ("workout", "deload")]
    rests = [e for e in proposed if e["type"] == "rest"]
    first, last = proposed[0]["date"], proposed[-1]["date"]
    lines = [
        f"Here's the schedule for **{plan.get('name', 'your plan')}**, "
        f"starting **{start_date.strftime('%A, %B %d, %Y')}**:",
        "",
        f"- **{len(workouts)}** workout/deload session(s)"
        + (f" and **{len(rests)}** rest day(s)" if rests else ""),
        f"- From **{first.strftime('%b %d')}** to **{last.strftime('%b %d, %Y')}**",
    ]
    if already_scheduled:
        lines.append(f"- {len(already_scheduled)} session(s) already on your calendar (will be skipped)")
    if conflicts:
        lines.append(f"- ⚠️ {len(conflicts)} date(s) overlap existing events — I won't double-book")
    lines += ["", "Want me to add these to your calendar?"]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Skill
# ---------------------------------------------------------------------------

@skill(
    name="schedule_plan_to_calendar",
    description=(
        "Schedule an ENTIRE multi-week training plan onto the user's calendar in one call. "
        "Use this instead of scheduling workouts day-by-day whenever the user wants a whole "
        "plan (or several weeks of it) put on the calendar. Defaults to a dry-run PREVIEW "
        "that writes nothing; present the preview, and only after the user confirms, call "
        "again with dry_run=false to actually write the events."
    ),
    parameters={
        "type": "object",
        "properties": {
            "plan_id": {
                "type": "string",
                "description": "The ID of the training plan to schedule.",
            },
            "start_date": {
                "type": "string",
                "description": (
                    "Date the plan should start: ISO 'YYYY-MM-DD', or 'today'/'tomorrow'. "
                    "If omitted, the plan's existing startDate is used."
                ),
            },
            "weeks": {
                "type": "integer",
                "description": "How many weeks to schedule (default: all weeks in the plan).",
                "minimum": 1,
            },
            "dry_run": {
                "type": "boolean",
                "description": "Preview only, no writes. Default true. Set false ONLY after the user confirms.",
            },
            "overwrite": {
                "type": "boolean",
                "description": "Replace this plan's existing calendar events in the date range. Default false.",
            },
        },
        "required": ["plan_id"],
    },
)
async def schedule_plan_to_calendar(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    start_date = _parse_start_date(args.get("start_date")) or _parse_start_date(plan.get("startDate"))
    if not start_date:
        return {
            "success": True,
            "needs_input": "start_date",
            "message": "What date should the plan start on? Give me a date like 2026-07-12 (or say 'today').",
        }

    weeks_cap = args.get("weeks")
    dry_run = args.get("dry_run", True)
    overwrite = bool(args.get("overwrite", False))

    # Batch-fetch referenced predefined templates (avoid N queries).
    predefined_ids = [
        wk["predefinedWorkoutId"]
        for w in (plan.get("weeks") or [])
        for wk in (w.get("workouts") or [])
        if wk.get("workoutType") == "predefined" and wk.get("predefinedWorkoutId")
    ]
    template_map: Dict[str, Any] = {}
    if predefined_ids:
        async for tmpl in ctx.db.predefinedworkouts.find({"_id": {"$in": predefined_ids}}):
            template_map[str(tmpl["_id"])] = tmpl

    now = datetime.utcnow()
    proposed = _build_events(plan, start_date, weeks_cap, template_map, user_oid, plan_oid, now)
    if not proposed:
        return {"success": False, "message": "This plan has no workouts to schedule yet."}

    # Fetch existing events in range for dedup + conflict detection.
    min_d = proposed[0]["date"]
    max_d = proposed[-1]["date"]
    existing = await ctx.db.calendarevents.find({
        "userId": user_oid,
        "date": {"$gte": min_d, "$lte": max_d},
        "status": {"$ne": "cancelled"},
    }).to_list(None)

    existing_plan_slots = {
        (e.get("planWeek"), e.get("planDay"))
        for e in existing
        if e.get("planId") == plan_oid
    }
    other_by_date: Dict[Any, List[str]] = {}
    for e in existing:
        if e.get("planId") != plan_oid and e.get("date"):
            other_by_date.setdefault(e["date"].date(), []).append(e.get("title", "event"))

    already_scheduled = [e for e in proposed if (e["planWeek"], e["planDay"]) in existing_plan_slots]
    to_insert = [e for e in proposed if (e["planWeek"], e["planDay"]) not in existing_plan_slots]
    conflicts = [
        {"date": e["date"].strftime("%Y-%m-%d"), "title": e["title"], "existing": other_by_date[e["date"].date()]}
        for e in proposed
        if e["date"].date() in other_by_date
    ]

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "message": _format_preview(plan, proposed, already_scheduled, conflicts, start_date),
            "proposed_count": len(proposed),
            "proposed_events": [_serialize_event(e) for e in proposed],
            "already_scheduled_count": len(already_scheduled),
            "conflicts": conflicts,
        }

    # --- Confirmed write ---
    if overwrite:
        await ctx.db.calendarevents.delete_many({
            "userId": user_oid,
            "planId": plan_oid,
            "date": {"$gte": min_d, "$lte": max_d},
        })
        insert_list = proposed
    else:
        insert_list = to_insert

    inserted_count = 0
    if insert_list:
        result = await ctx.db.calendarevents.insert_many(insert_list)
        inserted_count = len(result.inserted_ids)

    # Activate the plan (mirrors Plan.startPlan()).
    weeks_total = (plan.get("schedule") or {}).get("weeksTotal") or len(plan.get("weeks") or [])
    total_workouts = sum(len(w.get("workouts", []) or []) for w in (plan.get("weeks") or []))
    await ctx.db.plans.update_one(
        {"_id": plan_oid, "userId": user_oid},
        {"$set": {
            "startDate": start_date,
            "status": "active",
            "endDate": start_date + timedelta(days=weeks_total * 7),
            "progress.totalWorkouts": total_workouts,
            "updatedAt": now,
        }},
    )

    skipped_msg = f" ({len(already_scheduled)} already scheduled, skipped)" if already_scheduled and not overwrite else ""
    return {
        "success": True,
        "dry_run": False,
        "written": True,
        "events_created": inserted_count,
        "message": (
            f"Scheduled **{inserted_count}** session(s) for **{plan.get('name', 'your plan')}** "
            f"starting {start_date.strftime('%A, %B %d')}{skipped_msg}. Your plan is now active!"
        ),
    }
