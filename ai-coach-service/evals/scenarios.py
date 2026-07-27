"""
Think-then-act eval scenarios — all derived from the real "Add Endurance 1"
failure transcript: the agent created an empty placeholder template instead of
searching the library, left duplicates, and "deleted" by marking skipped.

Each scenario seeds a throwaway user's data, scripts the user turns
(including confirmations), and grades with trajectory checks + a final-state
diff against the scratch DB (tau-bench style: the DB is the ground truth).
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List

from bson import ObjectId

from evals.harness import (
    Trace,
    assert_id_provenance,
    assert_no_false_success,
    assert_no_repeated_reads,
    assert_no_writes,
    assert_read_before_write,
    is_write,
    _succeeded,
)


@dataclass
class Scenario:
    id: str
    turns: List[str]
    seed: Callable[[Any, str], Awaitable[Dict[str, Any]]]
    final_state_check: Callable[[Any, str, Dict[str, Any], Trace], Awaitable[List[str]]]
    trajectory_checks: List[Callable[[Trace], List[str]]] = field(
        default_factory=lambda: [assert_read_before_write, assert_id_provenance,
                                 assert_no_false_success]
    )


def _today() -> datetime:
    now = datetime.utcnow()
    return datetime(now.year, now.month, now.day)


# ----------------------------- seed helpers -----------------------------

EXERCISES = ["Running", "Burpees", "Jump Rope", "Mountain Climbers",
             "Kettlebell Swings", "Rowing"]


async def seed_user(db) -> str:
    res = await db.users.insert_one({
        "email": f"eval-{ObjectId()}@example.com",
        "name": "Eval User",
        "settings": {"timezone": "UTC"},
        "createdAt": datetime.utcnow(),
    })
    return str(res.inserted_id)


async def seed_exercises(db, user_id: str) -> Dict[str, ObjectId]:
    ids = {}
    for name in EXERCISES:
        res = await db.exercises.insert_one({
            "name": name,
            "muscles": ["Full Body"],
            "discipline": ["Conditioning"],
            "difficulty": "intermediate",
            "isCommon": False,
            "createdBy": ObjectId(user_id),
            "createdAt": datetime.utcnow(),
        })
        ids[name] = res.inserted_id
    return ids


async def seed_template(db, user_id: str, name: str,
                        exercise_ids: Dict[str, ObjectId],
                        exercise_names=None) -> ObjectId:
    exercise_names = exercise_names or EXERCISES
    blocks = [{
        "name": "Main Work",
        "exercises": [
            {"exercise_id": str(exercise_ids[n]), "exercise_name": n,
             "volume": "3x12", "rest": "60s", "notes": ""}
            for n in exercise_names
        ],
    }]
    res = await db.sessiontemplates.insert_one({
        "name": name,
        "goal": "Aerobic conditioning",
        "primary_disciplines": ["Conditioning"],
        "estimated_duration": 45,
        "difficulty_level": "intermediate",
        "blocks": blocks,
        "tags": [],
        "isCommon": False,
        "createdBy": ObjectId(user_id),
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    })
    return res.inserted_id


async def seed_event(db, user_id: str, date: datetime, title: str,
                     template_id: ObjectId = None, exercises=None,
                     status: str = "scheduled") -> ObjectId:
    doc = {
        "userId": ObjectId(user_id),
        "date": date,
        "title": title,
        "type": "session",
        "status": status,
        "notes": "",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "sessionDetails": {"discipline": "strength", "estimatedDuration": 45,
                           "exercises": exercises or []},
    }
    if template_id:
        doc["sessionTemplateId"] = template_id
    res = await db.calendarevents.insert_one(doc)
    return res.inserted_id


async def _workout_events_today(db, user_id: str):
    today = _today()
    return [e async for e in db.calendarevents.find({
        "userId": ObjectId(user_id),
        "date": {"$gte": today, "$lt": today + timedelta(days=1)},
        "type": {"$in": ["session", "deload"]},
    })]


async def _template_count(db, user_id: str) -> int:
    return await db.sessiontemplates.count_documents(
        {"createdBy": ObjectId(user_id)}
    )


async def _empty_templates(db, user_id: str):
    return [t async for t in db.sessiontemplates.find(
        {"createdBy": ObjectId(user_id)}
    ) if not any((b.get("exercises") or []) for b in (t.get("blocks") or []))]


async def _event_exercise_count(db, event) -> int:
    """Exercises of an event under the reference architecture: embedded list
    (legacy events) or the linked template's flattened blocks."""
    embedded = (event.get("sessionDetails") or {}).get("exercises") or []
    if embedded:
        return len(embedded)
    tid = event.get("sessionTemplateId")
    if tid:
        t = await db.sessiontemplates.find_one({"_id": tid})
        if t:
            return sum(len(b.get("exercises") or []) for b in (t.get("blocks") or []))
    return 0


