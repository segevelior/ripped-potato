"""
Calendar service - handles calendar scheduling operations
"""

from typing import Dict, Any
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

from app.core.agents.date_utils import get_user_today, relative_day_label
from app.core.agents.services.exercise_resolver import ExerciseResolver
from app.core.agents.volume_utils import flatten_template_exercises
from app.core.dedup import normalize_template_title, strip_template_date_suffix

logger = structlog.get_logger()


class CalendarService:
    """Service for calendar operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def schedule_to_calendar(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Schedule a workout or event to the user's calendar"""
        try:
            # Resolve relative dates against the user's LOCAL calendar day —
            # server UTC can be a different day than the user's.
            today, _ = await get_user_today(self.db, user_id)

            # Parse date - handle 'today', 'tomorrow', or ISO date
            date_str = args.get("date", "")
            if date_str.lower() == "today":
                event_date = today
            elif date_str.lower() == "tomorrow":
                event_date = today + timedelta(days=1)
            else:
                try:
                    event_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except Exception:
                    # Try parsing as YYYY-MM-DD
                    event_date = datetime.strptime(date_str, "%Y-%m-%d")

            title = args.get("title", "Workout")
            event_type = args.get("type", "workout")
            workout_details = args.get("workoutDetails", {})
            notes = args.get("notes", "")

            # Linking an existing library workout: verify it exists and is
            # visible to this user BEFORE any preview/write, so a bad id is a
            # structured error the agent can recover from by re-listing.
            existing_template = None
            template_id_arg = args.get("workout_template_id")
            if template_id_arg:
                try:
                    template_oid = ObjectId(template_id_arg)
                except Exception:
                    template_oid = None
                if template_oid is not None:
                    existing_template = await self.db.predefinedworkouts.find_one({
                        "_id": template_oid,
                        "$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}],
                    })
                if existing_template is None:
                    return {
                        "success": False,
                        "error": "template_not_found",
                        "message": (
                            f"No workout template with id '{template_id_arg}' is available to this user. "
                            "Call list_workout_templates to find the correct id, or pass "
                            "workoutDetails.exercises to schedule a new custom session. "
                            "Never guess an id — take it from a tool result."
                        ),
                    }
                if not flatten_template_exercises(existing_template):
                    return {
                        "success": False,
                        "error": "empty_template",
                        "message": (
                            f"Template '{existing_template.get('name', '')}' "
                            f"(id={template_id_arg}) has no exercises, so it cannot be "
                            f"scheduled. Tell the user, and either fill it in or "
                            f"schedule a different workout."
                        ),
                    }

            # Hard gate: a workout on the calendar must be a planned session
            # backed by a library template — never a bare title. Returning a
            # tool error here makes the agent plan the exercises and retry.
            if (
                event_type in ("workout", "deload")
                and existing_template is None
                and not workout_details.get("exercises")
            ):
                return {
                    "success": False,
                    "error": "missing_workout_details",
                    "message": (
                        "A workout calendar event must reference a workout. Either pass "
                        "workout_template_id for an existing library workout (find it with "
                        "list_workout_templates), or plan the session first and pass the full "
                        "workoutDetails.exercises to create a new one."
                    ),
                }

            # When linking a library workout, the template name is the natural
            # default title (the caller may still override it). Strip any old
            # scheduling date suffix so it doesn't stack with the new one.
            if existing_template is not None and not args.get("title"):
                title = strip_template_date_suffix(existing_template.get("name", title)) or title

            # Add date to title to make it unique and identifiable
            date_suffix = event_date.strftime("%b %d")
            title_with_date = f"{title} ({date_suffix})"

            # Refuse to double-book: an equivalent event (same template or same
            # base title) already on that date means the model is about to
            # create the duplicate the user will have to complain about. Runs
            # on BOTH the preview and the write path — they are separate turns.
            if event_type in ("workout", "deload") and not args.get("allow_duplicate", False):
                duplicate = await self._find_same_day_duplicate(
                    user_id,
                    event_date,
                    normalize_template_title(title),
                    existing_template["_id"] if existing_template else None,
                    today,
                )
                if duplicate:
                    return duplicate

            # Default is a dry-run PREVIEW that writes nothing (TOR-88: an
            # event was written against the user's explicit decline). The
            # preview surfaces how each exercise name resolved against the
            # catalog — silent substitutions must be visible BEFORE any write.
            if args.get("dry_run", True):
                return await self._preview_schedule(
                    user_id, event_date, title_with_date, event_type, workout_details, today,
                    existing_template=existing_template,
                )

            workout_template_id = None

            if existing_template is not None:
                # Link the existing library workout — never duplicate it.
                workout_template_id = existing_template["_id"]
            elif event_type in ("workout", "deload") and workout_details:
                # Build the blocks structure; the shared resolver fills in real
                # exercise ids (exact → fuzzy → vector → create) so neither the
                # PredefinedWorkout nor the CalendarEvent can carry a null id.
                workout_exercises = workout_details.get("exercises", [])
                blocks = [{
                    "name": "Main Workout",
                    "exercises": [
                        {
                            "exercise_name": ex.get("exerciseName", ""),
                            "volume": f"{ex.get('targetSets', 3)}x{ex.get('targetReps', 10)}",
                            "rest": "60s",
                            "notes": ex.get("notes", ""),
                            "muscles": ex.get("muscles"),
                            "discipline": workout_details.get("disciplines"),
                            "equipment": ex.get("equipment"),
                            "difficulty": workout_details.get("difficulty"),
                        }
                        for ex in workout_exercises
                    ]
                }]

                # best_effort: scheduling is a committed action — take the best
                # medium-confidence match rather than stalling, create when new.
                blocks, _report = await ExerciseResolver(self.db).resolve_blocks(
                    user_id, blocks, on_ambiguous="best_effort"
                )

                # Save workout to user's library (PredefinedWorkout collection)
                workout_template = {
                    "name": title_with_date,
                    "goal": workout_details.get("goal", f"Workout for {date_suffix}"),
                    "primary_disciplines": workout_details.get("disciplines", ["General Fitness"]),
                    "estimated_duration": workout_details.get("estimatedDuration", 45),
                    "difficulty_level": workout_details.get("difficulty", "intermediate"),
                    "blocks": blocks,
                    "tags": ["ai-generated", date_suffix.lower().replace(" ", "-")],
                    "isCommon": False,
                    "createdBy": ObjectId(user_id),
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }

                template_result = await self.db.predefinedworkouts.insert_one(workout_template)
                if template_result.inserted_id:
                    workout_template_id = template_result.inserted_id
                    logger.info(f"Saved workout '{title_with_date}' to user's library")

            # Build the calendar event document
            event_data = {
                "userId": ObjectId(user_id),
                "date": event_date,
                "title": title_with_date,
                "type": event_type,
                "status": "scheduled",
                "notes": notes,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Link to workout template (existing library workout or just created)
            if workout_template_id:
                event_data["workoutTemplateId"] = workout_template_id

            # The event only carries display scalars — exercises live on the
            # linked template, never embedded in the calendar event.
            if event_type in ("workout", "deload"):
                if existing_template is not None:
                    disciplines = existing_template.get("primary_disciplines") or []
                    event_data["workoutDetails"] = {
                        "type": (disciplines[0].lower() if disciplines else "strength"),
                        "estimatedDuration": existing_template.get("estimated_duration", 45),
                    }
                elif workout_details:
                    event_data["workoutDetails"] = {
                        "type": workout_details.get("workoutType", "strength"),
                        "estimatedDuration": workout_details.get("estimatedDuration", 45),
                    }

            # Insert into calendarevents collection (Mongoose uses lowercase, no underscore)
            result = await self.db.calendarevents.insert_one(event_data)

            if result.inserted_id:
                # Format the date nicely for the response
                formatted_date = event_date.strftime("%A, %B %d, %Y")
                if existing_template is not None:
                    exercise_count = len(flatten_template_exercises(existing_template))
                    duration = existing_template.get("estimated_duration", 45)
                else:
                    exercise_count = len(workout_details.get("exercises", [])) if workout_details else 0
                    duration = workout_details.get("estimatedDuration", 45) if workout_details else 45

                response_msg = f"Scheduled **{title_with_date}** for **{formatted_date}**!"
                if existing_template is not None:
                    response_msg += f"\n\nLinked to **{existing_template.get('name')}** from your workout library."
                elif workout_template_id:
                    response_msg += "\n\n**Saved to your workout library** - you can reuse this workout anytime!"
                if event_type in ("workout", "deload") and exercise_count > 0:
                    response_msg += f"\n\n**{exercise_count} exercises** | **~{duration} min**"

                # Check if it's today (user-local)
                if event_date.date() == today.date():
                    response_msg += "\n\n**This is for today!** Would you like to start training now?"

                logger.info(f"Scheduled calendar event '{title}' for user {user_id} on {formatted_date}")
                return {
                    "success": True,
                    "message": response_msg,
                    "event_id": str(result.inserted_id),
                    "workout_template_id": str(workout_template_id) if workout_template_id else None,
                    "date": formatted_date,
                    "dateISO": event_date.strftime("%Y-%m-%d"),
                    "relativeDay": relative_day_label(event_date.date(), today.date()),
                    "is_today": event_date.date() == today.date()
                }
            else:
                return {"success": False, "message": "Failed to create calendar event"}

        except Exception as e:
            logger.error(f"Error scheduling to calendar: {e}")
            return {"success": False, "message": f"Error scheduling event: {str(e)}"}

    async def _find_same_day_duplicate(
        self,
        user_id: str,
        event_date: datetime,
        base_title: str,
        template_oid,
        today: datetime,
    ):
        """Return an already_scheduled refusal if an equivalent workout event
        (same linked template, or same date-suffix-stripped title) already sits
        on that calendar day. None when the day is clear."""
        day_start = datetime(event_date.year, event_date.month, event_date.day)
        day_end = day_start + timedelta(days=1)
        cursor = self.db.calendarevents.find({
            "userId": ObjectId(user_id),
            "date": {"$gte": day_start, "$lt": day_end},
            "type": {"$in": ["workout", "deload"]},
            "status": {"$ne": "cancelled"},
        })
        async for event in cursor:
            same_template = (
                template_oid is not None
                and event.get("workoutTemplateId") == template_oid
            )
            same_title = (
                base_title
                and normalize_template_title(event.get("title", "")) == base_title
            )
            if not (same_template or same_title):
                continue
            date_label = day_start.strftime("%A, %B %d")
            return {
                "success": False,
                "error": "already_scheduled",
                "existing_event": {
                    "id": str(event["_id"]),
                    "title": event.get("title", ""),
                    "date": day_start.strftime("%Y-%m-%d"),
                    "status": event.get("status", ""),
                    "relativeDay": relative_day_label(day_start.date(), today.date()),
                },
                "message": (
                    f"'{event.get('title', '')}' is already on the calendar for "
                    f"{date_label} (event id {event['_id']}). Did NOT add a duplicate. "
                    f"Tell the user it's already scheduled. If they truly want it twice "
                    f"that day, call again with allow_duplicate=true; to replace it, "
                    f"delete_calendar_event the existing one first."
                ),
            }
        return None

    async def _preview_schedule(
        self,
        user_id: str,
        event_date: datetime,
        title_with_date: str,
        event_type: str,
        workout_details: Dict[str, Any],
        today: datetime,
        existing_template: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        """Dry-run preview for schedule_to_calendar: resolve exercise names
        without creating anything, and return what a confirmed call would write."""
        formatted_date = event_date.strftime("%A, %B %d, %Y")
        preview_msg = f"**Preview — nothing scheduled yet**\n\n**{title_with_date}** on **{formatted_date}** ({event_type})"

        resolved_exercises = []
        if existing_template is not None:
            # Linking a library workout: nothing to resolve — the template's
            # exercises are already canonical. Just show what gets linked.
            flat = flatten_template_exercises(existing_template)
            lines = [
                f"- **{ex['exerciseName']}** — {ex['targetSets']}x{ex['targetReps']}"
                for ex in flat
            ]
            duration = existing_template.get("estimated_duration", 45)
            preview_msg += (
                f"\n\nLinks existing library workout **{existing_template.get('name')}** "
                f"(no new workout is created), ~{duration} min:\n" + "\n".join(lines)
            )
        elif event_type in ("workout", "deload") and workout_details:
            workout_exercises = workout_details.get("exercises", [])
            items = [
                {
                    "exercise_name": ex.get("exerciseName", ""),
                    "muscles": ex.get("muscles"),
                    "discipline": workout_details.get("disciplines"),
                    "equipment": ex.get("equipment"),
                    "difficulty": workout_details.get("difficulty"),
                }
                for ex in workout_exercises
            ]
            # create=False: a preview must not leave phantom catalog entries
            # behind if the user declines.
            resolutions = await ExerciseResolver(self.db).resolve(
                user_id, items, on_ambiguous="best_effort", create=False
            )

            lines = []
            for ex, res in zip(workout_exercises, resolutions):
                given = ex.get("exerciseName", "")
                is_new = res["status"] == "create_pending"
                matched = res.get("matched_name")
                resolved_exercises.append({
                    "given": given,
                    "resolved": given if is_new else matched,
                    "is_new": is_new,
                    "method": res.get("method"),
                })
                volume = f"{ex.get('targetSets', 3)}x{ex.get('targetReps', 10)}"
                if is_new:
                    lines.append(f"- **{given}** — {volume} (new — will be added to your exercise catalog)")
                elif matched and matched.lower() != given.lower():
                    lines.append(f"- \"{given}\" → matched to existing **{matched}** — {volume}")
                else:
                    lines.append(f"- **{matched or given}** — {volume}")
            duration = workout_details.get("estimatedDuration", 45)
            preview_msg += f", ~{duration} min:\n" + "\n".join(lines)

        preview_msg += (
            "\n\nShow this preview to the user and ask them to confirm. "
            "If they confirm, call `schedule_to_calendar` again with the SAME arguments plus `dry_run=false`. "
            "If they want a matched exercise kept under its ORIGINAL name instead, call `add_exercise` "
            "with that exact name first, then retry with `dry_run=false`. "
            "If the user declines, do NOT call this tool again."
        )

        return {
            "success": True,
            "dry_run": True,
            "message": preview_msg,
            "proposed_event": {
                "title": title_with_date,
                "date": event_date.strftime("%Y-%m-%d"),
                "type": event_type,
                "relativeDay": relative_day_label(event_date.date(), today.date()),
            },
            "resolved_exercises": resolved_exercises,
        }

    async def get_calendar_events(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get user's calendar events for a date range"""
        try:
            # "Today" must be the user's LOCAL calendar day, not server UTC —
            # stored event dates are midnight UTC representing calendar days.
            today, tz_name = await get_user_today(self.db, user_id)

            # Parse dates
            start_str = args.get("startDate")
            end_str = args.get("endDate")

            def parse_naive(date_str: str) -> datetime:
                try:
                    parsed = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                    if parsed.tzinfo is not None:
                        parsed = parsed.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    return parsed
                except Exception:
                    return datetime.strptime(date_str, "%Y-%m-%d")

            if start_str:
                start_date = parse_naive(start_str)
            else:
                # Include yesterday so "I missed yesterday's workout" questions
                # see the missed session.
                start_date = today - timedelta(days=1)

            if end_str:
                end_date = parse_naive(end_str)
            elif start_str:
                end_date = start_date + timedelta(days=7)
            else:
                end_date = today + timedelta(days=7)

            # Build query
            query = {
                "userId": ObjectId(user_id),
                "date": {"$gte": start_date, "$lte": end_date},
                "status": {"$ne": "cancelled"}
            }

            # Filter by type if provided
            event_type = args.get("type")
            if event_type:
                query["type"] = event_type

            # Fetch events (Mongoose uses lowercase, no underscore for collection name)
            events = await self.db.calendarevents.find(query).sort("date", 1).to_list(100)

            today_str = today.strftime("%Y-%m-%d")
            queried_range = {
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d")
            }

            if not events:
                start_fmt = start_date.strftime("%B %d")
                end_fmt = end_date.strftime("%B %d, %Y")
                return {
                    "success": True,
                    "message": (
                        f"No events scheduled from {start_fmt} to {end_fmt}. "
                        f"(Today is {today_str}, {today.strftime('%A')}, timezone {tz_name}.)"
                    ),
                    "today": today_str,
                    "dayOfWeek": today.strftime("%A"),
                    "timezone": tz_name,
                    "queriedRange": queried_range,
                    "events": []
                }

            # Events reference their workout — batch-fetch the linked templates
            # so the coach still sees the exercise-by-exercise list.
            template_ids = {
                event["workoutTemplateId"]
                for event in events
                if event.get("workoutTemplateId")
            }
            templates_by_id = {}
            if template_ids:
                async for tmpl in self.db.predefinedworkouts.find(
                    {"_id": {"$in": list(template_ids)}}
                ):
                    templates_by_id[tmpl["_id"]] = tmpl

            # Format events for response
            formatted_events = []
            for event in events:
                workout_details = event.get("workoutDetails") or {}
                template = templates_by_id.get(event.get("workoutTemplateId"))
                if template is not None:
                    raw_exercises = flatten_template_exercises(template)
                else:
                    # Legacy fallback: unmigrated/completed events still embed
                    # their exercises (completed = actual performed sets).
                    raw_exercises = workout_details.get("exercises") or []
                # Include the actual exercise-by-exercise list (not just a count) so
                # the coach can reason about, and swap, specific exercises. Keep it
                # compact to control tokens.
                exercises = [
                    {
                        "name": ex.get("exerciseName"),
                        "targetSets": ex.get("targetSets"),
                        "targetReps": ex.get("targetReps"),
                        "notes": ex.get("notes"),
                    }
                    for ex in raw_exercises
                ]
                duration = workout_details.get("estimatedDuration")
                if duration is None and template is not None:
                    duration = template.get("estimated_duration")
                formatted_events.append({
                    "id": str(event["_id"]),
                    "date": event["date"].strftime("%Y-%m-%d"),
                    "dayOfWeek": event["date"].strftime("%A"),
                    "relativeDay": relative_day_label(event["date"].date(), today.date()),
                    "isToday": event["date"].date() == today.date(),
                    "title": event.get("title", "Untitled"),
                    "type": event.get("type", "workout"),
                    "status": event.get("status", "scheduled"),
                    "duration": duration,
                    "workoutTemplateId": str(event["workoutTemplateId"]) if event.get("workoutTemplateId") else None,
                    "templateName": template.get("name") if template is not None else None,
                    "exerciseCount": len(raw_exercises),
                    "exercises": exercises,
                    "notes": event.get("notes", "")
                })

            # Build summary message
            workout_count = sum(1 for e in formatted_events if e["type"] == "workout")
            rest_count = sum(1 for e in formatted_events if e["type"] == "rest")

            summary = (
                f"Today is {today_str} ({today.strftime('%A')}). "
                f"Found **{len(formatted_events)} events** from {start_date.strftime('%B %d')} to {end_date.strftime('%B %d')}:"
            )
            if workout_count > 0:
                summary += f"\n- **{workout_count}** workout(s)"
            if rest_count > 0:
                summary += f"\n- **{rest_count}** rest day(s)"

            return {
                "success": True,
                "message": summary,
                "today": today_str,
                "dayOfWeek": today.strftime("%A"),
                "timezone": tz_name,
                "queriedRange": queried_range,
                "events": formatted_events
            }

        except Exception as e:
            logger.error(f"Error getting calendar events: {e}")
            return {"success": False, "message": f"Error fetching calendar: {str(e)}"}
