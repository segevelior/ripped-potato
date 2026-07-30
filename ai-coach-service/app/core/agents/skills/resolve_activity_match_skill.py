"""
Skill: resolve_activity_match

Resolve whether a synced tracker activity (Strava) IS a planned calendar
session. The sync auto-merges unambiguous matches; ambiguous ones are flagged
matchStatus='pending' and surfaced in the calendar-anchors context — this is
the tool the coach uses after asking the user ("Endurance 1 was scheduled and
Strava shows a run — same session?").

Two-step confirm matching delete_calendar_event: preview first, write only on
confirm=true. The write goes through the backend's internal API
(/internal/v1/activity-match/resolve) — never a direct Mongo write; reads for
the preview stay local. Backend refusals ({"reason": ...}) are relayed
verbatim: stored candidate lists go stale, the backend re-validates.
"""

from typing import Any, Dict

from bson import ObjectId

from app.clients.backend_client import resolve_activity_match as backend_resolve
from app.core.agents.skills.registry import SkillContext, skill

_RESOLUTIONS = ("merge", "separate", "unmerge")


@skill(
    name="resolve_activity_match",
    description=(
        "Resolve whether a synced tracker activity (Strava) IS one of the user's "
        "planned calendar sessions. resolution='merge' + event_id marks that planned "
        "session completed by the activity (use when the user confirms they're the "
        "same); 'separate' records that a pending activity was a different workout — "
        "it keeps its own calendar entry and is never re-matched; 'unmerge' undoes a "
        "wrong automatic merge. Take activity_id from the UNRESOLVED STRAVA MATCHES "
        "context or an external-activities read, event_id from get_calendar_events — "
        "never guess ids. Previews first; writes only when called again with "
        "confirm=true after the user confirms."
    ),
    parameters={
        "type": "object",
        "properties": {
            "activity_id": {
                "type": "string",
                "description": "The external activity to resolve — from the UNRESOLVED STRAVA MATCHES context block, never guessed.",
            },
            "resolution": {
                "type": "string",
                "enum": ["merge", "separate", "unmerge"],
                "description": "merge = activity IS the planned session (needs event_id); separate = different workout, keep both; unmerge = undo a wrong auto-merge.",
            },
            "event_id": {
                "type": "string",
                "description": "Required for resolution='merge': the planned calendar event the activity fulfilled — from a get_calendar_events result.",
            },
            "confirm": {
                "type": "boolean",
                "description": "Actually write. Default false = preview only. Set true ONLY after the user confirms.",
            },
        },
        "required": ["activity_id", "resolution"],
    },
)
async def resolve_activity_match(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    activity_id = args.get("activity_id")
    resolution = args.get("resolution")
    event_id = args.get("event_id")

    if resolution not in _RESOLUTIONS:
        return {
            "success": False,
            "error": "invalid_resolution",
            "message": "resolution must be one of merge / separate / unmerge.",
        }
    try:
        user_oid = ObjectId(user_id)
    except Exception:
        return {"success": False, "error": "invalid_user", "message": "Internal error: bad user id."}
    try:
        activity_oid = ObjectId(activity_id)
    except Exception:
        return {
            "success": False,
            "error": "invalid_activity_id",
            "message": (
                "Invalid activity_id. Take it from the UNRESOLVED STRAVA MATCHES "
                "context or an external-activities read — never guess it."
            ),
        }

    activity = await ctx.db.externalactivities.find_one({"_id": activity_oid, "userId": user_oid})
    if not activity:
        return {"success": False, "message": "I couldn't find that synced activity."}

    # Check actual match state up front so the PREVIEW is honest — never show
    # a confident "this will un-merge…" for an activity that isn't merged and
    # only find out after the user confirmed.
    linked = await ctx.db.calendarevents.find_one(
        {"userId": user_oid, "externalActivityId": activity_oid}
    )
    linked_merged = bool(
        linked and (linked.get("sessionDetails") or {}).get("source") == "strava-matched"
    )
    if resolution == "merge" and linked_merged:
        return {
            "success": False,
            "error": "already_merged",
            "message": (
                f"That activity is already merged into \"{linked.get('title', '')}\". "
                f"Un-merge it first if the user wants it matched elsewhere."
            ),
        }
    if resolution == "unmerge" and not linked_merged and not activity.get("matchedEventId"):
        return {
            "success": False,
            "error": "not_merged",
            "message": "That activity isn't merged into any planned session — nothing to un-merge.",
        }
    if resolution == "separate" and linked_merged:
        return {
            "success": False,
            "error": "is_merged_use_unmerge",
            "message": (
                f"That activity is merged into \"{linked.get('title', '')}\" — use "
                f"resolution='unmerge' to undo that instead."
            ),
        }

    activity_label = (
        f"{activity.get('sportType', 'activity')} \"{activity.get('name', 'activity')}\""
    )
    start = activity.get("startDate")
    date_str = start.strftime("%A, %B %d") if start else ""

    event = None
    if resolution == "merge":
        try:
            # ObjectId(None) fabricates a fresh id — guard explicitly.
            if not event_id:
                raise ValueError("event_id required")
            event_oid = ObjectId(event_id)
        except Exception:
            return {
                "success": False,
                "error": "invalid_event_id",
                "message": "resolution='merge' needs an event_id from a get_calendar_events result.",
            }
        event = await ctx.db.calendarevents.find_one({"_id": event_oid, "userId": user_oid})
        if not event:
            return {"success": False, "message": "I couldn't find that calendar event."}

    if not args.get("confirm", False):
        previews = {
            "merge": (
                f"This will mark **{event.get('title') if event else ''}** as completed by the "
                f"{activity_label} from {date_str}, and remove the activity's separate calendar entry."
            ),
            "separate": (
                f"This records that the {activity_label} from {date_str} was a DIFFERENT workout "
                f"from anything planned — it keeps its own calendar entry and won't be matched again."
            ),
            "unmerge": (
                f"This will un-merge the {activity_label} from the planned session it was matched to: "
                f"the planned session goes back to scheduled and the activity gets its own calendar entry."
            ),
        }
        return {
            "success": True,
            "needs_confirmation": True,
            "would_resolve": {
                "activity_id": str(activity_oid),
                "activity": activity_label,
                "date": start.strftime("%Y-%m-%d") if start else "",
                "resolution": resolution,
                "event_id": str(event["_id"]) if event else None,
                "event_title": event.get("title") if event else None,
            },
            "message": (
                f"{previews[resolution]} Ask the user to confirm; if they do, call "
                f"resolve_activity_match again with the same arguments plus confirm=true. "
                f"If they decline, do NOT call this tool again."
            ),
        }

    result = await backend_resolve(
        user_id=user_id,
        activity_id=str(activity_oid),
        resolution=resolution,
        event_id=str(event["_id"]) if event else None,
    )
    if not result.get("success"):
        reason = result.get("reason", "unknown")
        return {
            "success": False,
            "error": reason,
            "message": result.get(
                "message",
                f"The backend refused the resolution ({reason}) — nothing was changed. "
                f"Re-read the calendar before retrying.",
            ),
        }

    messages = {
        "merge": (
            f"Done — **{result.get('eventTitle') or (event.get('title') if event else 'the planned session')}** "
            f"is marked completed by the {activity_label}."
        ),
        "separate": f"Got it — the {activity_label} stays as its own workout and won't be matched again.",
        "unmerge": f"Un-merged — the planned session is back on the schedule and the {activity_label} has its own entry.",
    }
    return {"success": True, "resolution": resolution, "message": messages[resolution]}