# ----------------------------- scenarios -----------------------------


async def _seed_endurance(db, user_id):
    ex = await seed_exercises(db, user_id)
    tid = await seed_template(db, user_id, "Endurance 1", ex)
    return {"template_id": tid, "template_count": await _template_count(db, user_id)}


async def _check_schedule_existing(db, user_id, refs, trace):
    problems = []
    events = await _workout_events_today(db, user_id)
    if len(events) != 1:
        problems.append(f"expected exactly 1 workout event today, found {len(events)}")
    elif events[0].get("sessionTemplateId") != refs["template_id"]:
        problems.append(
            f"event not linked to the existing Endurance 1 template "
            f"(sessionTemplateId={events[0].get('sessionTemplateId')})"
        )
    elif await _event_exercise_count(db, events[0]) != len(EXERCISES):
        problems.append("event's exercises don't match the template")
    if await _template_count(db, user_id) != refs["template_count"]:
        problems.append("a new template was created instead of reusing Endurance 1")
    if await _empty_templates(db, user_id):
        problems.append("an empty placeholder template exists")
    return problems


SCHEDULE_EXISTING = Scenario(
    id="schedule-existing-by-name",
    turns=["Add my Endurance 1 workout to my calendar for today",
           "Yes, go ahead"],
    seed=_seed_endurance,
    final_state_check=_check_schedule_existing,
)


async def _check_no_side_effects(db, user_id, refs, trace):
    problems = []
    if await _workout_events_today(db, user_id):
        problems.append("a calendar event was created for a nonexistent workout")
    if await _template_count(db, user_id) != refs.get("template_count", 0):
        problems.append("a template was invented for a nonexistent workout")
    if await _empty_templates(db, user_id):
        problems.append("an empty placeholder template was created")
    return problems


async def _seed_exercises_only(db, user_id):
    await seed_exercises(db, user_id)
    return {"template_count": await _template_count(db, user_id)}


SCHEDULE_NONEXISTENT = Scenario(
    id="schedule-nonexistent-name",
    turns=["Add my 'Hypertrophy Blast 9000' workout to today's calendar"],
    seed=_seed_exercises_only,
    final_state_check=_check_no_side_effects,
    trajectory_checks=[assert_no_writes, assert_no_false_success],
)


async def _seed_event_today(db, user_id):
    ex = await seed_exercises(db, user_id)
    tid = await seed_template(db, user_id, "Endurance 1", ex)
    eid = await seed_event(
        db, user_id, _today(), "Endurance 1 (Today)", template_id=tid,
        exercises=[{"exerciseId": str(ex["Running"]), "exerciseName": "Running",
                    "targetSets": 3, "targetReps": 12}],
    )
    return {"event_id": eid, "template_id": tid}


async def _check_removed_not_skipped(db, user_id, refs, trace):
    problems = []
    events = await _workout_events_today(db, user_id)
    if events:
        statuses = [e.get("status") for e in events]
        if "skipped" in statuses:
            problems.append(
                "event was marked skipped instead of deleted — 'remove' must delete"
            )
        else:
            problems.append(f"event still on the calendar (statuses={statuses})")
    return problems


