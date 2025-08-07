from typing import Dict, Any
from datetime import datetime
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = structlog.get_logger()


class CRUDService:
    """Service for direct CRUD operations on the database"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_exercise(
        self,
        user_id: str,
        exercise_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new exercise directly"""
        try:
            # Add metadata with correct field names
            exercise_data["createdBy"] = ObjectId(user_id)
            exercise_data["createdAt"] = datetime.utcnow()
            exercise_data["updatedAt"] = datetime.utcnow()
            exercise_data["isCommon"] = False  # User-created exercises are private
            exercise_data["__v"] = 0  # Version field for mongoose compatibility
            
            # Ensure correct field names
            if "targetMuscles" in exercise_data:
                exercise_data["muscles"] = exercise_data.pop("targetMuscles")
            
            # Insert into MongoDB
            result = await self.db.exercises.insert_one(exercise_data)
            
            if result.inserted_id:
                exercise_data["_id"] = str(result.inserted_id)
                exercise_data["createdBy"] = str(exercise_data["createdBy"])
                exercise_data["createdAt"] = exercise_data["createdAt"].isoformat()
                exercise_data["updatedAt"] = exercise_data["updatedAt"].isoformat()
                
                logger.info(f"Successfully created exercise {exercise_data['name']} with ID {exercise_data['_id']}")
                
                return {
                    "success": True,
                    "message": f"✅ Successfully added {exercise_data['name']} to your exercises!",
                    "created_id": str(result.inserted_id),
                    "exercise": exercise_data
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to create exercise"
                }
                
        except Exception as e:
            logger.error(f"Failed to create exercise: {e}")
            return {
                "success": False,
                "message": f"Error creating exercise: {str(e)}"
            }
    
    async def create_workout(
        self,
        user_id: str,
        workout_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new workout directly"""
        try:
            workout_data["userId"] = ObjectId(user_id)
            workout_data["createdAt"] = datetime.utcnow()
            workout_data["updatedAt"] = datetime.utcnow()
            
            result = await self.db.predefinedworkouts.insert_one(workout_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Created workout '{workout_data['name']}'!",
                    "created_id": str(result.inserted_id)
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to create workout"
                }
                
        except Exception as e:
            logger.error(f"Failed to create workout: {e}")
            return {
                "success": False,
                "message": f"Error creating workout: {str(e)}"
            }
    
    async def create_goal(
        self,
        user_id: str,
        goal_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new goal directly"""
        try:
            goal_data["userId"] = ObjectId(user_id)
            goal_data["createdAt"] = datetime.utcnow()
            goal_data["updatedAt"] = datetime.utcnow()
            goal_data["isActive"] = True
            
            result = await self.db.goals.insert_one(goal_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Created goal '{goal_data['name']}'!",
                    "created_id": str(result.inserted_id)
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to create goal"
                }
                
        except Exception as e:
            logger.error(f"Failed to create goal: {e}")
            return {
                "success": False,
                "message": f"Error creating goal: {str(e)}"
            }
    
    async def update_goal(
        self,
        user_id: str,
        goal_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update an existing goal"""
        try:
            updates["updatedAt"] = datetime.utcnow()
            
            result = await self.db.goals.update_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )
            
            if result.modified_count > 0:
                return {
                    "success": True,
                    "message": "✅ Updated goal successfully!"
                }
            else:
                return {
                    "success": False,
                    "message": "Goal not found or no changes made"
                }
                
        except Exception as e:
            logger.error(f"Failed to update goal: {e}")
            return {
                "success": False,
                "message": f"Error updating goal: {str(e)}"
            }
    
    async def delete_exercise(
        self,
        user_id: str,
        exercise_id: str
    ) -> Dict[str, Any]:
        """Delete an exercise"""
        try:
            result = await self.db.exercises.delete_one({
                "_id": ObjectId(exercise_id),
                "createdBy": ObjectId(user_id)
            })
            
            if result.deleted_count > 0:
                return {
                    "success": True,
                    "message": "✅ Exercise deleted successfully!"
                }
            else:
                return {
                    "success": False,
                    "message": "Exercise not found or unauthorized"
                }
                
        except Exception as e:
            logger.error(f"Failed to delete exercise: {e}")
            return {
                "success": False,
                "message": f"Error deleting exercise: {str(e)}"
            }