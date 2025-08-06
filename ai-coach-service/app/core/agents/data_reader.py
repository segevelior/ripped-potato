from typing import Dict, Any, List
from app.core.agents.base import BaseAgent
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timedelta
import json
import structlog

logger = structlog.get_logger()


class DataReaderAgent(BaseAgent):
    """Agent responsible for reading and formatting user data for context"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        super().__init__(
            name="DataReaderAgent",
            description="Reads and formats user workout data, exercises, and goals"
        )
        self.db = db
    
    async def process(
        self, 
        message: str, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Read relevant data based on the message intent
        Returns formatted data for use by other agents
        """
        user_id = context.get("user_id")
        if not user_id:
            return {"error": "No user ID provided"}
        
        # Determine what data to load based on message
        data_needs = await self._analyze_data_needs(message)
        
        result = {
            "user_profile": None,
            "exercises": [],
            "workouts": [],
            "goals": [],
            "formatted_context": ""
        }
        
        # Load requested data
        if data_needs.get("profile"):
            result["user_profile"] = await self._load_user_profile(user_id)
        
        if data_needs.get("exercises"):
            result["exercises"] = await self._load_exercises(
                user_id, 
                muscle_groups=data_needs.get("muscle_groups"),
                equipment=data_needs.get("equipment")
            )
        
        if data_needs.get("workouts"):
            result["workouts"] = await self._load_recent_workouts(
                user_id,
                days=data_needs.get("days", 30)
            )
        
        if data_needs.get("goals"):
            result["goals"] = await self._load_goals(user_id)
        
        # Format for LLM context
        result["formatted_context"] = await self._format_for_llm(result)
        
        return result
    
    async def _analyze_data_needs(self, message: str) -> Dict[str, Any]:
        """Analyze what data is needed based on the message"""
        message_lower = message.lower()
        
        needs = {
            "profile": True,  # Always load profile
            "exercises": False,
            "workouts": False,
            "goals": False,
            "muscle_groups": [],
            "equipment": [],
            "days": 30
        }
        
        # Check for exercise-related queries
        exercise_keywords = ["exercise", "movement", "form", "how to", "show me", "alternatives"]
        if any(keyword in message_lower for keyword in exercise_keywords):
            needs["exercises"] = True
        
        # Check for workout-related queries
        workout_keywords = ["workout", "routine", "program", "plan", "session", "training"]
        if any(keyword in message_lower for keyword in workout_keywords):
            needs["workouts"] = True
            needs["exercises"] = True
        
        # Check for goal-related queries
        goal_keywords = ["goal", "target", "achieve", "progress", "improve"]
        if any(keyword in message_lower for keyword in goal_keywords):
            needs["goals"] = True
        
        # Extract muscle groups
        muscle_groups = ["chest", "back", "shoulders", "arms", "biceps", "triceps", 
                        "legs", "quads", "hamstrings", "glutes", "abs", "core"]
        for muscle in muscle_groups:
            if muscle in message_lower:
                needs["muscle_groups"].append(muscle)
        
        # Extract equipment
        equipment_items = ["dumbbell", "barbell", "cable", "machine", "bodyweight", 
                          "resistance band", "kettlebell", "pull-up bar"]
        for item in equipment_items:
            if item in message_lower:
                needs["equipment"].append(item)
        
        return needs
    
    async def _load_user_profile(self, user_id: str) -> Dict[str, Any]:
        """Load user profile data"""
        try:
            user_oid = ObjectId(user_id)
            user = await self.db.users.find_one({"_id": user_oid})
            
            if not user:
                return {}
            
            return {
                "fitness_level": user.get("fitnessLevel", "intermediate"),
                "experience": user.get("experience"),
                "age": user.get("age"),
                "weight": user.get("weight"),
                "height": user.get("height"),
                "preferences": user.get("preferences", {}),
                "available_equipment": user.get("availableEquipment", [])
            }
        except Exception as e:
            logger.error(f"Error loading user profile: {e}")
            return {}
    
    async def _load_exercises(
        self, 
        user_id: str,
        muscle_groups: List[str] = None,
        equipment: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Load exercises based on filters"""
        try:
            user_oid = ObjectId(user_id)
            
            # Build query
            query = {
                "$or": [
                    {"isCommon": True},
                    {"createdBy": user_oid}
                ]
            }
            
            # Add muscle group filter
            if muscle_groups:
                query["$and"] = query.get("$and", [])
                query["$and"].append({
                    "$or": [
                        {"targetMuscles": {"$in": muscle_groups}},
                        {"muscleGroups": {"$in": muscle_groups}}
                    ]
                })
            
            # Add equipment filter
            if equipment:
                query["equipment"] = {"$in": equipment}
            
            # Limit to 20 most relevant exercises
            exercises = await self.db.exercises.find(query).limit(20).to_list(20)
            
            # Format exercises for context
            formatted = []
            for ex in exercises:
                formatted.append({
                    "name": ex.get("name"),
                    "target_muscles": ex.get("targetMuscles", []),
                    "equipment": ex.get("equipment"),
                    "difficulty": ex.get("difficulty"),
                    "description": ex.get("description", "")[:200]  # Limit description length
                })
            
            return formatted
            
        except Exception as e:
            logger.error(f"Error loading exercises: {e}")
            return []
    
    async def _load_recent_workouts(
        self, 
        user_id: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """Load recent workout history"""
        try:
            user_oid = ObjectId(user_id)
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            workouts = await self.db.workouts.find(
                {
                    "userId": user_oid,
                    "date": {"$gte": cutoff_date}
                }
            ).sort("date", -1).limit(10).to_list(10)
            
            # Format workouts
            formatted = []
            for workout in workouts:
                formatted.append({
                    "date": workout.get("date").isoformat() if workout.get("date") else None,
                    "type": workout.get("type"),
                    "name": workout.get("name"),
                    "duration": workout.get("duration"),
                    "exercises_count": len(workout.get("exercises", [])),
                    "muscle_groups": workout.get("targetMuscles", [])
                })
            
            return formatted
            
        except Exception as e:
            logger.error(f"Error loading workouts: {e}")
            return []
    
    async def _load_goals(self, user_id: str) -> List[Dict[str, Any]]:
        """Load user's active goals"""
        try:
            user_oid = ObjectId(user_id)
            
            goals = await self.db.goals.find(
                {
                    "userId": user_oid,
                    "isActive": True
                }
            ).limit(5).to_list(5)
            
            # Format goals
            formatted = []
            for goal in goals:
                formatted.append({
                    "name": goal.get("name"),
                    "type": goal.get("type"),
                    "target": goal.get("target"),
                    "current": goal.get("current"),
                    "deadline": goal.get("deadline").isoformat() if goal.get("deadline") else None
                })
            
            return formatted
            
        except Exception as e:
            logger.error(f"Error loading goals: {e}")
            return []
    
    async def _format_for_llm(self, data: Dict[str, Any]) -> str:
        """Format all loaded data into a concise context string for LLM"""
        sections = []
        
        # User profile
        if data.get("user_profile"):
            profile = data["user_profile"]
            sections.append(f"User Profile: {profile.get('fitness_level', 'Unknown')} level")
            if profile.get("available_equipment"):
                sections.append(f"Equipment: {', '.join(profile['available_equipment'][:5])}")
        
        # Goals
        if data.get("goals"):
            goal_names = [g["name"] for g in data["goals"][:3]]
            sections.append(f"Active Goals: {', '.join(goal_names)}")
        
        # Recent workouts
        if data.get("workouts"):
            recent_count = len(data["workouts"])
            if recent_count > 0:
                last_workout = data["workouts"][0]
                sections.append(f"Recent Activity: {recent_count} workouts in last 30 days")
                sections.append(f"Last Workout: {last_workout['type']} ({last_workout['exercises_count']} exercises)")
        
        # Available exercises
        if data.get("exercises"):
            sections.append(f"Found {len(data['exercises'])} relevant exercises")
            # List first 5 exercise names
            exercise_names = [ex["name"] for ex in data["exercises"][:5]]
            sections.append(f"Examples: {', '.join(exercise_names)}")
        
        return "\n".join(sections) if sections else "No relevant data found"