REMOVE_VS_SKIP = Scenario(
    id="remove-vs-skip",
    turns=["Please remove today's workout from my calendar entirely",
           "Yes, remove it"],
    seed=_seed_event_today,
    final_state_check=_check_removed_not_skipped,
)


async def _seed_duplicates(db, user_id):
    ex = await seed_exercises(db, user_id)
    tid = await seed_template(db, user_id, "Endurance 1", ex)
    good = await seed_event(
        db, user_id, _today(), "Endurance 1 (Today)", template_id=tid,
        exercises=[{"exerciseId": str(ex["Running"]), "exerciseName": "Running",
                    "targetSets": 3, "targetReps": 12}],
    )
    empty = await seed_event(db, user_id, _today(), "Endurance 1", exercises=[])
    return {"good_event_id": good, "empty_event_id": empty, "template_id": tid}


async def _check_duplicate_cleanup(db, user_id, refs, trace):
    problems = []
    events = await _workout_events_today(db, user_id)
    if len(events) != 1:
        problems.append(f"expected exactly 1 event to remain, found {len(events)}")
    elif events[0]["_id"] != refs["good_event_id"]:
        problems.append("the WRONG event was removed — the empty one should go")
    return problems


DUPLICATE_CLEANUP = Scenario(
    id="duplicate-cleanup",
    turns=["There are two Endurance 1 workouts on my calendar today and one of "
           "them is empty. Remove the empty one.",
           "Yes, remove it"],
    seed=_seed_duplicates,
    final_state_check=_check_duplicate_cleanup,
)


async def _seed_correction_state(db, user_id):
    ex = await seed_exercises(db, user_id)
    real = await seed_template(db, user_id, "Endurance 1", ex)
    empty_res = await db.sessiontemplates.insert_one({
        "name": "Endurance 1 (Today)", "goal": "", "primary_disciplines": [],
        "estimated_duration": 45, "difficulty_level": "intermediate",
        "blocks": [], "tags": [], "isCommon": False,
        "createdBy": ObjectId(user_id),
        "createdAt": datetime.utcnow(), "updatedAt": datetime.utcnow(),
    })
    event = await seed_event(db, user_id, _today(), "Endurance 1 (Today)",
                             template_id=empty_res.inserted_id, exercises=[])
    return {"real_template_id": real, "empty_template_id": empty_res.inserted_id,
            "event_id": event}


async def _check_correction(db, user_id, refs, trace):
    problems = []
    events = await _workout_events_today(db, user_id)
    if len(events) != 1:
        problems.append(f"expected exactly 1 event today after the fix, found {len(events)}")
        return problems
    count = await _event_exercise_count(db, events[0])
    if count < 4:
        problems.append(
            f"today's event still has {count} exercises — the empty "
            f"placeholder was not replaced with the real Endurance 1"
        )
    return problems


CORRECTION_TURN = Scenario(
    id="correction-turn",
    turns=["The Endurance 1 workout you added to today's calendar is empty — no "
           "exercises. I already have a real Endurance 1 template in my library. "
           "Fix today's session so it uses the real one.",
           "Yes, do it"],
    seed=_seed_correction_state,
    final_state_check=_check_correction,
)


async def _seed_ambiguous(db, user_id):
    ex = await seed_exercises(db, user_id)
    t1 = await seed_template(db, user_id, "Endurance 1", ex)
    t2 = await seed_template(db, user_id, "Endurance 2", ex,
                             exercise_names=EXERCISES[:4])
    return {"template_ids": [t1, t2],
            "template_count": await _template_count(db, user_id)}


AMBIGUOUS_NAME = Scenario(
    id="ambiguous-name",
    turns=["Add my endurance workout to the calendar for today"],
    seed=_seed_ambiguous,
    final_state_check=_check_no_side_effects,
    trajectory_checks=[assert_no_writes, assert_no_false_success],
)


async def _workout_events_on(db, user_id: str, date: datetime):
    return [e async for e in db.calendarevents.find({
        "userId": ObjectId(user_id),
        "date": {"$gte": date, "$lt": date + timedelta(days=1)},
        "type": {"$in": ["session", "deload"]},
    })]


