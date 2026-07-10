"""
Skill: reschedule_session

Handle a single missed or moved calendar session: skip it, shift it to a new
date, or auto-decide. Dry-run by default with conversational confirm, matching
the other write skills.

`resolve_reschedule` is a pure decision helper (unit-tested); the handler loads
the event and applies the resolved operation.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from bson import ObjectId

from app.core.agents.skills.registry import SkillContext, skill
from app.core.agents.skills.schedule_plan_skill import _parse_start_date, _midnight


def resolve_reschedule(
    event_date: Optional[datetime],
    action: str,
    new_date: Optional[datetime],
    today: datetime,
) -> Dict[str, Any]:
    """Pure: decide the operation. Returns {op: 'skip'|'shift', to_date?}."""
    action = (action or "auto").lower()
    if action == "skip":
        return {"op": "skip"}
    if action == "shift":
        return {"op": "shift", "to_date": new_date or (today + timedelta(days=1))}
    # auto / compress: prefer an explicit date, else move a missed session to
    # tomorrow, else (a future session with no target) just skip it.
    if new_date:
        return {"op": "shift", "to_date": new_date}
    if event_date and event_date.date() < today.date():
        return {"op": "shift", "to_date": today + timedelta(days=1)}
    return {"op": "skip"}


@skill(
    name="reschedule_session",
    description=(
        "Reschedule ONE calendar session the user missed or wants to move: skip it, shift "
        "it to another date, or let me auto-decide. Previews the change first; only writes "
        "after the user confirms (dry_run=false)."
    ),
    parameters={
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "The calendar event to reschedule."},
            "action": {"type": "string", "enum": ["skip", "shift", "auto"], "description": "Default 'auto'."},
            "new_date": {"type": "string", "description": "Target date for a shift (ISO / 'today' / 'tomorrow')."},
            "dry_run": {"type": "boolean", "description": "Preview only. Default true; set false to apply."},
        },
        "required": ["event_id"],
    },
)
async def reschedule_session(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
        return {"success": False, "message": "I couldn't find that session on your calendar."}

    today = _midnight(datetime.utcnow())
    res = resolve_reschedule(event.get("date"), args.get("action", "auto"), _parse_start_date(args.get("new_date")), today)
    dry_run = args.get("dry_run", True)
    title = event.get("title", "session")

    if res["op"] == "skip":
        summary = f"Mark **{title}** as skipped."
    else:
        summary = f"Move **{title}** to **{res['to_date'].strftime('%A, %B %d')}**."

    if dry_run:
        return {"success": True, "dry_run": True, "op": res["op"], "message": f"{summary}\n\nConfirm?"}

    now = datetime.utcnow()
    if res["op"] == "skip":
        await ctx.db.calendarevents.update_one(
            {"_id": event_oid, "userId": user_oid},
            {"$set": {"status": "skipped", "updatedAt": now}},
        )
        return {"success": True, "dry_run": False, "op": "skip", "message": f"Marked **{title}** as skipped."}

    await ctx.db.calendarevents.update_one(
        {"_id": event_oid, "userId": user_oid},
        {"$set": {"date": res["to_date"], "status": "scheduled", "updatedAt": now}},
    )
    return {
        "success": True,
        "dry_run": False,
        "op": "shift",
        "to_date": res["to_date"].strftime("%Y-%m-%d"),
        "message": f"Moved **{title}** to **{res['to_date'].strftime('%A, %B %d')}**.",
    }
