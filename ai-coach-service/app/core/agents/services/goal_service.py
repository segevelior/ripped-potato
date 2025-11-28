"""
Goal service - handles fitness goal operations
"""

from typing import Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import structlog

logger = structlog.get_logger()


class GoalService:
    """Service for fitness goal operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def create_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a fitness goal with target metrics"""
        try:
            goal_data = {
                "userId": ObjectId(user_id),
                "name": args["name"],
                "category": args.get("category", "skill"),
                "description": args.get("description", ""),
                "difficulty": args.get("difficulty", "intermediate"),
                "targetMetrics": args.get("targetMetrics", {}),
                "isActive": True,
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Parse deadline if provided
            if args.get("deadline"):
                try:
                    goal_data["deadline"] = datetime.fromisoformat(args["deadline"].replace("Z", "+00:00"))
                except Exception:
                    pass

            result = await self.db.goals.insert_one(goal_data)

            if result.inserted_id:
                logger.info(f"Created goal '{args['name']}' for user {user_id}")
                return {
                    "success": True,
                    "message": f"Created goal: '{args['name']}'!",
                    "goal_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create goal"}

        except Exception as e:
            logger.error(f"Error creating goal: {e}")
            return {"success": False, "message": str(e)}

    async def update_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing fitness goal"""
        try:
            goal_id = args.get("goal_id")
            if not goal_id:
                return {"success": False, "message": "Missing required parameter: goal_id"}

            # Build updates - support both old and new field names
            updates: Dict[str, Any] = {}

            if args.get("name"):
                updates["name"] = args["name"]
            if args.get("description"):
                updates["description"] = args["description"]
            if args.get("targetMetrics"):
                updates["targetMetrics"] = args["targetMetrics"]
            if args.get("isActive") is not None:
                updates["isActive"] = args["isActive"]
            if args.get("deadline"):
                try:
                    updates["deadline"] = datetime.fromisoformat(args["deadline"].replace("Z", "+00:00"))
                except Exception:
                    pass

            if not updates:
                return {"success": False, "message": "No valid fields to update"}

            updates["updatedAt"] = datetime.utcnow()

            result = await self.db.goals.update_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "Updated goal successfully!"}
            else:
                return {"success": False, "message": "Goal not found or no changes made"}

        except Exception as e:
            logger.error(f"Error updating goal: {e}")
            return {"success": False, "message": str(e)}

    async def list_goals(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List user's fitness goals"""
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}

            if args.get("category"):
                query["category"] = args["category"]
            if args.get("isActive") is not None:
                query["isActive"] = args["isActive"]

            goals = await self.db.goals.find(
                query,
                {"name": 1, "category": 1, "description": 1, "targetMetrics": 1, "deadline": 1, "isActive": 1}
            ).sort("createdAt", -1).to_list(None)

            results = []
            for g in goals:
                results.append({
                    "id": str(g["_id"]),
                    "name": g["name"],
                    "category": g.get("category"),
                    "description": g.get("description", ""),
                    "target_metrics": g.get("targetMetrics", {}),
                    "deadline": g["deadline"].isoformat() if g.get("deadline") else None,
                    "is_active": g.get("isActive", True)
                })

            return {
                "success": True,
                "count": len(results),
                "goals": results
            }

        except Exception as e:
            logger.error(f"Error listing goals: {e}")
            return {"success": False, "message": str(e)}
