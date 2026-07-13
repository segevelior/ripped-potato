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

            # Add date to title to make it unique and identifiable
            date_suffix = event_date.strftime("%b %d")
            title_with_date = f"{title} ({date_suffix})"

            workout_template_id = None
            exercises = []

            # If this is a workout event with details, first save it to user's workout library
            if event_type == "workout" and workout_details:
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

                for ex, resolved in zip(workout_exercises, blocks[0]["exercises"]):
                    exercises.append({
                        "exerciseId": resolved["exercise_id"],
                        "exerciseName": resolved["exercise_name"],
                        "targetSets": ex.get("targetSets", 3),
                        "targetReps": ex.get("targetReps", 10),
                        "notes": ex.get("notes", "")
                    })

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

            # Link to workout template if created
            if workout_template_id:
                event_data["workoutTemplateId"] = workout_template_id

            # Add workout details to calendar event
            if event_type == "workout" and workout_details:
                event_data["workoutDetails"] = {
                    "type": workout_details.get("workoutType", "strength"),
                    "estimatedDuration": workout_details.get("estimatedDuration", 45),
                    "exercises": exercises
                }

            # Insert into calendarevents collection (Mongoose uses lowercase, no underscore)
            result = await self.db.calendarevents.insert_one(event_data)

            if result.inserted_id:
                # Format the date nicely for the response
                formatted_date = event_date.strftime("%A, %B %d, %Y")
                exercise_count = len(workout_details.get("exercises", [])) if workout_details else 0

                response_msg = f"Scheduled **{title_with_date}** for **{formatted_date}**!"
                if workout_template_id:
                    response_msg += "\n\n**Saved to your workout library** - you can reuse this workout anytime!"
                if event_type == "workout" and exercise_count > 0:
                    duration = workout_details.get("estimatedDuration", 45)
                    response_msg += f"\n\n**{exercise_count} exercises** | **~{duration} min**"

                # Check if it's today (user-local)
                if event_date.date() == today.date():
                    response_msg += "\n\n**This is for today!** Would you like to start training now?"

                logger.info(f"Scheduled calendar event '{title}' for user {user_id} on {formatted_date}")
                return {
                    "success": True,
                    "message": response_msg,
                    "event_id": str(result.inserted_id),
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

            # Format events for response
            formatted_events = []
            for event in events:
                workout_details = event.get("workoutDetails") or {}
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
                formatted_events.append({
                    "id": str(event["_id"]),
                    "date": event["date"].strftime("%Y-%m-%d"),
                    "dayOfWeek": event["date"].strftime("%A"),
                    "relativeDay": relative_day_label(event["date"].date(), today.date()),
                    "isToday": event["date"].date() == today.date(),
                    "title": event.get("title", "Untitled"),
                    "type": event.get("type", "workout"),
                    "status": event.get("status", "scheduled"),
                    "duration": workout_details.get("estimatedDuration"),
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