async def _check_twice_one_template(db, user_id, refs, trace):
    """Scheduling the same workout on two days must yield two events linked to
    ONE template — the original duplication bug minted a library copy per date."""
    problems = []
    for label, date in (("today", _today()), ("tomorrow", _today() + timedelta(days=1))):
        events = await _workout_events_on(db, user_id, date)
        if len(events) != 1:
            problems.append(f"expected exactly 1 workout event {label}, found {len(events)}")
        elif events[0].get("sessionTemplateId") != refs["template_id"]:
            problems.append(
                f"{label}'s event is not linked to the seeded Endurance 1 template "
                f"(sessionTemplateId={events[0].get('sessionTemplateId')})"
            )
    if await _template_count(db, user_id) != refs["template_count"]:
        problems.append(
            "the library gained a template — scheduling twice must reuse "
            "the ONE existing Endurance 1, never copy it per date"
        )
    return problems


SCHEDULE_TWICE_ONE_TEMPLATE = Scenario(
    id="schedule-twice-one-template",
    turns=["Add my Endurance 1 workout to my calendar for today",
           "Yes, go ahead",
           "Great — put the same workout on my calendar for tomorrow too",
           "Yes, confirm"],
    seed=_seed_endurance,
    final_state_check=_check_twice_one_template,
)


# --- tool-call memory scenarios (TOR: coach repeats tool calls every turn) ---
# These two are deliberately in tension: TOOL_MEMORY asserts reads are NOT
# repeated while nothing was written; FRESHNESS_AFTER_WRITE asserts a read IS
# repeated after a write. Passing both means memory without staleness.


async def _check_memory_endurance2(db, user_id, refs, trace):
    """Prod repro: exactly 1 event today, linked to Endurance 2, no new template."""
    problems = []
    events = await _workout_events_today(db, user_id)
    endurance2 = refs["template_ids"][1]
    if len(events) != 1:
        problems.append(f"expected exactly 1 workout event today, found {len(events)}")
    elif events[0].get("sessionTemplateId") != endurance2:
        problems.append(
            f"event not linked to the existing Endurance 2 template "
            f"(sessionTemplateId={events[0].get('sessionTemplateId')})"
        )
    if await _template_count(db, user_id) != refs["template_count"]:
        problems.append("a new template was created instead of reusing Endurance 2")
    return problems


TOOL_MEMORY = Scenario(
    id="tool-memory-no-repeated-reads",
    turns=["Add a workout for today",
           "Add Endurance 2",
           "Yes, add it"],
    seed=_seed_ambiguous,
    final_state_check=_check_memory_endurance2,
    trajectory_checks=[assert_read_before_write, assert_id_provenance,
                       assert_no_false_success, assert_no_repeated_reads],
)


async def _check_freshness_after_write(db, user_id, refs, trace):
    """After the confirmed write, the calendar question must trigger a FRESH
    get_calendar_events (replayed pre-write results are stale) and the reply
    must reflect the newly added workout."""
    problems = []
    writes = [i for i, c in enumerate(trace.calls) if is_write(c) and _succeeded(c)]
    if not writes:
        problems.append("no successful write happened — scenario did not exercise staleness")
        return problems
    last_write = max(writes)
    post_write_calendar_reads = [
        c for c in trace.calls[last_write + 1:]
        if c.name == "get_calendar_events" and _succeeded(c)
    ]
    if not post_write_calendar_reads:
        problems.append(
            "no fresh get_calendar_events after the write — the agent answered "
            "the calendar question from stale replayed results"
        )
    final_text = (trace.turn_texts[-1] or "").lower()
    if "endurance" not in final_text:
        problems.append(
            "final answer doesn't mention the just-added Endurance 1 workout — "
            "stale view of the calendar"
        )
    return problems


FRESHNESS_AFTER_WRITE = Scenario(
    id="freshness-reads-repeat-after-write",
    turns=["What's on my calendar today?",
           "Add my Endurance 1 workout to my calendar for today",
           "Yes, go ahead",
           "What's on my calendar today now?"],
    seed=_seed_endurance,
    final_state_check=_check_freshness_after_write,
)


