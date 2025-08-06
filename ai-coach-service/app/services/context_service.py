from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from bson import ObjectId
import structlog

logger = structlog.get_logger()


class ContextService:
    """Service for loading user context from MongoDB"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_user_context(self, user_id: str) -> Dict[str, Any]:
        """
        Load user context including profile, goals, and recent workouts
        """
        try:
            # Convert string ID to ObjectId for MongoDB query
            user_oid = ObjectId(user_id)
            
            # Load user profile
            user = await self.db.users.find_one({"_id": user_oid})
            if not user:
                logger.warning(f"User not found: {user_id}")
                return {}
            
            # Load user's goals
            goals = await self.db.goals.find(
                {"userId": user_oid, "isActive": True}
            ).to_list(10)
            
            # Load recent workouts (last 7 days)
            week_ago = datetime.utcnow() - timedelta(days=7)
            recent_workouts = await self.db.workouts.find(
                {
                    "userId": user_oid,
                    "date": {"$gte": week_ago}
                }
            ).sort("date", -1).to_list(20)
            
            # Format context
            context = {
                "user_id": user_id,
                "fitness_level": user.get("fitnessLevel", "intermediate"),
                "goals": [g.get("name", "") for g in goals if g.get("name")],
                "recent_workouts": [
                    {
                        "date": w.get("date").isoformat() if w.get("date") else None,
                        "type": w.get("type"),
                        "duration": w.get("duration"),
                        "exercises_count": len(w.get("exercises", []))
                    }
                    for w in recent_workouts
                ],
                "preferences": user.get("preferences", {}),
                "equipment": user.get("availableEquipment", [])
            }
            
            return context
            
        except Exception as e:
            logger.error(f"Error loading user context: {e}")
            return {}
    
    async def get_user_exercises(
        self, 
        user_id: str, 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get exercises available to the user (both common and private)
        """
        try:
            user_oid = ObjectId(user_id)
            
            # Get both common exercises and user's private exercises
            exercises = await self.db.exercises.find(
                {
                    "$or": [
                        {"isCommon": True},
                        {"createdBy": user_oid}
                    ]
                }
            ).limit(limit).to_list(limit)
            
            return exercises
            
        except Exception as e:
            logger.error(f"Error loading exercises: {e}")
            return []
    
    async def get_workout_history(
        self, 
        user_id: str, 
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get user's workout history for the specified number of days
        """
        try:
            user_oid = ObjectId(user_id)
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            workouts = await self.db.workouts.find(
                {
                    "userId": user_oid,
                    "date": {"$gte": cutoff_date}
                }
            ).sort("date", -1).to_list(100)
            
            return workouts
            
        except Exception as e:
            logger.error(f"Error loading workout history: {e}")
            return []