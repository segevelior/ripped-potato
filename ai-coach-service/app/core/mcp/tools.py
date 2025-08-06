from typing import Dict, Any, List
from pydantic import BaseModel
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime

logger = structlog.get_logger()


class MCPTool(BaseModel):
    """Base class for MCP tools"""
    name: str
    description: str
    parameters: Dict[str, Any]


class FitnessCRUDTools:
    """MCP tools for direct CRUD operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        
    def get_tools(self) -> List[MCPTool]:
        """Return list of available MCP tools"""
        return [
            MCPTool(
                name="create_workout",
                description="Create a personalized workout plan",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name of the workout"},
                        "exercises": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "exerciseId": {"type": "string"},
                                    "sets": {"type": "integer"},
                                    "reps": {"type": "integer"},
                                    "weight": {"type": "number", "optional": True},
                                    "duration": {"type": "integer", "optional": True},
                                    "restTime": {"type": "integer", "optional": True}
                                }
                            }
                        },
                        "duration": {"type": "integer", "description": "Workout duration in minutes"},
                        "description": {"type": "string", "optional": True}
                    },
                    "required": ["name", "exercises", "duration"]
                }
            ),
            MCPTool(
                name="add_exercise",
                description="Add a new custom exercise to the user's library",
                parameters={
                    "type": "object", 
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "muscles": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Target muscle groups"
                        },
                        "discipline": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Exercise disciplines (e.g., ['Calisthenics', 'Strength Training'])"
                        },
                        "equipment": {
                            "type": "array", 
                            "items": {"type": "string"}
                        },
                        "difficulty": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced"]
                        },
                        "instructions": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "tips": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": ["name", "description", "muscles", "difficulty"]
                }
            ),
            MCPTool(
                name="update_goal",
                description="Update an existing fitness goal",
                parameters={
                    "type": "object",
                    "properties": {
                        "goal_id": {"type": "string"},
                        "name": {"type": "string", "optional": True},
                        "target": {"type": "number", "optional": True},
                        "deadline": {"type": "string", "optional": True},
                        "description": {"type": "string", "optional": True}
                    },
                    "required": ["goal_id"]
                }
            ),
            MCPTool(
                name="create_goal",
                description="Create a new fitness goal",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": ["weight_loss", "muscle_gain", "strength", "endurance", "custom"]
                        },
                        "target": {"type": "number"},
                        "current": {"type": "number", "optional": True},
                        "deadline": {"type": "string", "optional": True},
                        "description": {"type": "string", "optional": True}
                    },
                    "required": ["name", "type", "target"]
                }
            ),
            MCPTool(
                name="schedule_workout",
                description="Schedule a workout for a specific date",
                parameters={
                    "type": "object",
                    "properties": {
                        "workout_id": {"type": "string"},
                        "date": {"type": "string", "description": "ISO date string"},
                        "time": {"type": "string", "optional": True},
                        "notes": {"type": "string", "optional": True}
                    },
                    "required": ["workout_id", "date"]
                }
            )
        ]
    
    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Execute a specific MCP tool"""
        
        try:
            if tool_name == "create_workout":
                return await self._create_workout(parameters, user_id)
            elif tool_name == "add_exercise":
                return await self._add_exercise(parameters, user_id)
            elif tool_name == "update_goal":
                return await self._update_goal(parameters, user_id)
            elif tool_name == "create_goal":
                return await self._create_goal(parameters, user_id)
            elif tool_name == "schedule_workout":
                return await self._schedule_workout(parameters, user_id)
            else:
                raise ValueError(f"Unknown tool: {tool_name}")
                
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to execute {tool_name}"
            }
    
    async def _create_workout(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Create a new workout plan"""
        try:
            workout_data = {
                "userId": ObjectId(user_id),
                "name": params["name"],
                "exercises": params["exercises"],
                "duration": params["duration"],
                "description": params.get("description", f"Workout: {params['name']}"),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            result = await self.db.workouts.insert_one(workout_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Created workout '{params['name']}' with {len(params['exercises'])} exercises!",
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create workout"}
                
        except Exception as e:
            logger.error(f"Error creating workout: {e}")
            return {"success": False, "message": str(e)}
    
    async def _add_exercise(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Add a new exercise directly"""
        try:
            exercise_data = {
                "name": params["name"],
                "description": params["description"],
                "muscles": params["muscles"],  # Using correct field name
                "secondaryMuscles": [],
                "discipline": params.get("discipline", ["General Fitness"]),
                "equipment": params.get("equipment", []),
                "difficulty": params["difficulty"],
                "instructions": params.get("instructions", [f"Perform {params['name']} with proper form"]),
                "tips": params.get("tips", []),
                "strain": {
                    "intensity": "medium",
                    "durationType": "reps",
                    "typicalVolume": "3x10"
                },
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
                "__v": 0
            }
            
            result = await self.db.exercises.insert_one(exercise_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Added '{params['name']}' to your exercises!",
                    "exercise_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to add exercise"}
                
        except Exception as e:
            logger.error(f"Error adding exercise: {e}")
            return {"success": False, "message": str(e)}
    
    async def _create_goal(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Create a new goal directly"""
        try:
            goal_data = {
                "userId": ObjectId(user_id),
                "name": params["name"],
                "type": params["type"],
                "target": params["target"],
                "current": params.get("current", 0),
                "deadline": params.get("deadline"),
                "description": params.get("description"),
                "isActive": True,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            result = await self.db.goals.insert_one(goal_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Created {params['type']} goal '{params['name']}' with target {params['target']}!",
                    "goal_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create goal"}
                
        except Exception as e:
            logger.error(f"Error creating goal: {e}")
            return {"success": False, "message": str(e)}
    
    async def _update_goal(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Update an existing goal directly"""
        try:
            goal_id = params.pop("goal_id")
            changes = {k: v for k, v in params.items() if v is not None}
            changes["updatedAt"] = datetime.utcnow()
            
            result = await self.db.goals.update_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)},
                {"$set": changes}
            )
            
            if result.modified_count > 0:
                return {
                    "success": True,
                    "message": f"✅ Updated your goal successfully!"
                }
            else:
                return {"success": False, "message": "Goal not found or no changes made"}
                
        except Exception as e:
            logger.error(f"Error updating goal: {e}")
            return {"success": False, "message": str(e)}
    
    async def _schedule_workout(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Schedule a workout directly"""
        try:
            schedule_data = {
                "userId": ObjectId(user_id),
                "workoutId": ObjectId(params["workout_id"]),
                "date": params["date"],
                "time": params.get("time"),
                "notes": params.get("notes"),
                "status": "scheduled",
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            # You might want to create a schedules collection or add to workouts
            result = await self.db.scheduled_workouts.insert_one(schedule_data)
            
            if result.inserted_id:
                return {
                    "success": True,
                    "message": f"✅ Scheduled workout for {params['date']}!",
                    "schedule_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to schedule workout"}
                
        except Exception as e:
            logger.error(f"Error scheduling workout: {e}")
            return {"success": False, "message": str(e)}