# --- multi-sport scenarios (session = umbrella for ALL training) ----------
# Acceptance tests for the workout→session rename: the coach must treat a
# climb, a ride and a mixed-discipline week as first-class sessions and set
# `discipline` from the SPORT, not default everything to strength.


def _next_weekday(weekday: int) -> datetime:
    """Next occurrence of `weekday` (0=Mon..6=Sun) strictly after today."""
    today = _today()
    delta = (weekday - today.weekday()) % 7 or 7
    return today + timedelta(days=delta)


# These scenarios assert on STRUCTURAL discipline fields only — never on
# titles, template names or exercise names. A session called "Friday Climbing"
# whose discipline is "strength" is precisely the bug they exist to catch, so a
# title match must never be able to make one of them pass.

def _discipline_values(*values) -> set:
    """Normalize discipline FIELDS (str / list / dict of them) to a lowercase set.
    Only ever fed real discipline fields, never free-text names."""
    out = set()
    stack = list(values)
    while stack:
        v = stack.pop()
        if isinstance(v, str):
            if v.strip():
                out.add(v.strip().lower())
        elif isinstance(v, dict):
            stack.extend(v.values())
        elif isinstance(v, (list, tuple)):
            stack.extend(v)
    return out


def _has_discipline(values, *prefixes) -> bool:
    """True if any discipline value starts with one of `prefixes` (so 'climbing'
    and 'bouldering' both satisfy climb/boulder, without matching prose)."""
    return any(v.startswith(prefixes) for v in values)


_CLIMBING = ("climb", "boulder")
_STRENGTH = ("strength", "weight", "lifting", "resistance")


async def _event_disciplines(db, event) -> set:
    """The event's structural discipline fields: sessionDetails.discipline and,
    under the reference architecture, the linked template's primary_disciplines."""
    details = event.get("sessionDetails") or {}
    values = _discipline_values(details.get("discipline"))
    tid = event.get("sessionTemplateId")
    if tid:
        t = await db.sessiontemplates.find_one({"_id": tid})
        if t:
            values |= _discipline_values(t.get("primary_disciplines"))
    return values


async def _check_climbing_session_friday(db, user_id, refs, trace):
    """A climbing session must land on Friday as a real session (linked
    template or embedded exercises) whose sessionDetails.discipline — or whose
    linked template's primary_disciplines — says CLIMBING. A climbing-sounding
    TITLE over discipline 'strength' is a failure of the domain model, not a pass."""
    problems = []
    friday = refs["friday"]
    events = await _workout_events_on(db, user_id, friday)
    if len(events) != 1:
        problems.append(f"expected exactly 1 session event on Friday, found {len(events)}")
        return problems
    event = events[0]
    disciplines = await _event_disciplines(db, event)
    if not _has_discipline(disciplines, *_CLIMBING):
        problems.append(
            f"Friday's event carries no climbing discipline (sessionDetails.discipline "
            f"+ template primary_disciplines = {sorted(disciplines)!r}, title "
            f"{event.get('title')!r}) — the coach treated a climbing session as a "
            "generic/strength workout"
        )
    if await _event_exercise_count(db, event) < 1:
        problems.append("Friday's climbing session has no exercises — empty placeholder")
    if await _empty_templates(db, user_id):
        problems.append("an empty placeholder template exists")
    # Tool choice: creating and/or scheduling a session, never add_exercise alone.
    names = [c.name for c in trace.calls]
    if not ({"create_session_template", "schedule_to_calendar"} & set(names)):
        problems.append(f"no session create/schedule tool was used (tools: {names})")
    if "add_exercise" in names and "create_session_template" not in names:
        problems.append("a whole climbing session was saved as a single exercise")
    return problems


async def _seed_for_climbing(db, user_id):
    await seed_exercises(db, user_id)
    return {"friday": _next_weekday(4),
            "template_count": await _template_count(db, user_id)}


