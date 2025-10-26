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
                    "description": "Create a new workout plan. The system will automatically check for existing exercises and create any missing ones.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Workout name (e.g., 'Upper Body Strength', 'HIIT Cardio')"
                            },
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {
                                            "type": "string",
                                            "description": "Exercise name (e.g., 'Push-ups', 'Squats')"
                                        },
                                        "sets": {
                                            "type": "integer",
                                            "description": "Number of sets (default: 3)"
                                        },
                                        "reps": {
                                            "type": "integer",
                                            "description": "Number of reps per set (default: 10)"
                                        },
                                        "weight": {
                                            "type": "number",
                                            "description": "Weight in kg (optional)"
                                        },
                                        "duration": {
                                            "type": "integer",
                                            "description": "Duration in seconds for time-based exercises (optional)"
                                        },
                                        "restTime": {
                                            "type": "integer",
                                            "description": "Rest time between sets in seconds (default: 60)"
                                        },
                                        "muscles": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                            "description": "Target muscles (used if exercise needs to be created)"
                                        },
                                        "equipment": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                            "description": "Required equipment (used if exercise needs to be created)"
                                        },
                                        "notes": {
                                            "type": "string",
                                            "description": "Additional notes or instructions"
                                        }
                                    },
                                    "required": ["name"]
                                },
                                "description": "List of exercises. System will match existing exercises by name or create new ones."
                            },
                            "duration": {
                                "type": "integer",
                                "description": "Estimated duration in minutes (default: 45)"
                            },
                            "description": {
                                "type": "string",
                                "description": "Workout description"
                            },
                            "type": {
                                "type": "string",
                                "enum": ["strength", "cardio", "hiit", "flexibility", "mixed"],
                                "description": "Type of workout (default: strength)"
                            }
                        },
                        "required": ["name", "exercises"]
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
            },
            {
                "type": "function",
                "function": {
                    "name": "update_goal",
                    "description": "Update an existing fitness goal for the current user",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "goal_id": {"type": "string", "description": "The ID of the goal to update"},
                            "name": {"type": "string"},
                            "target": {"type": "number"},
                            "current": {"type": "number"},
                            "deadline": {"type": "string", "description": "ISO date string"},
                            "description": {"type": "string"},
                            "isActive": {"type": "boolean"}
                        },
                        "required": ["goal_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "update_plan",
                    "description": "Update a training plan for the current user (top-level fields and schedule)",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "plan_id": {"type": "string", "description": "The ID of the plan to update"},
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "status": {"type": "string", "enum": ["draft", "active", "paused", "completed", "abandoned"]},
                            "startDate": {"type": "string", "description": "ISO date string"},
                            "goalId": {"type": "string"},
                            "schedule": {
                                "type": "object",
                                "properties": {
                                    "weeksTotal": {"type": "integer", "minimum": 1, "maximum": 52},
                                    "workoutsPerWeek": {"type": "integer", "minimum": 1, "maximum": 7},
                                    "restDays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}},
                                    "preferredWorkoutDays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}}
                                }
                            }
                        },
                        "required": ["plan_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_plan_workout",
                    "description": "Add a weekly workout to a specific week of a plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "plan_id": {"type": "string"},
                            "weekNumber": {"type": "integer", "minimum": 1},
                            "dayOfWeek": {"type": "integer", "minimum": 0, "maximum": 6},
                            "workoutType": {"type": "string", "enum": ["predefined", "custom"]},
                            "predefinedWorkoutId": {"type": "string", "description": "Required if workoutType is 'predefined'"},
                            "customWorkout": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "type": {"type": "string", "enum": ["strength", "cardio", "hybrid", "recovery", "hiit"]},
                                    "durationMinutes": {"type": "integer"},
                                    "exercises": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "exerciseId": {"type": "string"},
                                                "exerciseName": {"type": "string"},
                                                "sets": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object",
                                                        "properties": {
                                                            "reps": {"type": "integer"},
                                                            "time": {"type": "integer"},
                                                            "weight": {"type": "number"},
                                                            "restSeconds": {"type": "integer"}
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            "notes": {"type": "string"},
                            "isOptional": {"type": "boolean"}
                        },
                        "required": ["plan_id", "weekNumber", "dayOfWeek", "workoutType"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "remove_plan_workout",
                    "description": "Remove a weekly workout from a specific week of a plan",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "plan_id": {"type": "string"},
                            "weekNumber": {"type": "integer", "minimum": 1},
                            "workoutIndex": {"type": "integer", "description": "Index of the workout to remove within the week's workouts array"},
                            "weeklyWorkoutId": {"type": "string", "description": "Alternatively, the _id of the weekly workout subdocument"}
                        },
                        "required": ["plan_id", "weekNumber"]
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

When users ask to add exercises (like "add muscle ups to my exercises"), use add_exercise.
When they want to create workouts or goals, use create_workout or create_goal.
When they want to update an existing goal, use update_goal.
When they want to update a plan's details (name, status, start date, schedule), use update_plan.
When they want to add or remove weekly workouts in a plan, use add_plan_workout or remove_plan_workout.
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
                    elif function_name == "update_goal":
                        result = await self._update_goal(user_id, function_args)
                    elif function_name == "update_plan":
                        result = await self._update_plan(user_id, function_args)
                    elif function_name == "add_plan_workout":
                        result = await self._add_plan_workout(user_id, function_args)
                    elif function_name == "remove_plan_workout":
                        result = await self._remove_plan_workout(user_id, function_args)
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
        """Create a workout with proper exercise references"""
        try:
            # 1. First get all available exercises (just names and IDs for efficiency)
            existing_exercises = await self.db.exercises.find(
                {},
                {"name": 1, "_id": 1}
            ).to_list(None)
            
            exercise_map = {ex["name"].lower(): ex["_id"] for ex in existing_exercises}
            logger.info(f"Found {len(exercise_map)} existing exercises")
            
            # 2. Process the exercises from the args
            workout_exercises = []
            exercises_to_add = []
            
            for i, exercise_info in enumerate(args.get("exercises", [])):
                exercise_name = exercise_info.get("name") or exercise_info.get("exerciseName") or f"Exercise {i+1}"
                exercise_name_lower = exercise_name.lower()
                
                # Check if exercise exists
                if exercise_name_lower in exercise_map:
                    exercise_id = exercise_map[exercise_name_lower]
                    logger.info(f"Found existing exercise: {exercise_name}")
                else:
                    # Need to create this exercise
                    logger.info(f"Need to create new exercise: {exercise_name}")
                    exercises_to_add.append({
                        "name": exercise_name,
                        "muscles": exercise_info.get("muscles", ["Full Body"]),
                        "equipment": exercise_info.get("equipment", []),
                        "description": exercise_info.get("description", f"{exercise_name} exercise")
                    })
                    exercise_id = None  # Will be set after creation
                
                # Prepare exercise data for workout
                workout_exercise = {
                    "exerciseId": exercise_id,  # Will update after creating missing exercises
                    "exerciseName": exercise_name,
                    "sets": exercise_info.get("sets", 3),
                    "reps": exercise_info.get("reps", 10),
                    "weight": exercise_info.get("weight"),
                    "duration": exercise_info.get("duration"),
                    "restTime": exercise_info.get("restTime", 60),
                    "notes": exercise_info.get("notes", "")
                }
                workout_exercises.append(workout_exercise)
            
            # 3. Add any missing exercises to the database
            for ex_to_add in exercises_to_add:
                exercise_data = {
                    "name": ex_to_add["name"],
                    "description": ex_to_add["description"],
                    "muscles": ex_to_add["muscles"],
                    "secondaryMuscles": [],
                    "discipline": ["General Fitness"],
                    "equipment": ex_to_add["equipment"],
                    "difficulty": "intermediate",
                    "instructions": [f"Perform {ex_to_add['name']} with proper form"],
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
                    logger.info(f"Created new exercise: {ex_to_add['name']}")
                    # Update the exercise_id in workout_exercises
                    for workout_ex in workout_exercises:
                        if workout_ex["exerciseName"].lower() == ex_to_add["name"].lower():
                            workout_ex["exerciseId"] = result.inserted_id
            
            # 4. Create the workout with proper exercise references
            # Transform exercises to match the schema
            formatted_exercises = []
            for i, workout_ex in enumerate(workout_exercises):
                # Create sets array with proper structure
                sets_array = []
                num_sets = workout_ex.get("sets", 3)
                reps = workout_ex.get("reps", 10)
                rest_time = workout_ex.get("restTime", 60)
                
                for _ in range(num_sets):
                    sets_array.append({
                        "reps": reps,
                        "restSeconds": rest_time
                    })
                
                formatted_exercises.append({
                    "exerciseId": workout_ex["exerciseId"],
                    "exerciseName": workout_ex["exerciseName"],
                    "order": i,
                    "sets": sets_array,
                    "notes": workout_ex.get("notes", f"Perform {workout_ex['exerciseName']} with controlled form")
                })
            
            # Determine target muscles from all exercises
            target_muscles = set()
            # Get muscles from new exercises
            for ex_to_add in exercises_to_add:
                target_muscles.update(ex_to_add.get("muscles", []))
            # Get muscles from existing exercises (need to fetch them)
            for workout_ex in workout_exercises:
                if workout_ex.get("exerciseId"):
                    # Could fetch exercise details here if needed
                    pass
            if not target_muscles:
                target_muscles = ["Full Body"]
            
            workout_data = {
                "title": args["name"],  # Use 'title' instead of 'name'
                "description": args.get("description", ""),
                "type": args.get("type", "strength"),
                "difficulty": "intermediate",  # Default difficulty
                "durationMinutes": args.get("duration", 45),
                "targetMuscles": list(target_muscles),
                "equipment": [],  # Could be extracted from exercises
                "exercises": formatted_exercises,
                "isCommon": False,  # User-created workouts are not common
                "createdBy": ObjectId(user_id),
                "tags": [],
                "popularity": 0,
                "ratings": {
                    "average": 0,
                    "count": 0
                },
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
                "__v": 0
            }
            
            result = await self.db.predefinedworkouts.insert_one(workout_data)
            
            if result.inserted_id:
                added_count = len(exercises_to_add)
                if added_count > 0:
                    return {
                        "success": True, 
                        "message": f"✅ Created workout '{args['name']}' with {len(formatted_exercises)} exercises! (Added {added_count} new exercises to your library)"
                    }
                else:
                    return {
                        "success": True,
                        "message": f"✅ Created workout '{args['name']}' with {len(formatted_exercises)} exercises!"
                    }
            else:
                return {"success": False, "message": "Failed to create workout"}
                
        except Exception as e:
            logger.error(f"Error creating workout: {e}")
            return {"success": False, "message": str(e)}
    
    async def _create_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a goal"""
        try:
            goal_data = {
                "userId": ObjectId(user_id),
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

    async def _update_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing goal for the current user"""
        try:
            goal_id = args.get("goal_id")
            if not goal_id:
                return {"success": False, "message": "Missing required parameter: goal_id"}

            # Build changes payload
            allowed_fields = ["name", "target", "current", "deadline", "description", "isActive"]
            updates: Dict[str, Any] = {k: v for k, v in args.items() if k in allowed_fields and v is not None}
            updates["updatedAt"] = datetime.utcnow()

            result = await self.db.goals.update_one(
                {"_id": ObjectId(goal_id), "userId": ObjectId(user_id)},
                {"$set": updates}
            )

            if result.modified_count > 0:
                return {"success": True, "message": "✅ Updated goal successfully!"}
            else:
                return {"success": False, "message": "Goal not found or no changes made"}
        except Exception as e:
            logger.error(f"Error updating goal: {e}")
            return {"success": False, "message": str(e)}

    async def _update_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
                return {"success": True, "message": "✅ Updated plan successfully!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error updating plan: {e}")
            return {"success": False, "message": str(e)}

    async def _add_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
                return {"success": True, "message": "✅ Added workout to plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error adding plan workout: {e}")
            return {"success": False, "message": str(e)}

    async def _remove_plan_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
                return {"success": True, "message": "✅ Removed workout from plan week!"}
            else:
                return {"success": False, "message": "No changes applied"}
        except Exception as e:
            logger.error(f"Error removing plan workout: {e}")
            return {"success": False, "message": str(e)}