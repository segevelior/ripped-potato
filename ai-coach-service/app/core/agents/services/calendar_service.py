"""
Calendar service - handles calendar scheduling operations
"""

from typing import Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

logger = structlog.get_logger()


class CalendarService:
    """Service for calendar operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def schedule_to_calendar(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Schedule a workout or event to the user's calendar"""
        try:
            # Parse date - handle 'today', 'tomorrow', or ISO date
            date_str = args.get("date", "")
            if date_str.lower() == "today":
                event_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_str.lower() == "tomorrow":
                event_date = (datetime.utcnow() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
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
                # Look up exercise IDs and build blocks structure
                workout_exercises = workout_details.get("exercises", [])
                blocks = [{
                    "name": "Main Workout",
                    "exercises": []
                }]

                for ex in workout_exercises:
                    exercise_name = ex.get("exerciseName", "")
                    target_sets = ex.get("targetSets", 3)
                    target_reps = ex.get("targetReps", 10)

                    # Try to find the exercise in the database
                    existing_ex = await self.db.exercises.find_one({
                        "name": {"$regex": f"^{exercise_name}$", "$options": "i"},
                        "$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]
                    })

                    if existing_ex:
                        exercise_id = existing_ex["_id"]
                    else:
                        # Create new exercise in user's library
                        new_exercise = {
                            "name": exercise_name,
                            "description": ex.get("notes", f"AI-generated exercise: {exercise_name}"),
                            "muscles": ex.get("muscles", ["General"]),
                            "secondaryMuscles": [],
                            "discipline": workout_details.get("disciplines", ["General Fitness"]),
                            "equipment": ex.get("equipment", []),
                            "difficulty": workout_details.get("difficulty", "intermediate"),
                            "instructions": [],
                            "strain": {
                                "intensity": "moderate",
                                "load": "moderate",
                                "durationType": "reps",
                                "typicalVolume": f"{target_sets}x{target_reps}"
                            },
                            "isCommon": False,
                            "createdBy": ObjectId(user_id),
                            "createdAt": datetime.utcnow(),
                            "updatedAt": datetime.utcnow()
                        }
                        exercise_result = await self.db.exercises.insert_one(new_exercise)
                        exercise_id = exercise_result.inserted_id
                        logger.info(f"Created new exercise '{exercise_name}' for user {user_id}")

                    # Add to blocks for PredefinedWorkout
                    blocks[0]["exercises"].append({
                        "exercise_id": exercise_id,
                        "exercise_name": exercise_name,
                        "volume": f"{target_sets}x{target_reps}",
                        "rest": "60s",
                        "notes": ex.get("notes", "")
                    })

                    # Add to exercises list for CalendarEvent
                    exercises.append({
                        "exerciseId": exercise_id,
                        "exerciseName": exercise_name,
                        "targetSets": target_sets,
                        "targetReps": target_reps,
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

                # Check if it's today
                today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                if event_date.date() == today.date():
                    response_msg += "\n\n**This is for today!** Would you like to start training now?"

                logger.info(f"Scheduled calendar event '{title}' for user {user_id} on {formatted_date}")
                return {
                    "success": True,
                    "message": response_msg,
                    "event_id": str(result.inserted_id),
                    "date": formatted_date,
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
            # Parse dates
            start_str = args.get("startDate")
            end_str = args.get("endDate")

            if start_str:
                try:
                    start_date = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                except Exception:
                    start_date = datetime.strptime(start_str, "%Y-%m-%d")
            else:
                start_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

            if end_str:
                try:
                    end_date = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                except Exception:
                    end_date = datetime.strptime(end_str, "%Y-%m-%d")
            else:
                end_date = start_date + timedelta(days=7)

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

            if not events:
                start_fmt = start_date.strftime("%B %d")
                end_fmt = end_date.strftime("%B %d, %Y")
                return {
                    "success": True,
                    "message": f"No events scheduled from {start_fmt} to {end_fmt}.",
                    "events": []
                }

            # Format events for response
            formatted_events = []
            for event in events:
                formatted_events.append({
                    "id": str(event["_id"]),
                    "date": event["date"].strftime("%Y-%m-%d"),
                    "dayOfWeek": event["date"].strftime("%A"),
                    "title": event.get("title", "Untitled"),
                    "type": event.get("type", "workout"),
                    "status": event.get("status", "scheduled"),
                    "duration": event.get("workoutDetails", {}).get("estimatedDuration"),
                    "exerciseCount": len(event.get("workoutDetails", {}).get("exercises", [])),
                    "notes": event.get("notes", "")
                })

            # Build summary message
            workout_count = sum(1 for e in formatted_events if e["type"] == "workout")
            rest_count = sum(1 for e in formatted_events if e["type"] == "rest")

            summary = f"Found **{len(formatted_events)} events** from {start_date.strftime('%B %d')} to {end_date.strftime('%B %d')}:"
            if workout_count > 0:
                summary += f"\n- **{workout_count}** workout(s)"
            if rest_count > 0:
                summary += f"\n- **{rest_count}** rest day(s)"

            return {
                "success": True,
                "message": summary,
                "events": formatted_events
            }

        except Exception as e:
            logger.error(f"Error getting calendar events: {e}")
            return {"success": False, "message": f"Error fetching calendar: {str(e)}"}
