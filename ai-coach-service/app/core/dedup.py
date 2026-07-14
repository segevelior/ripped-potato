"""Shared dedup helpers for the exercise- and workout-template-creation tool paths.

Both write paths that can insert an exercise (ExerciseService.add_exercise and the
MCP McpTools._add_exercise) use this so the reuse message + workout hint can never
drift between them.
"""
import re
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.agents.volume_utils import flatten_template_exercises

# schedule_to_calendar appends a "(Jul 14)" style suffix to template names it
# creates — strip it so "Endurance 1 (Jul 14)" collides with "Endurance 1".
_DATE_SUFFIX_RE = re.compile(
    r"\s*\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\)$"
)


def strip_template_date_suffix(name: str) -> str:
    """Remove the scheduling date suffix from a template/event title, keeping case."""
    return _DATE_SUFFIX_RE.sub("", name or "")


def normalize_template_title(name: str) -> str:
    """Normalize a workout-template title for duplicate comparison:
    strip the date suffix, collapse whitespace, lowercase."""
    return re.sub(r"\s+", " ", strip_template_date_suffix(name)).strip().lower()


def _normalize_exercise_name(name: str) -> str:
    return re.sub(r"\s+", " ", name or "").strip().lower()


def exercise_content_signature(exercises: List[Dict[str, Any]]) -> tuple:
    """Identity of a workout's exercise content: the ordered prescription
    (normalized name, sets, reps). Deliberately order-sensitive and blind to
    rest/notes/duration — matching this means "the same session", so scheduling
    it again must LINK the existing template, never mint a copy."""
    return tuple(
        (
            _normalize_exercise_name(ex.get("exerciseName", "")),
            ex.get("targetSets", 3),
            ex.get("targetReps", 10),
        )
        for ex in exercises
    )


def template_doc_signature(doc: Dict[str, Any]) -> tuple:
    """The same content signature, recomputed from a PredefinedWorkout doc
    (blocks[].exercises[] with '3x10'-style volume strings)."""
    return exercise_content_signature(flatten_template_exercises(doc))


async def find_reusable_template(
    db, user_id: str, name: str, exercises: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Find an existing library template (the user's own OR a common one) whose
    exercise content exactly matches — the reuse-first rule for scheduling with
    inline workoutDetails. Returns the best match, or None (caller inserts).

    The hard rule: content must match exactly. A same-named template with
    different exercises is an ADJUSTED workout and must NOT be linked. Name is
    only a tie-breaker among content matches (then common over private, then
    oldest), so repeated schedules converge on one stable template."""
    signature = exercise_content_signature(exercises)
    if not signature:
        return None
    normalized_name = normalize_template_title(name)
    visibility = {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]}
    matches = []
    async for doc in db.predefinedworkouts.find(visibility):
        if template_doc_signature(doc) == signature:
            matches.append(doc)
    if not matches:
        return None
    matches.sort(key=lambda d: (
        normalize_template_title(d.get("name", "")) != normalized_name,
        not d.get("isCommon", False),
        str(d.get("_id", "")),
    ))
    return matches[0]


async def existing_exercise_reuse_response(db, user_id: str, name: str) -> Optional[Dict[str, Any]]:
    """Return a "reuse, don't duplicate" tool response if an exercise with this exact
    (case-insensitive) name already exists for the user — a common one OR one they
    created. Returns None when the name is new (caller should insert).

    ``created=False`` is deliberate: reusing an existing exercise is NOT the same as
    completing the user's request. When a workout template shares the name, the hint
    steers a mis-classified "add my workout" request to create_workout_template.
    """
    name_regex = {"$regex": f"^{re.escape(name)}$", "$options": "i"}
    visibility = {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]}
    existing = await db.exercises.find_one({"name": name_regex, **visibility})
    if not existing:
        return None
    template = await db.predefinedworkouts.find_one({"name": name_regex, **visibility}, {"_id": 1})
    return {
        "success": True,
        "already_exists": True,
        "created": False,
        "exercise_id": str(existing["_id"]),
        "message": f"'{existing['name']}' already exists — reused it, did NOT create anything new.",
        "hint": (
            "A workout template with this name also exists; if the user asked to add a "
            "WORKOUT, call create_workout_template instead of adding an exercise."
        ) if template else None,
    }


async def existing_template_duplicate_response(
    db, user_id: str, name: str
) -> Optional[Dict[str, Any]]:
    """Return a "reuse, don't duplicate" tool error if a workout template with this
    title already exists for the user (common OR their own). Returns None when the
    name is new (caller should insert).

    Matching is normalized-exact (case/whitespace/date-suffix insensitive), NOT
    fuzzy — "Push Day" must never block "Push Day B". The message is a corrective
    mini-prompt: it names the existing template's id and the exact call that
    schedules it, so the model's laziest path becomes the correct one.
    """
    normalized = normalize_template_title(name)
    if not normalized:
        return None
    visibility = {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]}
    match_id = None
    async for doc in db.predefinedworkouts.find(visibility, {"name": 1}):
        if normalize_template_title(doc.get("name", "")) == normalized:
            match_id = doc["_id"]
            break
    if match_id is None:
        return None
    t = await db.predefinedworkouts.find_one({"_id": match_id})
    total_exercises = sum(len(b.get("exercises") or []) for b in (t.get("blocks") or []))
    return {
        "success": False,
        "error": "duplicate_template",
        "already_exists": True,
        "existing": {
            "id": str(t["_id"]),
            "name": t.get("name", ""),
            "total_exercises": total_exercises,
            "goal": t.get("goal", ""),
        },
        "message": (
            f"A workout template named '{t.get('name', '')}' already exists "
            f"(id={t['_id']}, {total_exercises} exercises). Did NOT create anything. "
            f"If the user meant this existing workout: to put it on the calendar, call "
            f"schedule_to_calendar with workout_template_id='{t['_id']}' — do not "
            f"re-create it. Only retry create_workout_template with "
            f"confirm_duplicate=true if the user explicitly wants a second, separate "
            f"template with this name."
        ),
    }
