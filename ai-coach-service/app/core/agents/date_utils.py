"""
Date helpers for user-local "today" resolution and relative-day labeling.

Calendar events are stored at midnight UTC representing a calendar day, so a
naive midnight datetime of the user's LOCAL calendar day can be compared and
queried against stored dates directly. What must be timezone-aware is only the
resolution of "today" into that calendar day.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from bson import ObjectId
import structlog

logger = structlog.get_logger()


async def get_user_today(db, user_id: str, now: datetime | None = None) -> tuple[datetime, str]:
    """Resolve the user's local calendar day -> (naive midnight datetime, timezone name).

    Looks up users.settings.timezone; falls back to UTC on missing/invalid
    timezone or lookup error. `now` is injectable for tests (aware or naive UTC).
    """
    timezone = "UTC"
    try:
        user = await db.users.find_one(
            {"_id": ObjectId(user_id)},
            {"settings.timezone": 1}
        )
        timezone = ((user or {}).get("settings") or {}).get("timezone") or "UTC"
    except Exception as e:
        logger.error(f"Error fetching timezone for {user_id}: {e}")

    try:
        tz = ZoneInfo(timezone)
    except Exception:
        tz = ZoneInfo("UTC")
        timezone = "UTC"

    if now is None:
        local_now = datetime.now(tz)
    elif now.tzinfo is None:
        local_now = now.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
    else:
        local_now = now.astimezone(tz)

    return datetime(local_now.year, local_now.month, local_now.day), timezone


def relative_day_label(target: date, today: date) -> str:
    """Label a calendar day relative to today: 'today', 'tomorrow', 'yesterday',
    'in N days', 'N days ago'."""
    delta = (target - today).days
    if delta == 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    if delta == -1:
        return "yesterday"
    if delta > 0:
        return f"in {delta} days"
    return f"{-delta} days ago"