CLIMBING_SESSION = Scenario(
    id="multisport-climbing-session-friday",
    turns=["Add a climbing session to my calendar for Friday — I boulder indoors, "
           "about 90 minutes",
           "Yes, that looks good",
           "Yes, confirm"],
    seed=_seed_for_climbing,
    final_state_check=_check_climbing_session_friday,
)


_CYCLING_DISCIPLINES = {"cycling", "endurance", "bike", "ride", "riding"}


async def _check_logged_ride(db, user_id, refs, trace):
    """Yesterday's ride must land in sessionlogs with a CYCLING discipline and
    yesterday's date — not today, and not discipline 'strength'."""
    problems = []
    logs = [l async for l in db.sessionlogs.find({"userId": ObjectId(user_id)})]
    if len(logs) != 1:
        problems.append(f"expected exactly 1 session log, found {len(logs)}")
        return problems
    log = logs[0]
    discipline = (log.get("discipline") or "").lower()
    if not any(d in discipline for d in _CYCLING_DISCIPLINES):
        problems.append(
            f"logged session discipline is {discipline!r} — a bike ride must be "
            "logged as cycling/endurance, not as a gym workout"
        )
    started = log.get("startedAt")
    if not isinstance(started, datetime) or started.date() != refs["yesterday"].date():
        problems.append(f"log is dated {started} — expected yesterday ({refs['yesterday'].date()})")
    if not (log.get("exercises") or []):
        problems.append("the ride was logged with no exercises at all")
    names = [c.name for c in trace.calls]
    if "log_session" not in names:
        problems.append(f"log_session was never called (tools: {names})")
    return problems


async def _seed_for_ride(db, user_id):
    await seed_exercises(db, user_id)
    return {"yesterday": _today() - timedelta(days=1)}


LOG_BIKE_RIDE = Scenario(
    id="multisport-log-bike-ride",
    turns=["Log yesterday's bike ride, 60km, about 2 hours",
           "Yes, log it"],
    seed=_seed_for_ride,
    final_state_check=_check_logged_ride,
    trajectory_checks=[assert_id_provenance, assert_no_false_success],
)


_PLAN_TOOLS = {"generate_plan", "create_plan", "resolve_week", "add_plan_session"}


async def _plan_disciplines(db, plan) -> set:
    """The plan's structural discipline fields ONLY — no titles, no plan name:

    - skeleton.phases[].disciplines[].discipline and phases[].sessionBlueprints[].discipline
      (the typed discipline fields the planner writes)
    - weeks[].sessions[].customSession.type
    - weeks[].sessions[].sessionTemplateId -> sessiontemplates.primary_disciplines
      (the only structural route for a sport customSession.type has no enum
      value for, e.g. climbing)
    """
    values = set()
    skeleton = plan.get("skeleton") or {}
    for phase in (skeleton.get("phases") or []):
        for d in (phase.get("disciplines") or []):
            values |= _discipline_values(d.get("discipline") if isinstance(d, dict) else d)
        for bp in (phase.get("sessionBlueprints") or []):
            values |= _discipline_values(bp.get("discipline"))
    for week in (plan.get("weeks") or []):
        for session in (week.get("sessions") or []):
            values |= _discipline_values((session.get("customSession") or {}).get("type"))
            tid = session.get("sessionTemplateId")
            if tid:
                t = await db.sessiontemplates.find_one({"_id": tid})
                if t:
                    values |= _discipline_values(t.get("primary_disciplines"))
    return values


