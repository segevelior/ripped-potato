"""
Skill: delete_calendar_event

Permanently remove ONE event from the user's calendar. This is the tool for
"remove/delete it from my calendar" — distinct from reschedule_session's
skip, which only marks status and leaves the event visible. Two-step confirm
matching delete_session_template: preview first, delete only on confirm=true.
"""

from datetime import datetime, timedelta
from typing import Any, Dict

from bson import ObjectId

from app.core.agents.date_utils import get_user_today, relative_day_label
from app.core.agents.skills.registry import SkillContext, skill


@skill(
    name="delete_calendar_event",
    description=(
        "PERMANENTLY DELETE one event from the user's calendar — the event is gone "
        "afterwards. Use when the user says remove/delete/take it off the calendar. "
        "Do NOT use reschedule_session with action='skip' for removal — skip only "
        "marks status and the event stays visible. Previews first; deletes only when "
        "called again with confirm=true after the user confirms. The linked workout "
        "template (if any) stays in the user's library."
    ),
    parameters={
        "type": "object",
        "properties": {
            "event_id": {
                "type": "string",
                "description": "The calendar event to delete — take the id from a get_calendar_events result in this conversation, never guess it.",
            },
            "confirm": {
                "type": "boolean",
                "description": "Actually delete. Default false = preview only. Set true ONLY after the user confirms the preview.",
            },
        },
        "required": ["event_id"],
    },
)
async def delete_calendar_event(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    event_id = args.get("event_id")
    if not event_id:
        return {"success": False, "message": "event_id is required."}
    try:
        event_oid = ObjectId(event_id)
        user_oid = ObjectId(user_id)
    except Exception:
        return {
            "success": False,
            "error": "invalid_event_id",
            "message": (
                "Invalid event_id. Take the id from a get_calendar_events result "
                "in this conversation — never guess it."
            ),
        }

    event = await ctx.db.calendarevents.find_one({"_id": event_oid, "userId": user_oid})
    if not event:
        return {"success": False, "message": "I couldn't find that event on your calendar."}

    today, _ = await get_user_today(ctx.db, user_id)
    event_date = event.get("date")
    date_str = event_date.strftime("%A, %B %d") if isinstance(event_date, datetime) else ""
    title = event.get("title", "event")

    if not args.get("confirm", False):
        plan_warning = ""
        if event.get("planId"):
            plan_warning = (
                " Note: this session belongs to a training plan — deleting removes it "
                "from the calendar only, the plan itself is unchanged."
            )
        if event.get("externalActivityId"):
            plan_warning += (
                " Note: this event is linked to a synced tracker activity — the "
                "activity record itself is kept and won't be re-matched."
            )
        return {
            "success": True,
            "needs_confirmation": True,
            "would_delete": {
                "id": str(event["_id"]),
                "title": title,
                "date": event_date.strftime("%Y-%m-%d") if isinstance(event_date, datetime) else "",
                "relativeDay": relative_day_label(event_date.date(), today.date())
                if isinstance(event_date, datetime) else "",
                "type": event.get("type", ""),
                "status": event.get("status", ""),
            },
            "message": (
                f"This will permanently remove **{title}** ({date_str}) from the "
                f"calendar.{plan_warning} Ask the user to confirm; if they do, call "
                f"delete_calendar_event again with the same event_id plus confirm=true. "
                f"If they decline, do NOT call this tool again."
            ),
        }

    result = await ctx.db.calendarevents.delete_one({"_id": event_oid, "userId": user_oid})
    if result.deleted_count != 1:
        return {"success": False, "message": "The event could not be deleted — it may already be gone."}

    # Deleting a Strava-linked event is a match correction (mirrors the
    # backend controller's handleLinkedEventDeletion): pin the activity
    # 'separate' so the nightly consistency job can never resurrect this
    # deletion as an auto-merge into another event. Direct writes here are
    # the skill's existing (pre-§8) pattern; migrating this whole skill to
    # the backend internal API is the tracked follow-up.
    if event.get("externalActivityId"):
        activity = await ctx.db.externalactivities.find_one(
            {"_id": event["externalActivityId"], "userId": user_oid}
        )
        if activity:
            await ctx.db.externalactivities.update_one(
                {"_id": activity["_id"]},
                {"$set": {"matchStatus": "separate"}, "$unset": {"matchedEventId": ""}},
            )
            await ctx.db.activitymatchaudits.insert_one({
                "userId": user_oid,
                "activityId": activity["_id"],
                "eventId": event_oid,
                "action": "coach_event_delete",
                "actor": "coach",
                "previous": {
                    "matchStatus": activity.get("matchStatus"),
                    "matchedEventId": activity.get("matchedEventId"),
                },
                "expiresAt": datetime.utcnow() + timedelta(days=180),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            })

    return {
        "success": True,
        "deleted": 1,
        "event_id": str(event_oid),
        "message": (
            f"Deleted **{title}** from your calendar. It's gone "
            f"(the workout template, if any, is still in your library)."
        ),
    }
