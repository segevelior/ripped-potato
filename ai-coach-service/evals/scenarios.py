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
    assert_no_writes,
    assert_read_before_write,
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
    res = await db.predefinedworkouts.insert_one({
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
        "type": "workout",
        "status": status,
        "notes": "",
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "workoutDetails": {"type": "strength", "estimatedDuration": 45,
                           "exercises": exercises or []},
    }
    if template_id:
        doc["workoutTemplateId"] = template_id
    res = await db.calendarevents.insert_one(doc)
    return res.inserted_id


async def _workout_events_today(db, user_id: str):
    today = _today()
    return [e async for e in db.calendarevents.find({
        "userId": ObjectId(user_id),
        "date": {"$gte": today, "$lt": today + timedelta(days=1)},
        "type": {"$in": ["workout", "deload"]},
    })]


async def _template_count(db, user_id: str) -> int:
    return await db.predefinedworkouts.count_documents(
        {"createdBy": ObjectId(user_id)}
    )


async def _empty_templates(db, user_id: str):
    return [t async for t in db.predefinedworkouts.find(
        {"createdBy": ObjectId(user_id)}
    ) if not any((b.get("exercises") or []) for b in (t.get("blocks") or []))]


async def _event_exercise_count(db, event) -> int:
    """Exercises of an event under the reference architecture: embedded list
    (legacy events) or the linked template's flattened blocks."""
    embedded = (event.get("workoutDetails") or {}).get("exercises") or []
    if embedded:
        return len(embedded)
    tid = event.get("workoutTemplateId")
    if tid:
        t = await db.predefinedworkouts.find_one({"_id": tid})
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
    elif events[0].get("workoutTemplateId") != refs["template_id"]:
        problems.append(
            f"event not linked to the existing Endurance 1 template "
            f"(workoutTemplateId={events[0].get('workoutTemplateId')})"
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
    empty_res = await db.predefinedworkouts.insert_one({
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
        "type": {"$in": ["workout", "deload"]},
    })]


async def _check_twice_one_template(db, user_id, refs, trace):
    """Scheduling the same workout on two days must yield two events linked to
    ONE template — the original duplication bug minted a library copy per date."""
    problems = []
    for label, date in (("today", _today()), ("tomorrow", _today() + timedelta(days=1))):
        events = await _workout_events_on(db, user_id, date)
        if len(events) != 1:
            problems.append(f"expected exactly 1 workout event {label}, found {len(events)}")
        elif events[0].get("workoutTemplateId") != refs["template_id"]:
            problems.append(
                f"{label}'s event is not linked to the seeded Endurance 1 template "
                f"(workoutTemplateId={events[0].get('workoutTemplateId')})"
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


SCENARIOS = [
    SCHEDULE_EXISTING,
    SCHEDULE_NONEXISTENT,
    REMOVE_VS_SKIP,
    DUPLICATE_CLEANUP,
    CORRECTION_TURN,
    AMBIGUOUS_NAME,
    SCHEDULE_TWICE_ONE_TEMPLATE,
]
