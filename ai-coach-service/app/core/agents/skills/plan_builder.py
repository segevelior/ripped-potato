"""
Pure plan-building logic shared by generate_plan, resolve_week, adjust_plan and
the internal weekly resolver. No DB, no LLM — everything here is unit-testable.

Core concepts:
- A plan may carry a `skeleton`: the macro structure (phases with per-phase
  session blueprints, one intent per week, deloads, milestones) produced by the
  planner model. Weeks are then MATERIALIZED (concrete workouts) only on a
  rolling horizon; later weeks are intent-only stubs with `resolved: False`.
- Back-compat convention: a week with NO `resolved` key is treated as resolved
  (legacy fully-materialized plans never carry the flag).
"""

import copy
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.agents.skills.knowledge import training_knowledge as tk

# Materialize this many weeks ahead by default. Product decision (2026-07-11):
# 12 — plans up to 12 weeks are fully written out at generation so the UI shows
# a complete plan; the skeleton is still stored, so rolling materialization
# (stubs + adherence-adaptive resolve_week) engages only for longer plans, and
# dialing this down later re-enables it for all plans with no other changes.
DEFAULT_HORIZON_WEEKS = 12
# Deload weeks scale volume to ~60% (mirrors _scale_sets in generate_plan).
DELOAD_MULTIPLIER = 0.6
# Adaptation: reduce volume by this factor on low adherence.
LOW_ADHERENCE_MULTIPLIER = 0.9


def planner_model(settings: Any) -> str:
    """The model used for macro plan generation (falls back to the chat model)."""
    return getattr(settings, "openai_model_planner", None) or settings.openai_model


def week_is_resolved(week: Dict[str, Any]) -> bool:
    """Missing `resolved` = resolved (legacy plans are fully materialized)."""
    return week.get("resolved") is not False


