"""
Calendar tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List

from app.core.disciplines import DISCIPLINES


def get_calendar_tools() -> List[Dict[str, Any]]:
    """Return calendar-related tool definitions"""
    return [
        # ==================== CALENDAR TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "schedule_to_calendar",
                "description": "Schedule a session or event to the user's calendar for a specific date. A session is ANY training activity — a gym workout, a climbing session, a ride, a run, a mobility block — and they are all scheduled with this tool. A calendar event only combines a session with a date — it never carries its own exercise list. For 'session' and 'deload' events, EITHER pass session_template_id for an existing library session (find it with list_session_templates / grep_session_templates — ALWAYS prefer this; it links the event without creating anything new), OR plan a brand-new session and pass sessionDetails.exercises (this creates a new library session and links it). Reuse-first is enforced in code: if the passed sessionDetails exactly match an existing library session, the tool LINKS that session instead of creating a duplicate — the preview and result say which happened; report that accurately. Never schedule a bare title. Refuses to double-book: if an equivalent event already exists on that date it returns already_scheduled instead of writing. Defaults to a dry-run PREVIEW that writes nothing. Present the preview to the user; ONLY after they confirm, call again with the same arguments plus dry_run=false to actually write. If the user declines the preview, do NOT call again.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": {
                            "type": "string",
                            "description": "Date in ISO format (YYYY-MM-DD). Use 'today' or 'tomorrow' for relative dates (resolved in the user's timezone)."
                        },
                        "title": {
                            "type": "string",
                            "description": "Title for the calendar event (e.g., 'Upper Body Strength', 'Active Recovery', 'Rest Day'). When linking a library session via session_template_id, omit to default to the session's name."
                        },
                        "type": {
                            "type": "string",
                            "enum": ["session", "rest", "deload", "event"],
                            "description": "Type of calendar event"
                        },
                        "session_template_id": {
                            "type": "string",
                            "description": "ID of an existing library session to schedule (take it from a list_session_templates / grep_session_templates result in THIS conversation — never invent one). ALWAYS pass this instead of sessionDetails when the session already exists — do NOT resend its exercises."
                        },
                        "allow_duplicate": {
                            "type": "boolean",
                            "description": "Default false: if a same-titled or same-template event already exists on the target date the tool refuses with already_scheduled. Set true ONLY if the user explicitly wants a second session of the same kind that day."
                        },
                        "sessionDetails": {
                            "type": "object",
                            "description": "Details for a NEWLY designed session (any discipline) — creates a new library session, UNLESS the exercises exactly match an existing one, in which case that session is linked instead (no duplicate). For an outdoor session (ride, run, climb), pass ONE exercise named after the activity itself with the distance/time as its volume. For 'session'/'deload' events, required only when session_template_id is not given.",
                            "properties": {
                                "discipline": {
                                    "type": "string",
                                    "enum": list(DISCIPLINES),
                                    "description": "Discipline of the session — use the actual sport (a ride is 'cycling', a climb is 'climbing')"
                                },
                                "estimatedDuration": {
                                    "type": "integer",
                                    "description": "Estimated duration in minutes"
                                },
                                "exercises": {
                                    "type": "array",
                                    "description": "Exercises for this session",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "exerciseName": {"type": "string"},
                                            "targetSets": {"type": "integer"},
                                            "targetReps": {"type": "integer"},
                                            "notes": {"type": "string"},
                                            "muscles": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "description": "Primary muscle groups — ALWAYS include; classifies the exercise correctly if it's new to the catalog."
                                            },
                                            "equipment": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "description": "Equipment needed (empty for bodyweight)."
                                            }
                                        },
                                        "required": ["exerciseName"]
                                    }
                                }
                            }
                        },
                        "notes": {
                            "type": "string",
                            "description": "Additional notes for the calendar event"
                        },
                        "dry_run": {
                            "type": "boolean",
                            "description": "Preview only, no writes. Default true. Set false ONLY after the user has confirmed the preview."
                        }
                    },
                    "required": ["date", "title", "type"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_calendar_events",
                "description": "Get the user's scheduled calendar events for a date range. Use this to check what sessions are already planned. The result echoes `today` (the user's local date) and labels every event with `relativeDay` (today/tomorrow/yesterday/in N days) — trust those labels.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "startDate": {
                            "type": "string",
                            "description": "Start date in ISO format (YYYY-MM-DD). Default: yesterday (user-local), so recently missed sessions are included"
                        },
                        "endDate": {
                            "type": "string",
                            "description": "End date in ISO format (YYYY-MM-DD). Default: 7 days from today"
                        },
                        "type": {
                            "type": "string",
                            "enum": ["session", "rest", "deload", "event"],
                            "description": "Filter by event type"
                        }
                    }
                }
            }
        },
    ]
