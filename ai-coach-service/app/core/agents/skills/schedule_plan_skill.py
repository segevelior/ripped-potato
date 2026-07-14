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

import structlog
from bson import ObjectId

from app.core.agents.services.exercise_resolver import ExerciseResolver
from app.core.agents.skills.registry import SkillContext, skill

logger = structlog.get_logger()


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
    YYYY-MM-DD. Returns a naive UTC-midnight datetime, or None if unparseable.

    KNOWN v1 LIMITATION: dates are anchored to UTC midnight and 'today'/'tomorrow'
    use UTC now — User.settings.timezone is intentionally ignored for now. A user
    in a UTC-negative zone saying 'today' late in the evening can land a day early.
    Revisit by threading the user's timezone through when we localize scheduling.
    """
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


# Re-exported for existing importers/tests; implementation moved to
# volume_utils so services can use it without a circular import.
from app.core.agents.volume_utils import parse_volume as _parse_volume  # noqa: E402


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
                    entry = {
                        "exerciseName": ex.get("exercise_name", ""),
                        "targetSets": sets,
                        "targetReps": reps,
                        "notes": ex.get("notes", ""),
                    }
                    # Templates should never carry a null exercise_id, but if a
                    # legacy one does, omit the key (CalendarEvent.exerciseId is
                    # optional) rather than propagate the null.
                    if ex.get("exercise_id"):
                        entry["exerciseId"] = ex["exercise_id"]
                    else:
                        logger.warning("template exercise missing exercise_id",
                                       template=tmpl.get("name"),
                                       exercise=entry["exerciseName"])
                    exercises.append(entry)
            return {
                "title": tmpl.get("name", "Workout"),
                "type": "strength",
                "duration": tmpl.get("estimated_duration", 45),
                "exercises": exercises,
                "template_id": workout.get("predefinedWorkoutId"),
            }
        # Referenced template is missing — nothing to schedule. Flagged so
        # _build_events drops the slot instead of inserting an orphan event
        # with an empty exercise list.
        return {"title": "Workout", "type": "strength", "duration": 45, "exercises": [],
                "template_id": None, "missing_template": True}

    # Custom inline workout
    custom = workout.get("customWorkout") or {}
    exercises = []
    for ex in custom.get("exercises", []) or []:
        sets_arr = ex.get("sets", []) or []
        first = sets_arr[0] if sets_arr and isinstance(sets_arr[0], dict) else {}
        entry = {
            "exerciseName": ex.get("exerciseName", ""),
            "targetSets": len(sets_arr) or 3,
            "targetReps": first.get("reps") or 10,
            "notes": "",
        }
        if ex.get("exerciseId"):
            entry["exerciseId"] = ex["exerciseId"]
        exercises.append(entry)
    return {
        "title": custom.get("title") or "Workout",
        "type": custom.get("type", "strength"),
        "duration": custom.get("durationMinutes", 45),
        "exercises": exercises,
        "template_id": None,
    }


def _included_weeks(plan: Dict[str, Any], weeks_cap: Optional[int]) -> List[Dict[str, Any]]:
    """Weeks that actually get scheduled: within the cap, and resolved.

    Rolling-materialization plans: only resolved weeks have real workouts;
    intent-only stubs are scheduled later, week by week, via resolve_week.
    Missing `resolved` = resolved (legacy plans).
    """
    weeks = sorted(plan.get("weeks", []) or [], key=lambda w: w.get("weekNumber", 0))
    if weeks_cap:
        weeks = [w for w in weeks if w.get("weekNumber", 0) <= weeks_cap]
    return [w for w in weeks if w.get("resolved") is not False]


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

    Workout/deload events without a library template but WITH exercises (custom
    plan workouts) carry a transient `_pendingTemplate` marker: the handler
    creates + links a PredefinedWorkout on the confirmed write path (never on
    dry-run) and strips the marker before insert. Workouts whose referenced
    template was deleted are dropped entirely rather than inserted as orphans.
    """
    events: List[Dict[str, Any]] = []
    weeks = _included_weeks(plan, weeks_cap)
    included_week_numbers = {w.get("weekNumber", 0) for w in weeks}

    for week in weeks:
        week_number = week.get("weekNumber", 1)
        is_deload = bool(week.get("deloadWeek", False))

        for workout in week.get("workouts", []) or []:
            day = workout.get("dayOfWeek", 1)
            date = _compute_event_date(start_date, week_number, day)
            content = _resolve_workout_content(workout, template_map)
            if content.get("missing_template"):
                logger.warning("plan workout references missing template — skipped",
                               plan_id=str(plan_oid), week=week_number, day=day)
                continue
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
            elif content["exercises"]:
                # Custom plan workout — needs a library template created and
                # linked on the write path (see _ensure_templates).
                event["_pendingTemplate"] = content
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

    # Milestone checkpoints from the skeleton land on the closing day of their
    # week (the slot key is type-qualified, so they coexist with a workout).
    for m in (plan.get("skeleton") or {}).get("milestones", []) or []:
        week_number = m.get("week")
        if week_number not in included_week_numbers:
            continue
        date = _compute_event_date(start_date, week_number, 6)
        events.append({
            "userId": user_oid,
            "planId": plan_oid,
            "planWeek": week_number,
            "planDay": 6,
            "date": date,
            "title": f"🎯 {m.get('title', 'Milestone')}",
            "type": "milestone",
            "status": "scheduled",
            "notes": m.get("criteria", ""),
            "createdAt": now,
            "updatedAt": now,
        })

    events.sort(key=lambda e: e["date"])
    return events


