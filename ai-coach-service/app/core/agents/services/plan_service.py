"""
Plan service - handles training plan operations
"""

from typing import Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

logger = structlog.get_logger()


class PlanService:
    """Service for training plan operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def create_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a training plan"""
        try:
            schedule = args.get("schedule", {})

            # Process weeks if provided
            weeks = []
            for week_data in args.get("weeks", []):
                week = {
                    "_id": ObjectId(),
                    "weekNumber": week_data.get("weekNumber", 1),
                    "focus": week_data.get("focus", ""),
                    "description": week_data.get("description", ""),
                    "deloadWeek": week_data.get("deloadWeek", False),
                    "workouts": [],
                    "restDays": []
                }

                # Process workouts for this week
                for workout in week_data.get("workouts", []):
                    weekly_workout = {
                        "_id": ObjectId(),
                        "dayOfWeek": workout.get("dayOfWeek", 1),
                        "workoutType": workout.get("workoutType", "custom"),
                        "notes": workout.get("notes", ""),
                        "isOptional": workout.get("isOptional", False)
                    }

                    if workout.get("workoutType") == "predefined" and workout.get("predefinedWorkoutId"):
                        try:
                            weekly_workout["predefinedWorkoutId"] = ObjectId(workout["predefinedWorkoutId"])
                        except Exception:
                            pass
                    elif workout.get("customWorkout"):
                        custom = workout["customWorkout"]
                        exercises = []
                        for ex in custom.get("exercises", []):
                            exercises.append({
                                "exerciseName": ex.get("exerciseName", ""),
                                "sets": ex.get("sets", [])
                            })
                        weekly_workout["customWorkout"] = {
                            "title": custom.get("title", ""),
                            "type": custom.get("type", "strength"),
                            "durationMinutes": custom.get("durationMinutes", 45),
                            "exercises": exercises
                        }

                    week["workouts"].append(weekly_workout)

                weeks.append(week)

            plan_data = {
                "userId": ObjectId(user_id),
                "name": args["name"],
                "description": args.get("description", ""),
                "status": "draft",
                "schedule": {
                    "weeksTotal": schedule.get("weeksTotal", 4),
                    "workoutsPerWeek": schedule.get("workoutsPerWeek", 3),
                    "restDays": schedule.get("restDays", [0, 6]),
                    "preferredWorkoutDays": schedule.get("preferredWorkoutDays", [1, 3, 5])
                },
                "weeks": weeks,
                "progress": {
                    "currentWeek": 1,
                    "completedWorkouts": 0,
                    "totalWorkouts": sum(len(w.get("workouts", [])) for w in weeks),
                    "skippedWorkouts": 0,
                    "adherencePercentage": 0
                },
                "settings": args.get("settings", {
                    "autoAdvance": True,
                    "allowModifications": True,
                    "sendReminders": True,
                    "difficultyAdjustment": "manual"
                }),
                "tags": args.get("tags", []),
                "isTemplate": False,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Link to goal if provided
            if args.get("goalId"):
                try:
                    plan_data["goalId"] = ObjectId(args["goalId"])
                except Exception:
                    pass

            result = await self.db.plans.insert_one(plan_data)

            if result.inserted_id:
                logger.info(f"Created plan '{args['name']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Created plan '{args['name']}' ({schedule.get('weeksTotal', 4)} weeks, {schedule.get('workoutsPerWeek', 3)} workouts/week)!",
                    "plan_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create plan"}

        except Exception as e:
            logger.error(f"Error creating plan: {e}")
            return {"success": False, "message": str(e)}

    async def list_plans(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List user's training plans"""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}

            if args.get("status"):
                query["status"] = args["status"]

            include_templates = args.get("include_templates", False)
            if not include_templates:
                query["isTemplate"] = {"$ne": True}

            plans = await self.db.plans.find(
                query,
                {"name": 1, "description": 1, "status": 1, "schedule": 1, "progress": 1, "startDate": 1}
            ).sort("updatedAt", -1).to_list(None)

            results = []
            for p in plans:
                results.append({
                    "id": str(p["_id"]),
                    "name": p["name"],
                    "description": p.get("description", ""),
                    "status": p.get("status"),
                    "weeks_total": p.get("schedule", {}).get("weeksTotal"),
                    "workouts_per_week": p.get("schedule", {}).get("workoutsPerWeek"),
                    "current_week": p.get("progress", {}).get("currentWeek"),
                    "adherence": p.get("progress", {}).get("adherencePercentage"),
                    "start_date": p["startDate"].isoformat() if p.get("startDate") else None
                })

            return {
                "success": True,
                "count": len(results),
                "plans": results
            }

        except Exception as e:
            logger.error(f"Error listing plans: {e}")
            return {"success": False, "message": str(e)}

    async def update_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update a plan's top-level fields and schedule"""
        try:
            plan_id = args.get("plan_id")
            if not plan_id:
                return {"success": False, "message": "Missing required parameter: plan_id"}

            # Fetch plan to verify ownership
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            # Prepare updates
            allowed_top_fields = ["name", "description", "status", "goalId", "startDate"]
            updates: Dict[str, Any] = {}
            for field in allowed_top_fields:
                if field in args and args[field] is not None:
                    if field in ("goalId",):
                        updates[field] = ObjectId(args[field])
                    elif field == "startDate":
                        # Parse ISO date string into datetime for Mongo Date type
                        try:
                            updates[field] = datetime.fromisoformat(args[field].replace("Z", "+00:00"))
                        except Exception:
                            updates[field] = args[field]
                    else:
                        updates[field] = args[field]

            if "schedule" in args and isinstance(args["schedule"], dict):
                schedule_updates = {}
                for key in ["weeksTotal", "workoutsPerWeek", "restDays", "preferredWorkoutDays"]:
                    if key in args["schedule"] and args["schedule"][key] is not None:
                        schedule_updates[key] = args["schedule"][key]
                if schedule_updates:
                    updates["schedule"] = {**plan.get("schedule", {}), **schedule_updates}

            if not updates:
                return {"success": False, "message": "No valid fields to update"}

            updates["updatedAt"] = datetime.utcnow()

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "Updated plan successfully!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error updating plan: {e}")
            return {"success": False, "message": str(e)}

    async def add_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add a weekly workout to a specific week in a user's plan"""
        try:
            required = ["plan_id", "weekNumber", "dayOfWeek", "workoutType"]
            for r in required:
                if r not in args:
                    return {"success": False, "message": f"Missing required parameter: {r}"}

            plan_id = args["plan_id"]
            week_number = int(args["weekNumber"])
            day_of_week = int(args["dayOfWeek"])
            workout_type = args["workoutType"]

            # Load plan and verify ownership
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            weeks = plan.get("weeks", []) or []

            # Find or create the target week
            target_week = next((w for w in weeks if w.get("weekNumber") == week_number), None)
            if not target_week:
                target_week = {
                    "_id": ObjectId(),
                    "weekNumber": week_number,
                    "workouts": [],
                    "restDays": [],
                    "deloadWeek": False
                }
                weeks.append(target_week)

            workouts = target_week.get("workouts", []) or []

            weekly_workout: Dict[str, Any] = {
                "_id": ObjectId(),
                "dayOfWeek": day_of_week,
                "workoutType": workout_type,
                "notes": args.get("notes"),
                "isOptional": bool(args.get("isOptional", False))
            }

            if workout_type == "predefined":
                predefined_id = args.get("predefinedWorkoutId")
                if not predefined_id:
                    return {"success": False, "message": "predefinedWorkoutId is required for workoutType 'predefined'"}
                weekly_workout["predefinedWorkoutId"] = ObjectId(predefined_id)
            elif workout_type == "custom":
                custom = args.get("customWorkout") or {}
                # Normalize nested exercises ObjectId fields if present
                exercises = custom.get("exercises", [])
                normalized_exercises = []
                for ex in exercises:
                    ex_copy = dict(ex)
                    if ex_copy.get("exerciseId"):
                        try:
                            ex_copy["exerciseId"] = ObjectId(ex_copy["exerciseId"])  # may be absent
                        except Exception:
                            pass
                    normalized_exercises.append(ex_copy)
                weekly_workout["customWorkout"] = {
                    "title": custom.get("title"),
                    "type": custom.get("type"),
                    "durationMinutes": custom.get("durationMinutes"),
                    "exercises": normalized_exercises
                }
            else:
                return {"success": False, "message": "Invalid workoutType. Expected 'predefined' or 'custom'"}

            # Append and persist
            workouts.append(weekly_workout)
            target_week["workouts"] = workouts

            # Replace/merge week back into weeks array
            for i, w in enumerate(weeks):
                if w.get("weekNumber") == week_number:
                    weeks[i] = target_week
                    break

            update_doc = {
                "weeks": weeks,
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": update_doc}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "Added workout to plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error adding plan workout: {e}")
            return {"success": False, "message": str(e)}

    async def remove_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Remove a weekly workout from a specific week in a user's plan"""
        try:
            plan_id = args.get("plan_id")
            week_number = args.get("weekNumber")
            weekly_workout_id = args.get("weeklyWorkoutId")
            workout_index = args.get("workoutIndex")

            if not plan_id or not week_number:
                return {"success": False, "message": "Missing required parameters: plan_id, weekNumber"}

            # Load plan
            plan = await self.db.plans.find_one({"_id": ObjectId(plan_id), "userId": ObjectId(user_id)})
            if not plan:
                return {"success": False, "message": "Plan not found"}

            weeks = plan.get("weeks", []) or []
            target_week = next((w for w in weeks if w.get("weekNumber") == int(week_number)), None)
            if not target_week:
                return {"success": False, "message": "Week not found in plan"}

            workouts = target_week.get("workouts", []) or []

            removed = False
            if weekly_workout_id:
                filtered = [w for w in workouts if str(w.get("_id")) != str(weekly_workout_id)]
                removed = len(filtered) != len(workouts)
                workouts = filtered
            elif workout_index is not None:
                try:
                    idx = int(workout_index)
                    if 0 <= idx < len(workouts):
                        workouts.pop(idx)
                        removed = True
                except Exception:
                    pass
            else:
                return {"success": False, "message": "Provide either weeklyWorkoutId or workoutIndex"}

            if not removed:
                return {"success": False, "message": "No matching workout found to remove"}

            target_week["workouts"] = workouts
            for i, w in enumerate(weeks):
                if w.get("weekNumber") == int(week_number):
                    weeks[i] = target_week
                    break

            update_doc = {
                "weeks": weeks,
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.plans.update_one(
                {"_id": ObjectId(plan_id), "userId": ObjectId(user_id)},
                {"$set": update_doc}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "Removed workout from plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error removing plan workout: {e}")
            return {"success": False, "message": str(e)}
