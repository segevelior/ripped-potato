"""
Session tool definitions for the AI fitness coach
"""

from typing import Dict, Any, List

from app.core.disciplines import DISCIPLINES


def get_session_tools() -> List[Dict[str, Any]]:
    """Return session-related tool definitions"""
    return [
        # ==================== SESSION TEMPLATE TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "create_session_template",
                "description": (
                    "Create a reusable SESSION template. A session is ANY training activity — a gym workout, a "
                    "climbing session, a bike ride, a run, a mobility block — and this is what appears under the "
                    "user's 'Sessions' tab (their session library). Use it whenever the user wants to add or save a "
                    "whole session, including one they upload as an image/screenshot or paste as a list. Do NOT use "
                    "add_exercise for a whole session. "
                    "Sessions are organized into blocks (Warm-up, Main Work, Finisher, etc.). Refer to exercises by "
                    "NAME only — ids are resolved server-side against the exercise catalog (close name matches are "
                    "reused; genuinely new names are auto-created, classified from the muscles/discipline you pass). "
                    "If a name is ambiguous the tool returns candidate matches: ask the user which they meant, then "
                    "call again with the chosen exact name — or, if the user wants it as a new exercise, call "
                    "add_exercise for it first and then retry (never repeat the identical call). If a template with "
                    "the same name already exists the tool refuses and returns its id — reuse that template (schedule "
                    "it with schedule_to_calendar + session_template_id) instead of creating a copy. "
                    "NON-GYM / OUTDOOR SESSIONS (rides, runs, climbs, swims, hikes): they use the SAME shape — "
                    "exercises[] can never be empty, so express the activity itself as one entry. The minimal VALID "
                    "shape is exactly one block with one exercise: "
                    "blocks=[{name:'Main Work', type:'duration', duration_seconds:3600, "
                    "exercises:[{exercise_name:'Outdoor Cycling', volume:'60km', "
                    "rest:'none', notes:'Rolling terrain, steady zone 2', muscles:['Legs'], discipline:['cycling']}]}] "
                    "— the exercise_name IS the activity ('Outdoor Cycling', 'Trail Run', 'Sport Climbing', "
                    "'Bouldering', 'Open Water Swim'), `volume` carries the dose (distance, time, number of routes: "
                    "'60km', '90min', '8 routes'), and `notes` carries the free-form detail (route, grades, terrain, "
                    "intensity). Set primary_disciplines to the sport (e.g. ['cycling'], ['climbing']). Add more "
                    "blocks only when the session really has them (e.g. 'Warm-up' easy spinning, 'Main Work' "
                    "intervals). Every block must contain at least one exercise — an empty/placeholder template is "
                    "rejected by the server, so never send one. "
                    "STRUCTURED BLOCKS: when the session has real structure, say so with the block-level `type` "
                    "field instead of encoding it in the block name — tabata (type:'tabata', rounds:8, "
                    "work_seconds:20, rest_seconds:10), interval repeats (type:'interval', rounds:8, "
                    "rest_seconds:90, exercise volume '400m @ 5k pace'), circuits (type:'circuit', rounds:3, "
                    "rest_seconds:60), AMRAP/EMOM caps via duration_seconds, and continuous efforts (tempo run, "
                    "endurance ride, ARC climbing) as type:'duration' with duration_seconds. Plain sets x reps "
                    "blocks need no type."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Session template name (e.g., 'Upper Body Push Day', 'Saturday Long Ride', 'Evening Bouldering')"
                        },
                        "goal": {
                            "type": "string",
                            "description": "Primary goal of the session (e.g., 'Build upper body pushing strength', 'Zone 2 aerobic base', 'Volume on slab routes')"
                        },
                        "primary_disciplines": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "The sport(s) this session is (e.g., ['Calisthenics', 'Strength Training'], ['cycling'], ['climbing'], ['running']). Always set it for non-gym sessions."
                        },
                        "estimated_duration": {
                            "type": "integer",
                            "description": "Estimated duration in minutes"
                        },
                        "difficulty_level": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"],
                            "description": "Overall difficulty level"
                        },
                        "confirm_duplicate": {
                            "type": "boolean",
                            "description": "Set true ONLY when the user has explicitly confirmed they want a second template with a name that already exists. Default false — the tool rejects duplicate names and points at the existing template."
                        },
                        "blocks": {
                            "type": "array",
                            "minItems": 1,
                            "description": "Session blocks (sections) containing exercises. One block is enough for an outdoor/endurance session.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "description": "Block name (e.g., 'Warm-up', 'Main Work', 'Finisher', 'Cool-down')"
                                    },
                                    "type": {
                                        "type": "string",
                                        "enum": ["straight_sets", "circuit", "tabata", "amrap", "emom", "interval", "duration"],
                                        "description": "Block structure. straight_sets (default): classic sets x reps. circuit/interval: exercise list repeats `rounds` times with `rest_seconds` between. tabata: `rounds` x `work_seconds` on / `rest_seconds` off (convention 8x20/10). amrap: as many rounds as possible in `duration_seconds`. emom: `rounds` minute-slots of `work_seconds` work — EVERY exercise in the block performs `rounds` slots, so an emom block must contain EXACTLY ONE exercise (an alternating EMOM is one block per movement, e.g. odd minutes = block A rounds:5, even minutes = block B rounds:5 — never one 10-round block with 2 exercises, which would double the work). duration: one continuous effort of `duration_seconds` (tempo run, endurance ride, ARC climb)."
                                    },
                                    "rounds": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "description": "How many times the block repeats (circuit/tabata/interval rounds, emom minutes). Omit for straight_sets/duration."
                                    },
                                    "work_seconds": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "description": "Work window per round in seconds (tabata/interval/emom)."
                                    },
                                    "rest_seconds": {
                                        "type": "integer",
                                        "minimum": 0,
                                        "description": "Rest between rounds/intervals in seconds. 0 is valid (back-to-back)."
                                    },
                                    "duration_seconds": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "description": "Total block duration in seconds: the amrap/emom time cap, or the length of a `duration` block."
                                    },
                                    "instructions": {
                                        "type": "string",
                                        "description": "Block-level coaching text (e.g. 'stay below the pump', 'all-out on work intervals')."
                                    },
                                    "exercises": {
                                        "type": "array",
                                        "minItems": 1,
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "exercise_name": {
                                                    "type": "string",
                                                    "description": "Name of the exercise"
                                                },
                                                "volume": {
                                                    "type": "string",
                                                    "description": "The dose: sets x reps, time, or distance (e.g., '3x10', '4x8', '30s', 'AMRAP', '60km', '90min', '8 routes')"
                                                },
                                                "rest": {
                                                    "type": "string",
                                                    "description": "Rest period (e.g., '60s', '90-120s', '2-3 min')"
                                                },
                                                "notes": {
                                                    "type": "string",
                                                    "description": "Form cues, or the free-form detail of an outdoor session (route, grades, terrain, intensity)"
                                                },
                                                "muscles": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                    "description": "Primary muscle groups (e.g., ['Chest', 'Triceps']). ALWAYS include — used to classify the exercise correctly if it's new to the catalog."
                                                },
                                                "discipline": {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                    "description": "Exercise disciplines (e.g., ['Calisthenics'], ['cycling']). Include when it differs from the session's primary_disciplines."
                                                }
                                            },
                                            "required": ["exercise_name", "volume"]
                                        }
                                    }
                                },
                                "required": ["name", "exercises"]
                            }
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Tags for categorization (e.g., ['push', 'upper-body', 'strength'])"
                        }
                    },
                    "required": ["name", "estimated_duration", "difficulty_level", "blocks"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_session_templates",
                "description": "List the user's available session templates (any discipline — gym workouts, rides, climbs, runs) that can be scheduled or used in training plans. Returns each template's full exercise list (block, name, volume, rest) — you do NOT need to ask the user what's in a session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "discipline": {
                            "type": "string",
                            "description": "Filter by discipline / sport (e.g. 'strength', 'cycling', 'climbing', 'running')"
                        },
                        "difficulty_level": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"]
                        },
                        "include_common": {
                            "type": "boolean",
                            "description": "Include common/public templates (default: true)"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results (default: 10)"
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_session_template",
                "description": (
                    "Delete the user's OWN session templates (never common/public ones). "
                    "Use when the user asks to remove/clean up templates. Previews first; "
                    "deletes only when called again with confirm=true. keep_only handles "
                    "'delete everything except X, Y' in one call."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "template_id": {
                            "type": "string",
                            "description": "Delete one template by id."
                        },
                        "name": {
                            "type": "string",
                            "description": "Delete one template by exact name (case-insensitive)."
                        },
                        "keep_only": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Delete ALL of the user's templates EXCEPT these names (case-insensitive)."
                        },
                        "confirm": {
                            "type": "boolean",
                            "description": "Actually delete. Default false = preview only. Set true ONLY after the user confirms the preview."
                        }
                    }
                }
            }
        },
        # ==================== SESSION LOG TOOLS ====================
        {
            "type": "function",
            "function": {
                "name": "log_session",
                "description": (
                    "Log a session the user actually PERFORMED to their training history (it also appears on their "
                    "calendar). A session is ANY training activity, so this is the tool for a gym workout AND for a "
                    "ride, a run, a climb, a swim or a mobility block. Record what they actually did: "
                    "sets/reps/weights/RPE for strength work, or distance/duration/effort for endurance and outdoor "
                    "work. Logs are performed sessions only — to put a future/planned session on the calendar use "
                    "schedule_to_calendar instead. "
                    "Examples: 'log today's push day, 4 exercises' → discipline 'strength' with the sets; "
                    "'log yesterday's 60km bike ride, about 2 hours' → discipline 'cycling', date = yesterday, "
                    "durationMinutes 120, and ONE exercise entry named after the activity ('Outdoor Cycling') whose "
                    "set carries the numbers (time in seconds) and whose notes carry '60 km'. "
                    "Always set `discipline` from what they actually did — never leave a ride or a climb as 'strength'."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Session title (e.g., 'Morning Push Session', 'Leg Day', 'Sunday Long Ride')"
                        },
                        "date": {
                            "type": "string",
                            "description": "Session date in ISO format (defaults to today)"
                        },
                        "discipline": {
                            "type": "string",
                            "enum": list(DISCIPLINES),
                            "description": "Which sport this session is. Use 'cycling' for rides, 'running' for runs, 'climbing' for climbs/bouldering."
                        },
                        "durationMinutes": {
                            "type": "integer",
                            "description": "Actual duration in minutes"
                        },
                        "exercises": {
                            "type": "array",
                            "description": "Exercises performed with actual results. For an endurance/outdoor session use ONE entry named after the activity (e.g. 'Outdoor Cycling', 'Trail Run') with a single set carrying time/reps and the distance in notes.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "exerciseName": {
                                        "type": "string",
                                        "description": "Name of the exercise"
                                    },
                                    "sets": {
                                        "type": "array",
                                        "description": "Individual sets performed",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "targetReps": {"type": "integer"},
                                                "actualReps": {"type": "integer"},
                                                "weight": {"type": "number", "description": "Weight in kg"},
                                                "time": {"type": "integer", "description": "Duration in seconds"},
                                                "rpe": {"type": "number", "description": "Rate of Perceived Exertion (1-10)"},
                                                "restSeconds": {"type": "integer"},
                                                "notes": {"type": "string"}
                                            }
                                        }
                                    },
                                    "notes": {"type": "string"}
                                },
                                "required": ["exerciseName", "sets"]
                            }
                        },
                        "notes": {
                            "type": "string",
                            "description": "General session notes (route, terrain, how it felt)"
                        },
                        "planId": {
                            "type": "string",
                            "description": "Link to training plan if this session is part of a plan"
                        }
                    },
                    "required": ["title", "discipline", "exercises"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_session_history",
                "description": "Get the user's recent session history — every discipline they trained (gym workouts, rides, runs, climbs) — to analyze progress and patterns. Returns each session's full exercise list with sets (target/actual reps, weight, RPE). Filter by `discipline` to look at one sport only.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "integer",
                            "description": "Number of days to look back (default: 30)"
                        },
                        "discipline": {
                            "type": "string",
                            "enum": list(DISCIPLINES),
                            "description": "Filter by discipline / sport"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum results (default: 10)"
                        }
                    }
                }
            }
        },
    ]
