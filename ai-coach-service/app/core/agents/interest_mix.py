"""
Training-interest vs recent-activity mix for the chat context.

Computes what the athlete actually did in the last N days (logged sessions +
synced tracker activity) against the sports they declared in
profile.sportPreferences, so the sensei can gently suggest revisiting a quiet
interest. Chat-only by design: this is built exclusively from
Orchestrator._build_extra_context.

Data sources (union, deduped):
- completed calendarevents, by sessionDetails.discipline — covers Strava and
  other synced activity, which is mapped to canonical disciplines at sync time
  (backend StravaIntegrationService.mapStravaTypeToDiscipline) and never hits
  sessionlogs
- sessionlogs, by discipline — SKIPPING logs with a calendarEventId, which are
  already represented by their (completed) calendar event
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId

logger = logging.getLogger(__name__)

MIX_WINDOW_DAYS = 21
# Below this much recorded activity in the window we say nothing about mix —
# inactive or brand-new athletes have bigger problems than interest balance.
MIN_ACTIVITIES_FOR_MIX = 3

# Off-vocabulary values that live in old activity data. `endurance` counts
# toward BOTH cardio and running for neglect purposes (either interest is
# served by an endurance session); `other` carries no discipline signal.
ACTIVITY_DISCIPLINE_ALIASES: Dict[str, tuple] = {
    "endurance": ("cardio", "running"),
    "other": (),
}

NUDGE_RULES = (
    "Nudging rules: goals, active plans, injuries and recovery ALWAYS take "
    "priority over interest balance. At most ONE light suggestion to revisit "
    "a quiet interest per conversation, only when it fits naturally (planning "
    "a week, picking today's session). Recorded activity may be incomplete — "
    "ask, don't assert (\"still getting on the wall these days?\" not \"you "
    "haven't climbed\"). Never open with it, never repeat it if the "
    "recent-context summaries show you already mentioned it, never phrase it "
    "as a failure."
)


async def load_recent_discipline_counts(
    db, user_id: str, local_now: datetime, days: int = MIX_WINDOW_DAYS
) -> Dict[str, int]:
    """Raw discipline -> activity count over the window, from both sources."""
    user_oid = ObjectId(user_id)
    # Stored dates are naive UTC; a tz-aware cutoff can't compare against them.
    cutoff = (local_now.replace(tzinfo=None) if local_now.tzinfo else local_now) - timedelta(days=days)
    counts: Dict[str, int] = {}

    cal_rows = await db.calendarevents.aggregate([
        {"$match": {"userId": user_oid, "status": "completed", "date": {"$gte": cutoff}}},
        {"$group": {"_id": "$sessionDetails.discipline", "count": {"$sum": 1}}},
    ]).to_list(length=None)
    log_rows = await db.sessionlogs.aggregate([
        {"$match": {
            "userId": user_oid,
            "startedAt": {"$gte": cutoff},
            # Logs linked to a calendar event are already counted above.
            "calendarEventId": None,
        }},
        {"$group": {"_id": "$discipline", "count": {"$sum": 1}}},
    ]).to_list(length=None)

    for row in cal_rows + log_rows:
        discipline = row.get("_id")
        if not discipline:
            continue
        key = str(discipline).lower()
        counts[key] = counts.get(key, 0) + int(row.get("count", 0))
    return counts


def build_interest_mix_block(
    interests: List[str], counts: Dict[str, int], days: int = MIX_WINDOW_DAYS
) -> Optional[str]:
    """Pure: the prompt block, or None when there's nothing worth saying
    (no declared interests, or too little recorded activity to judge mix)."""
    interests = [i for i in (interests or []) if i]
    if not interests:
        return None
    total = sum(counts.values())
    if total < MIN_ACTIVITIES_FOR_MIX:
        return None

    # Which interests got any volume, counting aliased off-vocab activity
    # (an 'endurance' ride serves both a cardio and a running interest).
    covered = set()
    for raw, count in counts.items():
        if count <= 0:
            continue
        for target in ACTIVITY_DISCIPLINE_ALIASES.get(raw, (raw,)):
            covered.add(target)
    neglected = [i for i in interests if i not in covered]

    mix = ", ".join(f"{d} {c}" for d, c in sorted(counts.items(), key=lambda x: -x[1]))
    lines = [
        f"TRAINING INTERESTS & RECENT MIX (last {days} days, logged + synced activity):",
        f"- Declared interests: {', '.join(interests)}",
        f"- Activity by discipline: {mix}",
    ]
    if neglected:
        lines.append(f"- Interests with little/no recorded volume: {', '.join(neglected)}")
    lines.append(NUDGE_RULES)
    return "\n".join(lines)
