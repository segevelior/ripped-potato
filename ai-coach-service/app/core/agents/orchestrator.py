"""
Simplified Agent Orchestrator - Just OpenAI with function calling
"""

import json
from typing import Dict, Any, List
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent

logger = structlog.get_logger()


class AgentOrchestrator:
    """Simple orchestrator using OpenAI function calling"""
    
    def __init__(self, db: AsyncIOMotorDatabase, redis_client=None):
        self.db = db
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        self.data_reader = DataReaderAgent(db)
        
    def get_tools(self) -> List[Dict[str, Any]]:
        """Define available tools for the LLM"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "add_exercise",
                    "description": "Add a new exercise to the user's exercise database",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Exercise name (e.g., 'Muscle Ups', 'Dips', 'Pull-ups')"
                            },
                            "muscles": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Primary muscles worked (e.g., ['Chest', 'Triceps', 'Shoulders'])"
                            },
                            "discipline": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Disciplines (e.g., ['Calisthenics', 'Strength Training'])"
                            },
                            "difficulty": {
                                "type": "string",
                                "enum": ["beginner", "intermediate", "advanced"],
                                "description": "Difficulty level"
                            },
                            "equipment": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Equipment needed (e.g., ['Pull-up Bar', 'Dip Bars'] or ['None'])"
                            },
                            "description": {
                                "type": "string",
                                "description": "Description of the exercise"
                            }
                        },
                        "required": ["name", "muscles", "discipline", "difficulty"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_workout",
                    "description": "Create a new workout plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Workout name"
                            },
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "sets": {"type": "integer"},
                                        "reps": {"type": "integer"}
                                    }
                                },
                                "description": "List of exercises with sets and reps"
                            },
                            "duration": {
                                "type": "integer",
                                "description": "Duration in minutes"
                            }
                        },
                        "required": ["name", "exercises", "duration"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_goal",
                    "description": "Create a fitness goal",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Goal name (e.g., 'Learn Handstand', 'Do 10 Pull-ups')"
                            },
                            "category": {
                                "type": "string",
                                "enum": ["skill", "performance", "endurance", "strength"],
                                "description": "Goal category"
                            },
                            "target": {
                                "type": "number",
                                "description": "Target value if applicable"
                            }
                        },
                        "required": ["name", "category"]
                    }
                }
            }
        ]
    
    async def process_request(self, message: str, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Process user request with OpenAI function calling"""
        
        user_id = user_context.get("user_id")
        
        # Read user data for context
        logger.info(f"Processing request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)
        
        # Build context string
        context_str = f"""User has:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} workouts  
- {len(data_context.get('goals', []))} goals"""

        # System prompt
        system_prompt = """You are an expert AI fitness coach helping users manage their fitness journey.

When users ask to add exercises (like "add muscle ups to my exercises"), use the add_exercise function.
When they want to create workouts or goals, use the appropriate functions.
Be conversational and helpful. If a user says they can do an exercise, add it for them."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{context_str}\n\nUser: {message}"}
        ]
        
        try:
            # Call OpenAI with function calling
            response = await self.client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                tools=self.get_tools(),
                tool_choice="auto",
                temperature=0.7
            )
            
            response_message = response.choices[0].message
            
            # Handle tool calls
            if response_message.tool_calls:
                tool_results = []
                
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments)
                    
                    logger.info(f"Executing tool: {function_name}")
                    
                    # Execute the tool
                    if function_name == "add_exercise":
                        result = await self._add_exercise(user_id, function_args)
                    elif function_name == "create_workout":
                        result = await self._create_workout(user_id, function_args)
                    elif function_name == "create_goal":
                        result = await self._create_goal(user_id, function_args)
                    else:
                        result = {"error": f"Unknown function: {function_name}"}
                    
                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "result": result
                    })
                
                # Get final response with tool results
                messages.append(response_message)
                for tool_result in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_result["tool_call_id"],
                        "content": json.dumps(tool_result["result"])
                    })
                
                final_response = await self.client.chat.completions.create(
                    model="gpt-4-turbo-preview",
                    messages=messages,
                    temperature=0.7
                )
                
                return {
                    "message": final_response.choices[0].message.content,
                    "type": "tool_execution",
                    "confidence": 0.95
                }
            else:
                # No tool use, just conversation
                return {
                    "message": response_message.content,
                    "type": "conversation",
                    "confidence": 0.9
                }
                
        except Exception as e:
            logger.error(f"Error in orchestrator: {e}")
            # Fallback to simple response
            return {
                "message": "I encountered an error. Please try again.",
                "type": "error",
                "confidence": 0.5
            }
    
    async def _add_exercise(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add an exercise to the database"""
        try:
            exercise_data = {
                "name": args["name"],
                "description": args.get("description", f"{args['name']} exercise"),
                "muscles": args.get("muscles", ["Full Body"]),
                "secondaryMuscles": [],
                "discipline": args.get("discipline", ["General Fitness"]),
                "equipment": args.get("equipment", ["None"]),
                "difficulty": args.get("difficulty", "intermediate"),
                "instructions": [f"Perform {args['name']} with proper form"],
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
                logger.info(f"Added exercise {args['name']} for user {user_id}")
                return {"success": True, "message": f"✅ Added {args['name']} to your exercises!"}
            else:
                return {"success": False, "message": "Failed to add exercise"}
                
        except Exception as e:
            logger.error(f"Error adding exercise: {e}")
            return {"success": False, "message": str(e)}
    
    async def _create_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a workout"""
        try:
            workout_data = {
                "userId": user_id,
                "name": args["name"],
                "exercises": args["exercises"],
                "duration": args.get("duration", 45),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            result = await self.db.workouts.insert_one(workout_data)
            
            if result.inserted_id:
                return {"success": True, "message": f"✅ Created workout: {args['name']}"}
            else:
                return {"success": False, "message": "Failed to create workout"}
                
        except Exception as e:
            logger.error(f"Error creating workout: {e}")
            return {"success": False, "message": str(e)}
    
    async def _create_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a goal"""
        try:
            goal_data = {
                "userId": user_id,
                "name": args["name"],
                "category": args.get("category", "skill"),
                "target": args.get("target"),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }
            
            result = await self.db.goals.insert_one(goal_data)
            
            if result.inserted_id:
                return {"success": True, "message": f"✅ Created goal: {args['name']}"}
            else:
                return {"success": False, "message": "Failed to create goal"}
                
        except Exception as e:
            logger.error(f"Error creating goal: {e}")
            return {"success": False, "message": str(e)}