def _slot_key(event: Dict[str, Any]) -> tuple:
    """Idempotency key for a plan calendar event. Type-qualified so a milestone
    and a workout on the same (week, day) don't evict each other; workout and
    deload share a class (a re-planned deload week must MOVE the session, not
    duplicate it)."""
    etype = event.get("type")
    # Missing type (legacy events) defaults to the workout class; workout and
    # deload share it (a re-planned deload week moves the session, no duplicate).
    type_class = "workout" if etype in ("workout", "deload", None) else etype
    return (event.get("planWeek"), event.get("planDay"), type_class)


def _template_content_key(name: str, exercises: List[Dict[str, Any]]) -> tuple:
    """Identity of a workout's content: title + ordered exercise prescription.
    Used to dedupe template creation (same custom workout repeated across
    weeks → one library entry) and to match plan-tagged templates on re-runs."""
    return (
        name,
        tuple(
            (ex.get("exerciseName", ""), ex.get("targetSets", 3), ex.get("targetReps", 10))
            for ex in exercises
        ),
    )


def _template_doc_key(doc: Dict[str, Any]) -> tuple:
    """The same content key, recomputed from a PredefinedWorkout document."""
    exercises = []
    for block in doc.get("blocks", []) or []:
        for ex in block.get("exercises", []) or []:
            sets, reps = _parse_volume(ex.get("volume"))
            exercises.append({"exerciseName": ex.get("exercise_name", ""),
                              "targetSets": sets, "targetReps": reps})
    return _template_content_key(doc.get("name", ""), exercises)


def _template_doc_exercise_ids(doc: Dict[str, Any]) -> List[Any]:
    return [
        ex.get("exercise_id")
        for block in doc.get("blocks", []) or []
        for ex in block.get("exercises", []) or []
    ]


