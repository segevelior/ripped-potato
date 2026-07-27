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

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.core.disciplines import DISCIPLINES, DISCIPLINES_LIST

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

# Shared (cross-user) cache of custom-sport -> canonical-discipline mappings,
# so "triathlon" is LLM-resolved once, ever. Owned by the coach service.
RESOLUTION_COLLECTION = "sportinterestresolutions"

RESOLVE_PROMPT = (
    "Athletes name sports in their own words. For each sport below, list which "
    "of these training disciplines an activity log would fall under when "
    f"training for it: {DISCIPLINES_LIST}.\n"
    "Examples: triathlon -> running, cycling, swimming; ninja -> calisthenics, "
    "climbing. Use 1-3 disciplines; use an empty list if none fit.\n"
    'Return ONLY JSON: {"mappings": [{"label": "<sport verbatim>", '
    '"disciplines": ["running"]}]}.'
)


async def resolve_interest_disciplines(
    db, llm_client, settings, interests: List[str]
) -> Dict[str, Tuple[str, ...]]:
    """label -> canonical disciplines whose recorded activity serves that
    interest. Canonical labels map to themselves; custom labels ("triathlon")
    resolve through the shared cache, with one batched fast-model call for
    misses. Unmappable labels map to () — the mix must then treat them as
    unmeasurable, never as neglected. Failures resolve to () uncached."""
    out: Dict[str, Tuple[str, ...]] = {}
    unresolved = []
    for label in interests:
        key = (label or "").strip().lower()
        if not key:
            continue
        if key in DISCIPLINES:
            out[label] = (key,)
        else:
            unresolved.append((label, key))

    if not unresolved:
        return out

    cached = {
        doc["label"]: doc
        async for doc in db[RESOLUTION_COLLECTION].find(
            {"label": {"$in": [key for _, key in unresolved]}}
        )
    }
    misses = []
    for label, key in unresolved:
        if key in cached:
            out[label] = tuple(cached[key].get("disciplines", []))
        else:
            misses.append((label, key))
    if not misses:
        return out

    try:
        prompt = (
            "SPORTS:\n" + "\n".join(f"- {key}" for _, key in misses)
            + f"\n\n{RESOLVE_PROMPT}"
        )
        response = await llm_client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=500,
            response_format={"type": "json_object"},
            **settings.llm_tuning_params(temperature=0.1),
        )
        raw = (response.choices[0].message.content or "").strip()
        mapped = {
            str(m.get("label", "")).strip().lower():
                tuple(d for d in (m.get("disciplines") or []) if d in DISCIPLINES)[:3]
            for m in json.loads(raw).get("mappings", [])
        }
        for label, key in misses:
            disciplines = mapped.get(key)
            if disciplines is None:
                out[label] = ()
                continue  # model skipped it — don't cache, retry next time
            out[label] = disciplines
            await db[RESOLUTION_COLLECTION].update_one(
                {"label": key},
                {"$setOnInsert": {
                    "label": key,
                    "disciplines": list(disciplines),
                    "source": "llm",
                    "createdAt": datetime.utcnow(),
                }},
                upsert=True,
            )
    except Exception as e:
        logger.error(f"Interest resolution failed ({[k for _, k in misses]}): {e}")
        for label, _ in misses:
            out.setdefault(label, ())
    return out


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
    interests: List[str],
    counts: Dict[str, int],
    days: int = MIX_WINDOW_DAYS,
    resolutions: Optional[Dict[str, Tuple[str, ...]]] = None,
) -> Optional[str]:
    """Pure: the prompt block, or None when there's nothing worth saying
    (no declared interests, or too little recorded activity to judge mix).

    `resolutions` maps each interest label to the canonical disciplines whose
    activity serves it (see resolve_interest_disciplines). Without an entry, a
    canonical label maps to itself and a custom label is UNMEASURABLE — listed
    as declared but never called neglected (a false "you haven't done X" is
    the one failure this feature must not have)."""
    interests = [i for i in (interests or []) if i]
    if not interests:
        return None
    total = sum(counts.values())
    if total < MIN_ACTIVITIES_FOR_MIX:
        return None
    resolutions = resolutions or {}

    # Which disciplines got any volume, counting aliased off-vocab activity
    # (an 'endurance' ride serves both a cardio and a running interest).
    covered = set()
    for raw, count in counts.items():
        if count <= 0:
            continue
        for target in ACTIVITY_DISCIPLINE_ALIASES.get(raw, (raw,)):
            covered.add(target)

    neglected, mappings_shown = [], []
    for interest in interests:
        key = interest.strip().lower()
        mapped = resolutions.get(interest, (key,) if key in DISCIPLINES else ())
        if not mapped:
            continue  # unmeasurable custom sport — never call it neglected
        if key not in DISCIPLINES and set(mapped) != {key}:
            mappings_shown.append(f"{interest} counts activity from {', '.join(mapped)}")
        if not any(d in covered for d in mapped):
            neglected.append(interest)

    mix = ", ".join(f"{d} {c}" for d, c in sorted(counts.items(), key=lambda x: -x[1]))
    lines = [
        f"TRAINING INTERESTS & RECENT MIX (last {days} days, logged + synced activity):",
        f"- Declared interests: {', '.join(interests)}",
        f"- Activity by discipline: {mix}",
    ]
    if mappings_shown:
        lines.append(f"- Custom sport mapping: {'; '.join(mappings_shown)}")
    if neglected:
        lines.append(f"- Interests with little/no recorded volume: {', '.join(neglected)}")
    lines.append(NUDGE_RULES)
    return "\n".join(lines)