async def _check_mixed_discipline_plan(db, user_id, refs, trace):
    """A week 'mixing strength and climbing' must produce a plan whose SESSIONS
    carry both disciplines structurally (customSession.type / linked template
    primary_disciplines / the skeleton's discipline fields). A plan that only
    says "climbing" in a session TITLE is the collapse back to gym workouts
    this scenario exists to catch."""
    problems = []
    names = [c.name for c in trace.calls]
    if not (_PLAN_TOOLS & set(names)):
        problems.append(f"no plan tool was used (tools: {names})")
    plans = [p async for p in db.plans.find({"userId": ObjectId(user_id)})]
    if not plans:
        problems.append("no plan was created")
        return problems
    if len(plans) > 1:
        problems.append(f"expected 1 plan, found {len(plans)} (duplicate drafts)")
    disciplines = set()
    for plan in plans:
        disciplines |= await _plan_disciplines(db, plan)
    if not _has_discipline(disciplines, *_STRENGTH):
        problems.append(
            f"no session carries a strength discipline (structural disciplines: "
            f"{sorted(disciplines)!r})"
        )
    if not _has_discipline(disciplines, *_CLIMBING):
        problems.append(
            f"no session carries a climbing discipline (structural disciplines: "
            f"{sorted(disciplines)!r}) — climbing named only in titles does not count"
        )
    return problems


async def _seed_for_mixed_plan(db, user_id):
    await seed_exercises(db, user_id)
    return {}


MIXED_DISCIPLINE_PLAN = Scenario(
    id="multisport-strength-plus-climbing-week",
    turns=["Plan me a week mixing strength and climbing",
           "Intermediate, 4 days a week, I have a full gym and a bouldering gym",
           "Yes, build it"],
    seed=_seed_for_mixed_plan,
    final_state_check=_check_mixed_discipline_plan,
    trajectory_checks=[assert_id_provenance, assert_no_false_success],
)


# ----- training interests (update_sport_preferences) -----


async def _get_interests(db, user_id):
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return ((user or {}).get("profile") or {}).get("sportPreferences", [])


async def _seed_nothing(db, user_id):
    return {}


async def _check_interest_added(db, user_id, refs, trace):
    interests = await _get_interests(db, user_id)
    if "climbing" not in interests:
        return [f"climbing not recorded in profile.sportPreferences ({interests!r})"]
    return []


VOLUNTEER_INTEREST = Scenario(
    id="volunteered-interest-recorded",
    turns=["By the way, I really want to get climbing into my training — add it to my interests"],
    seed=_seed_nothing,
    final_state_check=_check_interest_added,
    trajectory_checks=[assert_no_false_success],
)


async def _seed_climbing_yoga_interests(db, user_id):
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"profile.sportPreferences": ["climbing", "yoga"]}},
    )
    return {}


async def _check_yoga_removed(db, user_id, refs, trace):
    problems = []
    interests = await _get_interests(db, user_id)
    if "yoga" in interests:
        problems.append(f"yoga still in interests ({interests!r})")
    if "climbing" not in interests:
        problems.append("climbing was wrongly dropped — only remove what was said")
    return problems


DROP_INTEREST = Scenario(
    id="volunteered-interest-removed",
    turns=["I'm done with yoga for now — take it off my training interests"],
    seed=_seed_climbing_yoga_interests,
    final_state_check=_check_yoga_removed,
    trajectory_checks=[assert_no_false_success],
)


async def _check_no_interest_write(db, user_id, refs, trace):
    problems = []
    if await _get_interests(db, user_id):
        problems.append("interests were written although the athlete volunteered none")
    if any(c.name == "update_sport_preferences" for c in trace.calls):
        problems.append("update_sport_preferences called on an unrelated turn")
    return problems


NO_UNPROMPTED_INTEREST_WRITE = Scenario(
    id="no-unprompted-interest-write",
    turns=["What should I train today?"],
    seed=_seed_exercises_only,
    final_state_check=_check_no_interest_write,
    trajectory_checks=[assert_no_false_success],
)


SCENARIOS = [
    SCHEDULE_EXISTING,
    SCHEDULE_NONEXISTENT,
    REMOVE_VS_SKIP,
    DUPLICATE_CLEANUP,
    CORRECTION_TURN,
    AMBIGUOUS_NAME,
    SCHEDULE_TWICE_ONE_TEMPLATE,
    TOOL_MEMORY,
    FRESHNESS_AFTER_WRITE,
    CLIMBING_SESSION,
    LOG_BIKE_RIDE,
    MIXED_DISCIPLINE_PLAN,
    VOLUNTEER_INTEREST,
    DROP_INTEREST,
    NO_UNPROMPTED_INTEREST_WRITE,
]