async def _ensure_templates(
    ctx: SkillContext, user_id: str, plan: Dict[str, Any], events: List[Dict[str, Any]]
) -> int:
    """Create (or reuse) a PredefinedWorkout for every event carrying a
    `_pendingTemplate` marker, link it via workoutTemplateId, and backfill
    resolved exerciseIds into the event's embedded workoutDetails.

    Dedupe is by content key, both within the run (a workout repeated across
    weeks shares ONE library entry) and across re-runs (overwrite deletes the
    plan's events but not its templates — plan-tagged templates with matching
    content are reused, so re-scheduling never duplicates the library). Keying
    by content rather than name also keeps two same-titled workouts with
    different prescriptions (e.g. easy-week vs hard-week "Intervals") apart.

    Only called on the confirmed write path — dry-run previews write nothing.
    Returns the number of templates created.
    """
    pending = [e for e in events if e.get("_pendingTemplate")]
    if not pending:
        return 0

    user_oid = ObjectId(user_id)
    plan_tag = f"plan-{plan['_id']}"
    # key -> (template_id, ordered exercise ids)
    known: Dict[tuple, tuple] = {}
    async for doc in ctx.db.predefinedworkouts.find({"createdBy": user_oid, "tags": plan_tag}):
        known[_template_doc_key(doc)] = (doc["_id"], _template_doc_exercise_ids(doc))

    created = 0
    resolver = ExerciseResolver(ctx.db)
    now = datetime.utcnow()
    for event in pending:
        content = event.pop("_pendingTemplate")
        key = _template_content_key(content["title"], content["exercises"])
        if key not in known:
            blocks = [{
                "name": "Main Workout",
                "exercises": [
                    {
                        "exercise_name": ex.get("exerciseName", ""),
                        "exercise_id": ex.get("exerciseId"),
                        "volume": f"{ex.get('targetSets', 3)}x{ex.get('targetReps', 10)}",
                        "rest": "60s",
                        "notes": ex.get("notes", ""),
                    }
                    for ex in content["exercises"]
                ],
            }]
            # best_effort: the write is already user-confirmed — take the best
            # match (or create) rather than stalling, same as schedule_to_calendar.
            blocks, _report = await resolver.resolve_blocks(
                user_id, blocks, on_ambiguous="best_effort"
            )
            template_doc = {
                "name": content["title"],
                "goal": f"Part of plan: {plan.get('name', 'training plan')}",
                "primary_disciplines": [content.get("type", "strength")],
                "estimated_duration": content.get("duration", 45),
                "difficulty_level": "intermediate",
                "blocks": blocks,
                "tags": ["ai-generated", "plan", plan_tag],
                "isCommon": False,
                "createdBy": user_oid,
                "popularity": 0,
                "ratings": {"average": 0, "count": 0},
                "createdAt": now,
                "updatedAt": now,
            }
            result = await ctx.db.predefinedworkouts.insert_one(template_doc)
            known[key] = (result.inserted_id, _template_doc_exercise_ids(template_doc))
            created += 1

        template_id, exercise_ids = known[key]
        event["workoutTemplateId"] = template_id
        embedded = event.get("workoutDetails", {}).get("exercises", [])
        if len(embedded) == len(exercise_ids):
            for entry, ex_id in zip(embedded, exercise_ids):
                if ex_id and not entry.get("exerciseId"):
                    entry["exerciseId"] = ex_id

    if created:
        logger.info("created plan workout templates",
                    plan_id=str(plan["_id"]), created=created, linked=len(pending))
    return created


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
    moved: List[Dict[str, Any]],
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
        lines.append(f"- {len(already_scheduled)} session(s) already scheduled on the same dates (will be skipped)")
    if moved:
        lines.append(f"- {len(moved)} session(s) are already scheduled on different dates — confirm to reschedule (replaces the old ones)")
    if conflicts:
        lines.append(f"- Heads up: {len(conflicts)} date(s) already have another event; I'll add the workout alongside it")
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

    # Predefined workouts whose template was deleted are dropped by
    # _build_events (no orphan events) — surface that instead of hiding it.
    skipped_missing = sum(
        1
        for w in _included_weeks(plan, weeks_cap)
        for wk in (w.get("workouts") or [])
        if wk.get("workoutType") == "predefined"
        and str(wk.get("predefinedWorkoutId")) not in template_map
    )

    if not proposed:
        if skipped_missing:
            return {
                "success": False,
                "message": (
                    f"All {skipped_missing} workout(s) in range reference deleted workout "
                    "templates, so there's nothing to schedule. Want me to rebuild them?"
                ),
            }
        return {"success": False, "message": "This plan has no workouts to schedule yet."}

    unresolved_count = sum(
        1 for w in (plan.get("weeks") or [])
        if w.get("resolved") is False and (not weeks_cap or w.get("weekNumber", 0) <= weeks_cap)
    )

    # Fetch existing events in range for dedup + conflict detection.
    min_d = proposed[0]["date"]
    max_d = proposed[-1]["date"]
    existing = await ctx.db.calendarevents.find({
        "userId": user_oid,
        "date": {"$gte": min_d, "$lte": max_d},
        "status": {"$ne": "cancelled"},
    }).to_list(None)

    # Index existing plan events by (week, day) so we can tell a true duplicate
    # (same slot AND same date) from a move (same slot, different date — a
    # reschedule to a new start date). Other-source events are tracked by date
    # for a non-blocking heads-up.
    existing_plan_by_slot: Dict[Any, Dict[str, Any]] = {}
    other_by_date: Dict[Any, List[str]] = {}
    for e in existing:
        if e.get("planId") == plan_oid:
            existing_plan_by_slot[_slot_key(e)] = e
        elif e.get("date"):
            other_by_date.setdefault(e["date"].date(), []).append(e.get("title", "event"))

    already_scheduled: List[Dict[str, Any]] = []  # same slot + same date -> skip
    moved: List[Dict[str, Any]] = []              # same slot, different date -> reschedule
    to_insert: List[Dict[str, Any]] = []
    for e in proposed:
        existing_e = existing_plan_by_slot.get(_slot_key(e))
        if existing_e is None:
            to_insert.append(e)
        elif existing_e.get("date") and existing_e["date"].date() == e["date"].date():
            already_scheduled.append(e)
        else:
            moved.append(e)

    conflicts = [
        {"date": e["date"].strftime("%Y-%m-%d"), "title": e["title"], "existing": other_by_date[e["date"].date()]}
        for e in proposed
        if e["date"].date() in other_by_date
    ]

    preview_msg = _format_preview(plan, proposed, already_scheduled, moved, conflicts, start_date)
    if skipped_missing:
        preview_msg += (
            f"\n\nNote: {skipped_missing} workout(s) reference a deleted workout template "
            "and were skipped — want me to rebuild them?"
        )
    if unresolved_count:
        preview_msg += (
            f"\n\nNote: {unresolved_count} later week(s) aren't finalized yet — they follow the plan's "
            "structure and get scheduled as each week is resolved from your actual training."
        )

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "message": preview_msg,
            "proposed_count": len(proposed),
            "proposed_events": [_serialize_event(e) for e in proposed],
            "already_scheduled_count": len(already_scheduled),
            "moved_count": len(moved),
            "conflicts": conflicts,
        }

    # --- Confirmed write ---
    # A move (plan already scheduled at different dates) is a destructive
    # reschedule — require an explicit overwrite rather than silently skipping
    # (which would leave the old events in place and insert nothing).
    if moved and not overwrite:
        return {
            "success": True,
            "needs_confirmation": "reschedule",
            "message": (
                f"This plan is already on your calendar at different dates. To move "
                f"{len(moved)} session(s) to start {start_date.strftime('%A, %B %d')}, "
                f"confirm and I'll reschedule it (this replaces the existing plan events)."
            ),
        }

    if overwrite:
        # Clear ALL of this plan's events (not just the new range) so a shifted
        # plan doesn't leave stragglers at the old dates.
        await ctx.db.calendarevents.delete_many({"userId": user_oid, "planId": plan_oid})
        insert_list = proposed
    else:
        insert_list = to_insert

    # Custom plan workouts get a library template created + linked now (write
    # path only — dry-run previews never reach here).
    await _ensure_templates(ctx, user_id, plan, insert_list)
    for e in proposed:
        e.pop("_pendingTemplate", None)

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
    message = (
        f"Scheduled **{inserted_count}** session(s) for **{plan.get('name', 'your plan')}** "
        f"starting {start_date.strftime('%A, %B %d')}{skipped_msg}. Your plan is now active!"
    )
    if skipped_missing:
        message += (
            f"\n\nNote: {skipped_missing} workout(s) reference a deleted workout template "
            "and were skipped — want me to rebuild them?"
        )
    return {
        "success": True,
        "dry_run": False,
        "written": True,
        "events_created": inserted_count,
        "message": message,
    }
