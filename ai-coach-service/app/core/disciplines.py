"""
The single discipline vocabulary for the AI-coach service.

A "discipline" is the SPORT a session belongs to. It used to be spelled out
independently in every place that needed it — the log_session /
get_session_history tool enums, the Today's Pick prompt, the frontend's
discipline colours — and the copies drifted: Today's Pick could suggest a
meditation session that `log_session` had no enum value to log.

DISCIPLINES is the SUPERSET UNION of every vocabulary the system already
produces, so anything that can end up on a session can also be logged and
filtered:

- `log_session` / `get_session_history` tool enums
  (app/core/agents/tool_definitions/session_tools.py)
- the Today's Pick prompt (app/services/daily_pick_service.py)
- Strava's imported activities, which write `discipline` straight into
  sessionlogs (backend/src/services/StravaIntegrationService.js)
- the frontend's discipline colours / imagery
  (frontend/src/styles/designTokens.js, frontend/src/pages/TrainNow.jsx)

Rules:
- ADDITIVE ONLY. Values are persisted on calendarevents.sessionDetails.discipline
  and sessionlogs.discipline (neither is enum-constrained in Mongo), so removing
  or renaming a value orphans real user data.
- Anything added here must also get a colour in the frontend's designTokens.
"""

from typing import Tuple

DISCIPLINES: Tuple[str, ...] = (
    "strength",
    "cardio",
    "hiit",
    "hybrid",
    "recovery",
    "mobility",
    "flexibility",
    "calisthenics",
    "running",
    "cycling",
    "climbing",
    "swimming",
    "walking",
    "yoga",
    "meditation",
)

# Convenience for prompts that list the vocabulary inline.
DISCIPLINES_LIST = ", ".join(DISCIPLINES)
