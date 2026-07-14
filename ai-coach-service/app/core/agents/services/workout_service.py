"""
Workout service - handles workout template and workout log operations
"""

from typing import Dict, Any, List
from datetime import datetime, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

from app.core.agents.services.exercise_resolver import (
    ExerciseResolver,
    format_ambiguous_message,
)
from app.core.dedup import existing_template_duplicate_response

logger = structlog.get_logger()


class WorkoutService:
    """Service for workout-related operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def create_workout_template(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a workout template (PredefinedWorkout) with blocks structure"""
        try:
            # A template with zero exercises is a placeholder, never a real
            # request — refuse before touching the resolver or the db.
            if not any(
                (block.get("exercises") or []) for block in (args.get("blocks") or [])
            ):
                return {
                    "success": False,
                    "error": "empty_workout_template",
                    "message": (
                        "Refusing to create a workout template with no exercises. "
                        "If the user referenced a workout they already have, search "
                        "the library (grep_workouts / list_workout_templates) and "
                        "reuse it. If it is genuinely new, gather its exercises "
                        "first, then retry."
                    ),
                }

            # Same-name templates are almost always the model re-creating
            # something that exists; redirect to the existing one unless the
            # user explicitly confirmed a duplicate.
            if not args.get("confirm_duplicate", False):
                dup = await existing_template_duplicate_response(
                    self.db, user_id, args.get("name", "")
                )
                if dup:
                    return dup

            # Normalize blocks. muscles/discipline are resolver inputs the LLM
            # supplies for exercises that may need creating — the resolver
            # strips them before anything is persisted.
            blocks = []
            for block in args.get("blocks", []):
                blocks.append({
                    "name": block.get("name", "Main Work"),
                    "exercises": [
                        {
                            "exercise_name": ex.get("exercise_name", ""),
                            "volume": ex.get("volume", "3x10"),
                            "rest": ex.get("rest", "60s"),
                            "notes": ex.get("notes", ""),
                            "muscles": ex.get("muscles"),
                            "discipline": ex.get("discipline") or args.get("primary_disciplines"),
                        }
                        for ex in block.get("exercises", [])
                    ]
                })

            # Resolve every exercise name to a real catalog id (verified id →
            # exact → fuzzy → vector → create). exercise_id must never be null:
            # raw motor inserts bypass Mongoose validation, so this call is the
            # enforcement point. Medium-confidence matches come back ambiguous —
            # the coach asks the user instead of guessing.
            blocks, report = await ExerciseResolver(self.db).resolve_blocks(
                user_id, blocks, on_ambiguous="ask"
            )
            if report["ambiguous"]:
                return {
                    "success": False,
                    "needs_user_decision": True,
                    "ambiguous_exercises": report["ambiguous"],
                    "message": format_ambiguous_message(report["ambiguous"]),
                }

            workout_data = {
                "name": args["name"],
                "goal": args.get("goal", ""),
                "primary_disciplines": args.get("primary_disciplines", []),
                "estimated_duration": args.get("estimated_duration", 45),
                "difficulty_level": args.get("difficulty_level", "intermediate"),
                "blocks": blocks,
                "tags": args.get("tags", []),
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "popularity": 0,
                "ratings": {"average": 0, "count": 0},
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.predefinedworkouts.insert_one(workout_data)

            if result.inserted_id:
                total_exercises = sum(len(b.get("exercises", [])) for b in blocks)
                logger.info(f"Created workout template '{args['name']}' for user {user_id}")
                message = f"Created workout template '{args['name']}' with {len(blocks)} blocks and {total_exercises} exercises!"
                created_names = [r["matched_name"] for r in report["created"]]
                if created_names:
                    message += f" Also added {len(created_names)} new exercise(s) to the library: {', '.join(created_names)}."
                return {
                    "success": True,
                    "message": message,
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create workout template"}

        except Exception as e:
            logger.error(f"Error creating workout template: {e}")
            return {"success": False, "message": str(e)}

    async def list_workout_templates(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List workout templates (PredefinedWorkouts)"""
        try:
            # Build the base ownership filter
            include_common = args.get("include_common", True)
            if include_common:
                ownership_filter = {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": ObjectId(user_id)}
                    ]
                }
            else:
                ownership_filter = {"createdBy": ObjectId(user_id)}

            # Build additional filters
            additional_filters: List[Dict[str, Any]] = []

            if args.get("name"):
                additional_filters.append({
                    "name": {"$regex": args["name"], "$options": "i"}
                })
            if args.get("discipline"):
                additional_filters.append({
                    "primary_disciplines": {"$regex": args["discipline"], "$options": "i"}
                })
            if args.get("difficulty_level"):
                additional_filters.append({"difficulty_level": args["difficulty_level"]})

            # Combine all filters with $and
            if additional_filters:
                query = {"$and": [ownership_filter] + additional_filters}
            else:
                query = ownership_filter

            limit = args.get("limit", 50)

            # Count before limiting so the model can tell a filtered/truncated
            # view from the full library (prevents contradictory answers across
            # calls with different filters).
            total_matching = await self.db.predefinedworkouts.count_documents(query)

            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "blocks": 1, "primary_disciplines": 1}
            ).limit(limit).to_list(None)

            results = []
            for w in workouts:
                blocks = w.get("blocks") or []
                total_exercises = sum(len(b.get("exercises", [])) for b in blocks)
                # Include the actual exercises (flattened from blocks, keeping the
                # block name) so the coach can reason about and swap specific
                # exercises instead of only seeing a count.
                exercises = [
                    {
                        "block": b.get("name"),
                        "name": ex.get("exercise_name"),
                        "volume": ex.get("volume"),
                        "rest": ex.get("rest"),
                        "notes": ex.get("notes"),
                    }
                    for b in blocks
                    for ex in (b.get("exercises") or [])
                ]
                results.append({
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "disciplines": w.get("primary_disciplines", []),
                    "total_exercises": total_exercises,
                    "exercises": exercises
                })

            return {
                "success": True,
                "count": len(results),
                "total_matching": total_matching,
                "truncated": total_matching > len(results),
                "filter_used": {
                    "include_common": include_common,
                    "name": args.get("name"),
                    "discipline": args.get("discipline"),
                    "difficulty_level": args.get("difficulty_level"),
                    "limit": limit,
                },
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error listing workout templates: {e}")
            return {"success": False, "message": str(e)}

    async def delete_workout_template(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Delete the user's own workout templates (never common/public ones).

        Two-step: without confirm=true this only previews what would be deleted
        (and which keep_only names matched nothing). Matching is case-insensitive.
        """
        try:
            user_oid = ObjectId(user_id)
            # Only the user's own templates are ever eligible.
            own_filter: Dict[str, Any] = {"createdBy": user_oid, "isCommon": {"$ne": True}}

            keep_only = [str(n).strip() for n in (args.get("keep_only") or []) if str(n).strip()]
            template_id = args.get("template_id")
            name = (args.get("name") or "").strip()

            if not (keep_only or template_id or name):
                return {"success": False,
                        "message": "Tell me which template(s) to delete: a template_id, a name, or keep_only=[names to keep]."}

            own = await self.db.predefinedworkouts.find(
                own_filter, {"name": 1, "createdAt": 1}
            ).to_list(None)

            unmatched_keeps: List[str] = []
            if keep_only:
                keep_lower = {k.lower() for k in keep_only}
                matched_keeps = {t["name"].lower() for t in own if t.get("name", "").lower() in keep_lower}
                unmatched_keeps = [k for k in keep_only if k.lower() not in matched_keeps]
                targets = [t for t in own if t.get("name", "").lower() not in keep_lower]
            elif template_id:
                try:
                    tid = ObjectId(template_id)
                except Exception:
                    return {"success": False, "message": "Invalid template_id."}
                targets = [t for t in own if t["_id"] == tid]
            else:
                targets = [t for t in own if t.get("name", "").lower() == name.lower()]

            if not targets:
                return {"success": True, "deleted": 0,
                        "message": "No matching templates of yours found (common/public templates can't be deleted)."}

            # Calendar events reference these templates instead of embedding
            # exercises — a template with upcoming scheduled events can't be
            # deleted or those sessions would go empty.
            referenced: List[Dict[str, Any]] = []
            deletable: List[Dict[str, Any]] = []
            for t in targets:
                refs = await self.db.calendarevents.count_documents({
                    "workoutTemplateId": t["_id"],
                    "status": {"$in": ["scheduled", "in_progress"]},
                })
                if refs > 0:
                    referenced.append({"id": str(t["_id"]), "name": t.get("name", ""), "upcoming_events": refs})
                else:
                    deletable.append(t)

            preview = [{"id": str(t["_id"]), "name": t.get("name", "")} for t in deletable]

            if not deletable:
                names = ", ".join(f"{r['name']} ({r['upcoming_events']} upcoming)" for r in referenced)
                return {"success": False, "skipped_referenced": referenced,
                        "message": (f"Can't delete — still scheduled on the calendar: {names}. "
                                    "Delete or reschedule those events first.")}

            if not args.get("confirm", False):
                msg = f"This would delete {len(deletable)} template(s): " + ", ".join(t["name"] for t in preview) + "."
                if referenced:
                    names = ", ".join(f"{r['name']} ({r['upcoming_events']} upcoming)" for r in referenced)
                    msg += f" Skipping (scheduled on the calendar): {names}."
                if unmatched_keeps:
                    msg += (f" ⚠️ Note: keep name(s) {unmatched_keeps} matched nothing in your library — "
                            "double-check them before confirming.")
                msg += " Confirm to delete."
                return {"success": True, "needs_confirmation": True, "would_delete": preview,
                        "skipped_referenced": referenced,
                        "unmatched_keep_names": unmatched_keeps, "message": msg}

            result = await self.db.predefinedworkouts.delete_many(
                {**own_filter, "_id": {"$in": [t["_id"] for t in deletable]}}
            )
            logger.info(f"Deleted {result.deleted_count} workout template(s) for user {user_id}")
            msg = f"Deleted {result.deleted_count} template(s): " + ", ".join(t["name"] for t in preview) + "."
            if referenced:
                names = ", ".join(f"{r['name']} ({r['upcoming_events']} upcoming)" for r in referenced)
                msg += f" Skipped (scheduled on the calendar): {names}."
            return {"success": True, "deleted": result.deleted_count,
                    "skipped_referenced": referenced, "message": msg}

        except Exception as e:
            logger.error(f"Error deleting workout template: {e}")
            return {"success": False, "message": str(e)}

    async def log_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Log a workout to the user's workout history"""
        try:
            # Get exercise IDs for the exercises
            existing_exercises = await self.db.exercises.find(
                {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]},
                {"name": 1, "_id": 1}
            ).to_list(None)
            exercise_map = {ex["name"].lower(): ex["_id"] for ex in existing_exercises}

            # Process exercises
            formatted_exercises = []
            for i, ex in enumerate(args.get("exercises", [])):
                exercise_name = ex.get("exerciseName", "")
                exercise_id = exercise_map.get(exercise_name.lower())

                sets = []
                for s in ex.get("sets", []):
                    set_data = {
                        "targetReps": s.get("targetReps"),
                        "actualReps": s.get("actualReps"),
                        "weight": s.get("weight"),
                        "time": s.get("time"),
                        "rpe": s.get("rpe"),
                        "restSeconds": s.get("restSeconds", 60),
                        "notes": s.get("notes", ""),
                        "isCompleted": s.get("actualReps") is not None or s.get("time") is not None
                    }
                    sets.append(set_data)

                formatted_exercises.append({
                    "exerciseId": exercise_id,
                    "exerciseName": exercise_name,
                    "order": i,
                    "sets": sets,
                    "notes": ex.get("notes", "")
                })

            # Parse date or use today
            workout_date = datetime.utcnow()
            if args.get("date"):
                try:
                    workout_date = datetime.fromisoformat(args["date"].replace("Z", "+00:00"))
                except Exception:
                    pass

            workout_data = {
                "userId": ObjectId(user_id),
                "title": args["title"],
                "date": workout_date,
                "type": args.get("type", "strength"),
                "status": args.get("status", "completed"),
                "durationMinutes": args.get("durationMinutes"),
                "exercises": formatted_exercises,
                "totalStrain": 0,
                "muscleStrain": {
                    "chest": 0, "back": 0, "shoulders": 0,
                    "arms": 0, "legs": 0, "core": 0
                },
                "notes": args.get("notes", ""),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Link to plan if provided
            if args.get("planId"):
                try:
                    workout_data["planId"] = ObjectId(args["planId"])
                except Exception:
                    pass

            result = await self.db.workouts.insert_one(workout_data)

            if result.inserted_id:
                logger.info(f"Logged workout '{args['title']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Logged '{args['title']}' with {len(formatted_exercises)} exercises!",
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to log workout"}

        except Exception as e:
            logger.error(f"Error logging workout: {e}")
            return {"success": False, "message": str(e)}

    async def get_workout_history(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get user's workout history"""
        try:
            days = args.get("days", 30)
            start_date = datetime.utcnow() - timedelta(days=days)

            query: Dict[str, Any] = {
                "userId": ObjectId(user_id),
                "date": {"$gte": start_date}
            }

            if args.get("type"):
                query["type"] = args["type"]
            if args.get("status"):
                query["status"] = args["status"]

            limit = args.get("limit", 10)

            workouts = await self.db.workouts.find(
                query,
                {"title": 1, "date": 1, "type": 1, "status": 1, "durationMinutes": 1, "exercises": 1}
            ).sort("date", -1).limit(limit).to_list(None)

            results = []
            for w in workouts:
                raw_exercises = w.get("exercises") or []
                # Include the actual exercises with their sets (trimmed to the
                # meaningful fields) so the coach can reason about what the user
                # really did, not just how many exercises there were.
                exercises = [
                    {
                        "name": ex.get("exerciseName"),
                        "sets": [
                            {
                                "targetReps": s.get("targetReps"),
                                "actualReps": s.get("actualReps"),
                                "weight": s.get("weight"),
                                "rpe": s.get("rpe"),
                            }
                            for s in (ex.get("sets") or [])
                        ],
                        "notes": ex.get("notes"),
                    }
                    for ex in raw_exercises
                ]
                results.append({
                    "id": str(w["_id"]),
                    "title": w["title"],
                    "date": w["date"].isoformat() if w.get("date") else None,
                    "type": w.get("type"),
                    "status": w.get("status"),
                    "duration": w.get("durationMinutes"),
                    "exercise_count": len(raw_exercises),
                    "exercises": exercises
                })

            return {
                "success": True,
                "count": len(results),
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error getting workout history: {e}")
            return {"success": False, "message": str(e)}