def coerce_exercise_numbers(exercises: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Guard against the model writing prose into sets/reps (observed with the
    stronger planner model: reps='8 min at half marathon pace'). Non-int reps
    become reps=1 with the prose preserved in `notes`."""
    cleaned = []
    for ex in exercises or []:
        ex = dict(ex)
        try:
            ex["sets"] = max(1, int(ex.get("sets", 3)))
        except (TypeError, ValueError):
            ex["sets"] = 3
        reps = ex.get("reps", 10)
        if not isinstance(reps, int):
            try:
                ex["reps"] = max(1, int(str(reps).strip()))
            except (TypeError, ValueError):
                prose = str(reps).strip()
                ex["reps"] = 1
                if prose and prose.lower() not in ("none", ""):
                    ex["notes"] = (f"{ex.get('notes', '')} {prose}".strip())
        else:
            ex["reps"] = max(1, reps)
        cleaned.append(ex)
    return cleaned


# ---------------------------------------------------------------------------
# Skeleton normalization
# ---------------------------------------------------------------------------

def normalize_skeleton(raw: Dict[str, Any], weeks_total: int, days_per_week: int) -> Dict[str, Any]:
    """Repair LLM week math instead of failing: clamp phase ranges into
    1..weeks_total, close gaps, synthesize missing weekIntents, ensure deloads
    exist for long plans, coerce blueprint numbers, drop empty blueprints."""
    skeleton = copy.deepcopy(raw or {})

    # --- Phases: clamp, sort, close gaps so every week belongs to a phase ---
    phases = []
    for p in skeleton.get("phases") or []:
        try:
            start = max(1, min(weeks_total, int(p.get("startWeek", 1))))
            end = max(start, min(weeks_total, int(p.get("endWeek", weeks_total))))
        except (TypeError, ValueError):
            continue
        p = dict(p)
        p["startWeek"], p["endWeek"] = start, end
        p["sessionBlueprints"] = [
            {**bp, "exercises": coerce_exercise_numbers(bp.get("exercises"))}
            for bp in (p.get("sessionBlueprints") or [])
            if bp.get("exercises")
        ]
        if p["sessionBlueprints"]:
            phases.append(p)
    phases.sort(key=lambda p: p["startWeek"])
    if not phases:
        return {}
    phases[0]["startWeek"] = 1
    for i in range(1, len(phases)):
        # Close gaps/overlaps: each phase starts right after the previous ends.
        phases[i]["startWeek"] = phases[i - 1]["endWeek"] + 1
        phases[i]["endWeek"] = max(phases[i]["startWeek"], min(weeks_total, phases[i]["endWeek"]))
    phases[-1]["endWeek"] = weeks_total
    phases = [p for p in phases if p["startWeek"] <= weeks_total]
    skeleton["phases"] = phases

    # --- Deload weeks: keep valid ones; insert if a long plan has none ---
    deloads = sorted({
        int(d) for d in (skeleton.get("deloadWeeks") or [])
        if isinstance(d, (int, float)) and 1 <= int(d) <= weeks_total
    })
    if not deloads and tk.expects_deload(weeks_total):
        deloads = [w for w in range(tk.DELOAD_EVERY_WEEKS_MAX, weeks_total + 1, tk.DELOAD_EVERY_WEEKS_MAX)]
    skeleton["deloadWeeks"] = deloads

    # --- Week intents: exactly one per week 1..N ---
    by_week: Dict[int, Dict[str, Any]] = {}
    for wi in skeleton.get("weekIntents") or []:
        try:
            wn = int(wi.get("weekNumber"))
        except (TypeError, ValueError):
            continue
        if 1 <= wn <= weeks_total:
            by_week[wn] = dict(wi)
    intents = []
    for wn in range(1, weeks_total + 1):
        phase = phase_for_week(skeleton, wn) or phases[-1]
        wi = by_week.get(wn, {})
        is_deload = bool(wi.get("deload")) or wn in deloads
        try:
            mult = float(wi.get("volumeMultiplier", 1.0))
        except (TypeError, ValueError):
            mult = 1.0
        if is_deload:
            mult = min(mult, DELOAD_MULTIPLIER)
        intents.append({
            "weekNumber": wn,
            "phase": wi.get("phase") or phase.get("name", ""),
            "focus": wi.get("focus") or phase.get("focus", ""),
            "deload": is_deload,
            "volumeMultiplier": max(0.1, min(2.0, mult)),
        })
    skeleton["weekIntents"] = intents
    skeleton["deloadWeeks"] = sorted({i["weekNumber"] for i in intents if i["deload"]})

    # --- Milestones: clamp weeks, drop malformed ---
    milestones = []
    for m in skeleton.get("milestones") or []:
        try:
            week = int(m.get("week"))
        except (TypeError, ValueError):
            continue
        if 1 <= week <= weeks_total and m.get("title"):
            milestones.append({"week": week, "title": str(m["title"]), "criteria": str(m.get("criteria", ""))})
    skeleton["milestones"] = milestones

    skeleton.setdefault("version", 1)
    return skeleton


def phase_for_week(skeleton: Dict[str, Any], week_number: int) -> Optional[Dict[str, Any]]:
    for p in skeleton.get("phases") or []:
        if p.get("startWeek", 1) <= week_number <= p.get("endWeek", 0):
            return p
    return None


def week_intent(skeleton: Dict[str, Any], week_number: int) -> Dict[str, Any]:
    for wi in skeleton.get("weekIntents") or []:
        if wi.get("weekNumber") == week_number:
            return wi
    return {"weekNumber": week_number, "focus": "", "deload": False, "volumeMultiplier": 1.0}


# ---------------------------------------------------------------------------
# Materialization
# ---------------------------------------------------------------------------

def _assign_blueprints_to_days(
    blueprints: List[Dict[str, Any]], workout_days: List[int]
) -> List[Tuple[int, Dict[str, Any]]]:
    """Map session blueprints onto concrete days. A blueprint whose dayHint is
    one of the workout days claims it; the rest fill remaining days in order."""
    remaining_days = list(workout_days)
    assigned: Dict[int, Dict[str, Any]] = {}
    unplaced: List[Dict[str, Any]] = []
    for bp in blueprints:
        hint = bp.get("dayHint")
        if isinstance(hint, int) and hint in remaining_days:
            assigned[hint] = bp
            remaining_days.remove(hint)
        else:
            unplaced.append(bp)
    for day, bp in zip(remaining_days, unplaced):
        assigned[day] = bp
    return sorted(assigned.items())


def _scaled_sets(ex: Dict[str, Any], multiplier: float) -> List[Dict[str, Any]]:
    """Expand an exercise into distinct set dicts, scaled by the multiplier.
    Timed work carries `time` (seconds) per set so cardio isn't a bare '1x1'.

    Volume scaling by channel: set COUNT scales for rep work, but a single-set
    timed effort (a long run) can't drop below one set — so for timed work the
    DURATION scales instead. Without this, deload/taper weeks would keep
    full-length endurance sessions while strength volume drops."""
    time_s = ex.get("timeSeconds")
    has_time = isinstance(time_s, (int, float)) and time_s > 0
    n = max(1, round(int(ex.get("sets", 3)) * multiplier))
    set_doc: Dict[str, Any] = {"reps": int(ex.get("reps", 10))}
    if has_time:
        scaled_time = int(time_s if multiplier >= 1.0 else max(60, time_s * multiplier))
        set_doc["time"] = scaled_time
    return [dict(set_doc) for _ in range(n)]


def materialize_week(
    skeleton: Dict[str, Any],
    week_number: int,
    workout_days: List[int],
    volume_multiplier: float = 1.0,
    note: str = "",
) -> Optional[Dict[str, Any]]:
    """Build one concrete week from the skeleton. `volume_multiplier` composes
    the week intent's multiplier with any adaptation factor. Returns None if the
    skeleton has no phase covering the week."""
    phase = phase_for_week(skeleton, week_number)
    if not phase:
        return None
    intent = week_intent(skeleton, week_number)
    effective = max(0.1, float(intent.get("volumeMultiplier", 1.0)) * volume_multiplier)
    is_deload = bool(intent.get("deload"))

    workouts = []
    for day, bp in _assign_blueprints_to_days(phase.get("sessionBlueprints") or [], workout_days):
        exercises = []
        notes_lines = []
        for ex in coerce_exercise_numbers(bp.get("exercises") or []):
            exercises.append({
                "exerciseName": ex.get("exerciseName", ""),
                "sets": _scaled_sets(ex, effective),
                **({"notes": ex["notes"]} if ex.get("notes") else {}),
            })
            if ex.get("notes"):
                notes_lines.append(f"{ex.get('exerciseName', 'Exercise')}: {ex['notes']}")
        workouts.append({
            "dayOfWeek": day,
            "workoutType": "custom",
            "notes": "\n".join(notes_lines),
            "customWorkout": {
                "title": bp.get("title", "Workout"),
                "type": bp.get("type", "strength"),
                "durationMinutes": int(bp.get("durationMinutes", 45) or 45),
                "exercises": exercises,
            },
        })

    return {
        "weekNumber": week_number,
        "focus": intent.get("focus") or ("Deload" if is_deload else ""),
        "description": note,
        "deloadWeek": is_deload,
        "restDays": [],
        "workouts": workouts,
        "resolved": True,
        "resolvedAt": datetime.utcnow(),
    }


def build_week_stub(skeleton: Dict[str, Any], week_number: int) -> Dict[str, Any]:
    """Intent-only placeholder for a not-yet-materialized week."""
    intent = week_intent(skeleton, week_number)
    return {
        "weekNumber": week_number,
        "focus": intent.get("focus", ""),
        "description": f"Planned ({intent.get('phase', '')}) — will be finalized from your actual training.",
        "deloadWeek": bool(intent.get("deload")),
        "restDays": [],
        "workouts": [],
        "resolved": False,
    }


def build_plan_weeks_from_skeleton(
    skeleton: Dict[str, Any],
    workout_days: List[int],
    weeks_total: int,
    horizon: int = DEFAULT_HORIZON_WEEKS,
) -> List[Dict[str, Any]]:
    """Materialize weeks 1..horizon, stub the rest. weeks[] always has full length."""
    weeks = []
    for wn in range(1, weeks_total + 1):
        if wn <= horizon:
            week = materialize_week(skeleton, wn, workout_days)
            weeks.append(week if week else build_week_stub(skeleton, wn))
        else:
            weeks.append(build_week_stub(skeleton, wn))
    return weeks


# ---------------------------------------------------------------------------
# Adaptation (Stage 3 rules — constants from training_knowledge only)
# ---------------------------------------------------------------------------

def compute_adaptation(
    adherence: Dict[str, Any],
    has_safety_flags: bool,
    this_intent_mult: float,
    prev_intent_mult: float,
    consecutive_low_weeks: int = 0,
    weeks_since_deload: Optional[int] = None,
) -> Tuple[float, str, bool]:
    """Decide the effective volume multiplier for the week being resolved.

    Returns (effective_multiplier, human_note, converted_to_deload). The note is
    stored on the week so the user sees WHY volume changed.
    """
    pct = adherence.get("adherencePct")
    missed = adherence.get("missed", 0)
    completed = adherence.get("completed", 0)

    # Two rough weeks in a row -> deload, if far enough from the last one.
    if (
        consecutive_low_weeks >= 2
        and (weeks_since_deload is None or weeks_since_deload >= tk.DELOAD_EVERY_WEEKS_MIN)
    ):
        return (
            min(this_intent_mult, DELOAD_MULTIPLIER),
            "Converted to a deload — adherence has been low two weeks running; recover, then rebuild.",
            True,
        )

    if pct is None:
        effective, note = this_intent_mult, ""
    elif pct >= 90:
        # Progress as planned, but cap the ramp vs the previous week.
        capped = min(this_intent_mult, prev_intent_mult * tk.WEEKLY_RAMP_CAP)
        hard_cap = prev_intent_mult * tk.WEEKLY_RAMP_HARD_FLAG
        effective = min(capped, hard_cap)
        note = "" if abs(effective - this_intent_mult) < 1e-9 else \
            "Progression slightly capped to keep the weekly ramp safe."
    elif pct >= 70:
        effective = min(this_intent_mult, prev_intent_mult)
        note = "Held volume this week — adherence was decent but not full; progression resumes when you're back on track." \
            if effective < this_intent_mult else ""
    else:
        effective = prev_intent_mult * LOW_ADHERENCE_MULTIPLIER
        note = (
            f"Reduced volume ~10% — {missed} session(s) were missed recently. "
            "Missed sessions are not stacked on top; we pick up from where you are."
        ) if (missed or completed is not None) else "Reduced volume ~10% after a low-adherence week."

    if has_safety_flags:
        clamped = min(effective, this_intent_mult, 1.0)
        if clamped < effective:
            note = (note + " " if note else "") + "Kept intensity conservative due to your health notes."
        effective = clamped

    return (max(0.1, effective), note, False)


def compute_current_week(
    current_week: int,
    weeks_total: int,
    week_advanced_at: Optional[datetime],
    start_date: Optional[datetime],
    today: datetime,
) -> Tuple[int, Optional[datetime], bool]:
    """Advance currentWeek by AT MOST one week per call, based on elapsed time
    since the last advancement (fallback: startDate). Deliberately incremental —
    recomputing from startDate would skip weeks for plans that were paused
    (pause duration isn't tracked). Returns (week, new_advanced_at, changed)."""
    anchor = week_advanced_at or start_date
    if not anchor or current_week >= weeks_total:
        return current_week, week_advanced_at, False
    if isinstance(anchor, datetime) and anchor.tzinfo is not None:
        anchor = anchor.replace(tzinfo=None)
    if (today - anchor).days >= 7:
        # Anchor moves forward exactly one week (not to `today`) to avoid drift.
        return current_week + 1, anchor + timedelta(days=7), True
    return current_week, week_advanced_at, False
