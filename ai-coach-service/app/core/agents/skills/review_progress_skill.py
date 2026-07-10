"""
Skill: review_progress

Report training adherence and progress toward a goal. Adherence is DERIVED from
calendar events (completed / (completed + skipped + missed)), because
Plan.progress.adherencePercentage is known-stale (not updated by calendar
completion). "Missed" = a workout/deload event whose date has passed but is still
`scheduled`.

`compute_adherence` is pure and unit-tested; the handler fetches events and adds
a recommendation the orchestrator can frame conversationally.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill

# Only these event types count toward training adherence (rest days don't).
_TRAINING_TYPES = {"workout", "deload"}
_ON_TRACK_THRESHOLD = 0.70


def compute_adherence(events: List[Dict[str, Any]], today: datetime) -> Dict[str, Any]:
    """Pure: derive adherence counts from calendar events.

    completed / (completed + skipped + missed). Future 'scheduled' events are not
    yet due and don't count against the user.
    """
    completed = skipped = missed = upcoming = 0
    for e in events:
        if e.get("type") not in _TRAINING_TYPES:
            continue
        status = e.get("status")
        if status == "completed":
            completed += 1
        elif status == "skipped":
            skipped += 1
        elif status == "scheduled":
            date = e.get("date")
            if date and date.date() < today.date():
                missed += 1
            else:
                upcoming += 1

    due = completed + skipped + missed
    adherence_pct = round(100 * completed / due) if due else None
    return {
        "completed": completed,
        "skipped": skipped,
        "missed": missed,
        "upcoming": upcoming,
        "due": due,
        "adherencePct": adherence_pct,
    }


def _recommendation(a: Dict[str, Any]) -> str:
    pct = a["adherencePct"]
    if pct is None:
        return "No sessions were due in this window yet — schedule some and check back."
    if pct >= 90:
        return "Great consistency — consider progressing volume or intensity in the next block."
    if pct >= _ON_TRACK_THRESHOLD * 100:
        return "Solid adherence. Keep the current plan; small progression is warranted."
    if a["missed"] >= a["completed"]:
        return "A lot of sessions are slipping — consider reducing frequency or rescheduling to fit your week."
    return "Adherence is a bit low; let's look at what's getting in the way and adjust the plan."


@skill(
    name="review_progress",
    description=(
        "Review the user's training adherence (and progress toward a goal) over a recent "
        "window, computed from their calendar. Use for 'how am I doing?' / progress check-ins. "
        "Read-only."
    ),
    parameters={
        "type": "object",
        "properties": {
            "goal_id": {"type": "string", "description": "Optional goal to frame progress around."},
            "window_days": {"type": "integer", "description": "Look-back window in days (default 28).", "minimum": 1},
        },
    },
)
async def review_progress(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "message": "Invalid user."}

    window_days = int(args.get("window_days") or 28)
    now = datetime.utcnow()
    start = now - timedelta(days=window_days)

    events = await ctx.db.calendarevents.find({
        "userId": user_oid,
        "date": {"$gte": start, "$lte": now},
        "status": {"$ne": "cancelled"},
    }).to_list(None)

    adherence = compute_adherence(events, now)
    on_track = adherence["adherencePct"] is not None and adherence["adherencePct"] >= _ON_TRACK_THRESHOLD * 100

    goal_name = None
    if args.get("goal_id"):
        try:
            goal = await ctx.db.goals.find_one({"_id": ObjectId(args["goal_id"]), "userId": user_oid}, {"name": 1})
            goal_name = (goal or {}).get("name")
        except Exception:
            goal_name = None

    recommendation = _recommendation(adherence)
    if adherence["adherencePct"] is None:
        msg = f"No training sessions were due in the last {window_days} days."
    else:
        header = f"Over the last {window_days} days" + (f" toward **{goal_name}**" if goal_name else "")
        msg = (
            f"{header}: **{adherence['adherencePct']}%** adherence "
            f"({adherence['completed']} done, {adherence['skipped']} skipped, {adherence['missed']} missed; "
            f"{adherence['upcoming']} upcoming).\n\n{recommendation}"
        )

    return {
        "success": True,
        "goal": goal_name,
        "window_days": window_days,
        "onTrack": on_track,
        "adherencePct": adherence["adherencePct"],
        "counts": adherence,
        "recommendation": recommendation,
        "message": msg,
    }
