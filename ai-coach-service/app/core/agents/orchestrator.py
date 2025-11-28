"""
Enhanced Agent Orchestrator - OpenAI with comprehensive fitness tools
"""

import json
from typing import Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timedelta
from tavily import TavilyClient

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.tool_definitions import get_all_tools

logger = structlog.get_logger()


class AgentOrchestrator:
    """Enhanced orchestrator with comprehensive fitness management tools"""

    def __init__(self, db: AsyncIOMotorDatabase, redis_client=None):
        self.db = db
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        self.data_reader = DataReaderAgent(db)
        
    def get_tools(self) -> List[Dict[str, Any]]:
        """Define available tools for the LLM - comprehensive fitness management"""
        return get_all_tools()


    async def process_request(self, message: str, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """Process user request with OpenAI function calling"""

        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Load user memories for personalization
        user_memories = await self._get_user_memories(user_id)

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        context_str = f"""USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'not specified'}
- Preferred Workout Duration: {user_profile.get('workoutDuration', 'not set')} minutes
- Workout Days per Week: {len(user_profile.get('workoutDays', []))}

USER DATA:
- {len(data_context.get('exercises', []))} exercises in library
- {len(data_context.get('workouts', []))} recent workouts
- {len(data_context.get('goals', []))} active goals
- {len(data_context.get('plans', []))} training plans"""

        # Add user memories to context
        if user_memories:
            memory_str = "\n\nUSER MEMORIES (important things to remember about this user):"
            for mem in user_memories[:15]:  # Limit to 15 most important memories
                category = mem.get("category", "general")
                content = mem.get("content", "")
                importance = mem.get("importance", "medium")
                prefix = "⚠️ " if importance == "high" else "• "
                memory_str += f"\n{prefix}[{category}] {content}"
            context_str += memory_str

        # Use the shared system prompt constant
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_str}\n\nUser: {message}"}
        ]

        try:
            # Call OpenAI with function calling
            response = await self.client.chat.completions.create(
                model=self.settings.openai_model,
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

                    # Execute the tool - route to appropriate handler
                    result = await self._execute_tool(user_id, function_name, function_args)

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
                    model=self.settings.openai_model,
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
            return {
                "message": "I encountered an error. Please try again.",
                "type": "error",
                "confidence": 0.5
            }

    def _get_tool_description(self, function_name: str, function_args: Dict[str, Any]) -> str:
        """Get user-friendly description for a tool call"""
        descriptions = {
            # Exercise tools
            "add_exercise": f"Adding {function_args.get('name', 'exercise')} to your library",
            "list_exercises": f"Searching exercises by {function_args.get('muscle', function_args.get('name', 'filter'))}",
            "grep_exercises": f"Searching for {', '.join(function_args.get('patterns', ['exercises'])[:3])}",
            "grep_workouts": f"Searching workouts: {', '.join(function_args.get('patterns', ['workouts'])[:3])}",
            # Workout template tools
            "create_workout_template": f"Creating workout template: {function_args.get('name', 'workout')}",
            "list_workout_templates": "Browsing workout templates",
            # Workout log tools
            "log_workout": f"Logging workout: {function_args.get('title', 'workout')}",
            "get_workout_history": "Fetching your workout history",
            # Plan tools
            "create_plan": f"Creating training plan: {function_args.get('name', 'plan')}",
            "list_plans": "Fetching your training plans",
            "update_plan": "Updating your training plan",
            "add_plan_workout": f"Adding workout to week {function_args.get('weekNumber', '')}",
            "remove_plan_workout": f"Removing workout from week {function_args.get('weekNumber', '')}",
            # Goal tools
            "create_goal": f"Setting up goal: {function_args.get('name', 'fitness goal')}",
            "update_goal": "Updating your fitness goal",
            "list_goals": "Fetching your fitness goals",
            # Calendar tools
            "schedule_to_calendar": f"Scheduling {function_args.get('title', 'event')} for {function_args.get('date', 'your calendar')}",
            "get_calendar_events": "Checking your calendar",
            # Web search
            "web_search": f"Searching the web for: {function_args.get('query', 'fitness info')}",
            # Memory
            "save_memory": f"Remembering: {function_args.get('content', 'information')[:50]}...",
            "delete_memory": f"Forgetting: {function_args.get('search_text', 'memory')}",
            "list_memories": "Listing what I remember about you",
            "update_memory": f"Updating memory about: {function_args.get('search_text', 'information')}"
        }
        return descriptions.get(function_name, f"Processing {function_name}")

    async def process_request_streaming(
        self,
        message: str,
        user_context: Dict[str, Any],
        conversation_history: List[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process user request with streaming, yielding events for real-time UI updates.

        Yields events:
        - {"type": "token", "content": "..."} - Individual response tokens
        - {"type": "tool_start", "tool": "...", "description": "..."} - Tool execution started
        - {"type": "tool_complete", "tool": "...", "success": bool, "message": "..."} - Tool finished
        - {"type": "complete", "full_response": "..."} - Stream finished
        - {"type": "error", "message": "..."} - Error occurred
        """
        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing streaming request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Load user memories for personalization
        user_memories = await self._get_user_memories(user_id)

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        context_str = f"""USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}

USER DATA:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} workouts
- {len(data_context.get('goals', []))} goals"""

        # Add user memories to context
        if user_memories:
            memory_str = "\n\nUSER MEMORIES (important things to remember about this user):"
            for mem in user_memories[:15]:  # Limit to 15 most important memories
                category = mem.get("category", "general")
                content = mem.get("content", "")
                importance = mem.get("importance", "medium")
                prefix = "⚠️ " if importance == "high" else "• "
                memory_str += f"\n{prefix}[{category}] {content}"
            context_str += memory_str

        # Build messages array with conversation history
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        # Add conversation history if available
        if conversation_history:
            for hist_msg in conversation_history:
                role = "user" if hist_msg.get("role") == "human" else "assistant"
                messages.append({
                    "role": role,
                    "content": hist_msg.get("content", "")
                })
            # Add current message without context prefix (history provides context)
            messages.append({"role": "user", "content": message})
        else:
            # First message - include context
            messages.append({"role": "user", "content": f"{context_str}\n\nUser: {message}"})

        # Track the full response
        full_response = []

        try:
            # Create streaming completion with tools
            logger.info(f"Calling OpenAI API with model: {self.settings.openai_model} and {len(self.get_tools())} tools")
            stream = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice="auto",
                temperature=0.7,
                max_tokens=2500,
                stream=True
            )

            tool_calls_data = {}  # Accumulate tool call chunks by index

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta

                # Stream content tokens
                if delta.content:
                    token = delta.content
                    full_response.append(token)
                    yield {"type": "token", "content": token}

                # Accumulate tool call chunks
                if delta.tool_calls:
                    for tool_call_chunk in delta.tool_calls:
                        index = tool_call_chunk.index
                        if index not in tool_calls_data:
                            tool_calls_data[index] = {
                                "id": "",
                                "function": {"name": "", "arguments": ""}
                            }

                        if tool_call_chunk.id:
                            tool_calls_data[index]["id"] = tool_call_chunk.id
                        if tool_call_chunk.function:
                            if tool_call_chunk.function.name:
                                tool_calls_data[index]["function"]["name"] += tool_call_chunk.function.name
                            if tool_call_chunk.function.arguments:
                                tool_calls_data[index]["function"]["arguments"] += tool_call_chunk.function.arguments

                # Check for finish reason
                if choice.finish_reason == "tool_calls" and tool_calls_data:
                    logger.info(f"Executing {len(tool_calls_data)} tool calls...")

                    # Add newline before tool execution
                    yield {"type": "token", "content": "\n\n"}

                    # Execute each tool call
                    tool_results = []
                    for index in sorted(tool_calls_data.keys()):
                        tool_data = tool_calls_data[index]
                        function_name = tool_data["function"]["name"]
                        function_args = json.loads(tool_data["function"]["arguments"])

                        logger.info(f"Executing {function_name} with args: {function_args}")

                        # Yield tool start event
                        tool_description = self._get_tool_description(function_name, function_args)
                        yield {
                            "type": "tool_start",
                            "tool": function_name,
                            "description": tool_description
                        }

                        # Execute tool
                        result = await self._execute_tool(user_id, function_name, function_args)

                        logger.info(f"Tool {function_name} result: {result}")

                        tool_results.append({
                            "tool_call_id": tool_data["id"],
                            "role": "tool",
                            "content": json.dumps(result)
                        })

                        # Yield tool complete event
                        yield {
                            "type": "tool_complete",
                            "tool": function_name,
                            "success": result.get("success", False),
                            "message": result.get("message", "")
                        }

                    # Build message history with tool results for final response
                    messages.append({
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tool_calls_data[i]["id"],
                                "type": "function",
                                "function": {
                                    "name": tool_calls_data[i]["function"]["name"],
                                    "arguments": tool_calls_data[i]["function"]["arguments"]
                                }
                            }
                            for i in sorted(tool_calls_data.keys())
                        ]
                    })

                    for tool_result in tool_results:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_result["tool_call_id"],
                            "content": tool_result["content"]
                        })

                    # Stream the final response after tool execution
                    logger.info("Getting final response after tool execution...")
                    final_stream = await self.client.chat.completions.create(
                        model=self.settings.openai_model,
                        messages=messages,
                        temperature=0.7,
                        max_tokens=500,
                        stream=True
                    )

                    async for final_chunk in final_stream:
                        final_choice = final_chunk.choices[0] if final_chunk.choices else None
                        if final_choice and final_choice.delta.content:
                            token = final_choice.delta.content
                            full_response.append(token)
                            yield {"type": "token", "content": token}

            # Yield completion event with full response
            yield {
                "type": "complete",
                "full_response": "".join(full_response)
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}

    async def _execute_tool(self, user_id: str, function_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Route tool calls to appropriate handlers"""
        tool_handlers = {
            # Exercise tools
            "add_exercise": self._add_exercise,
            "list_exercises": self._list_exercises,
            "grep_exercises": self._grep_exercises,
            "grep_workouts": self._grep_workouts,
            # Workout template tools
            "create_workout_template": self._create_workout_template,
            "list_workout_templates": self._list_workout_templates,
            # Workout log tools
            "log_workout": self._log_workout,
            "get_workout_history": self._get_workout_history,
            # Plan tools
            "create_plan": self._create_plan,
            "list_plans": self._list_plans,
            "update_plan": self._update_plan,
            "add_plan_workout": self._add_plan_workout,
            "remove_plan_workout": self._remove_plan_workout,
            # Goal tools
            "create_goal": self._create_goal,
            "update_goal": self._update_goal,
            "list_goals": self._list_goals,
            # Calendar tools
            "schedule_to_calendar": self._schedule_to_calendar,
            "get_calendar_events": self._get_calendar_events,
            # Web search
            "web_search": self._web_search,
            # Memory
            "save_memory": self._save_memory,
            "delete_memory": self._delete_memory,
            "list_memories": self._list_memories,
            "update_memory": self._update_memory,
        }

        handler = tool_handlers.get(function_name)
        if handler:
            return await handler(user_id, args)
        else:
            return {"error": f"Unknown function: {function_name}"}
    
    # ==================== EXERCISE TOOL HANDLERS ====================

    async def _add_exercise(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add an exercise to the user's personal exercise library"""
        try:
            # Build strain object with defaults
            strain_input = args.get("strain", {})
            strain = {
                "intensity": strain_input.get("intensity", "moderate"),
                "load": strain_input.get("load", "bodyweight"),
                "durationType": strain_input.get("durationType", "reps"),
                "typicalVolume": strain_input.get("typicalVolume", "3x10")
            }

            exercise_data = {
                "name": args["name"],
                "description": args.get("description", f"{args['name']} - a {args.get('difficulty', 'intermediate')} level exercise"),
                "muscles": args.get("muscles", ["Full Body"]),
                "secondaryMuscles": args.get("secondaryMuscles", []),
                "discipline": args.get("discipline", ["General Fitness"]),
                "equipment": args.get("equipment", []),
                "difficulty": args.get("difficulty", "intermediate"),
                "instructions": args.get("instructions", [f"Perform {args['name']} with proper form and control"]),
                "strain": strain,
                "isCommon": False,
                "createdBy": ObjectId(user_id),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            result = await self.db.exercises.insert_one(exercise_data)

            if result.inserted_id:
                logger.info(f"Added exercise {args['name']} for user {user_id}")
                return {
                    "success": True,
                    "message": f"Added '{args['name']}' to your exercise library!",
                    "exercise_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to add exercise"}

        except Exception as e:
            logger.error(f"Error adding exercise: {e}")
            return {"success": False, "message": str(e)}

    async def _list_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List exercises from the database with optional filters"""
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

            # Name search (for finding specific exercises like "toes to bar")
            if args.get("name"):
                additional_filters.append({
                    "name": {"$regex": args["name"], "$options": "i"}
                })

            # Muscle filter (search primary and secondary muscles)
            if args.get("muscle"):
                muscle_pattern = args["muscle"]
                additional_filters.append({
                    "$or": [
                        {"muscles": {"$regex": muscle_pattern, "$options": "i"}},
                        {"secondaryMuscles": {"$regex": muscle_pattern, "$options": "i"}}
                    ]
                })

            # Discipline filter
            if args.get("discipline"):
                additional_filters.append({
                    "discipline": {"$regex": args["discipline"], "$options": "i"}
                })

            # Difficulty filter
            if args.get("difficulty"):
                additional_filters.append({"difficulty": args["difficulty"]})

            # Equipment filter
            if args.get("equipment"):
                additional_filters.append({
                    "equipment": {"$regex": args["equipment"], "$options": "i"}
                })

            # Combine all filters with $and
            if additional_filters:
                query = {"$and": [ownership_filter] + additional_filters}
            else:
                query = ownership_filter

            limit = args.get("limit", 20)

            logger.info(f"list_exercises query for user {user_id}: {query}")

            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "secondaryMuscles": 1, "difficulty": 1, "equipment": 1, "discipline": 1, "description": 1}
            ).limit(limit).to_list(None)

            logger.info(f"list_exercises found {len(exercises)} exercises")

            # Format results
            results = []
            for ex in exercises:
                results.append({
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "equipment": ex.get("equipment", []),
                    "discipline": ex.get("discipline", [])
                })

            return {
                "success": True,
                "count": len(results),
                "exercises": results
            }

        except Exception as e:
            logger.error(f"Error listing exercises: {e}")
            return {"success": False, "message": str(e)}

    async def _grep_exercises(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across exercises using regex.
        Similar to ripgrep - searches all exercises and returns matches per pattern.
        Also finds SIMILAR exercises when exact match fails (fuzzy matching).
        """
        try:
            import re
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            output_mode = args.get("output_mode", "both")
            limit_per_pattern = args.get("limit", 5)

            # Build ownership filter
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

            # Extract keywords from all patterns for broader search
            all_keywords = set()
            for pattern in patterns:
                # Extract words (remove special chars, split)
                words = re.findall(r'[a-zA-Z]+', pattern.lower())
                # Filter out very short words and common words
                stopwords = {'to', 'the', 'a', 'an', 'in', 'on', 'with', 'for', 'and', 'or'}
                keywords = [w for w in words if len(w) > 2 and w not in stopwords]
                all_keywords.update(keywords)

            # Build broader search: match ANY keyword for fuzzy results
            keyword_regex = "|".join(all_keywords) if all_keywords else "|".join(patterns)

            query = {
                "$and": [
                    ownership_filter,
                    {"name": {"$regex": keyword_regex, "$options": "i"}}
                ]
            }

            # Fetch all potentially matching exercises (broader search)
            exercises = await self.db.exercises.find(
                query,
                {"name": 1, "muscles": 1, "difficulty": 1, "discipline": 1, "equipment": 1, "description": 1, "_id": 1}
            ).to_list(None)

            # Build lookup with descriptions for user context
            all_exercises = [
                {
                    "id": str(ex["_id"]),
                    "name": ex["name"],
                    "muscles": ex.get("muscles", []),
                    "difficulty": ex.get("difficulty"),
                    "discipline": ex.get("discipline", []),
                    "equipment": ex.get("equipment", []),
                    "description": ex.get("description", "")[:100]  # First 100 chars of description
                }
                for ex in exercises
            ]

            # Helper function to calculate similarity score
            def similarity_score(pattern: str, exercise_name: str) -> float:
                """Calculate how similar a pattern is to an exercise name"""
                pattern_lower = pattern.lower()
                name_lower = exercise_name.lower()

                # Exact match
                if pattern_lower == name_lower:
                    return 1.0

                # Pattern is substring of name or vice versa
                if pattern_lower in name_lower or name_lower in pattern_lower:
                    return 0.9

                # Word overlap scoring
                pattern_words = set(re.findall(r'[a-zA-Z]+', pattern_lower))
                name_words = set(re.findall(r'[a-zA-Z]+', name_lower))

                if not pattern_words or not name_words:
                    return 0.0

                # Calculate Jaccard-like similarity
                intersection = len(pattern_words & name_words)
                union = len(pattern_words | name_words)

                if union == 0:
                    return 0.0

                base_score = intersection / union

                # Boost if key words match (longer words are more significant)
                key_matches = sum(1 for w in pattern_words if len(w) > 3 and w in name_words)
                boost = key_matches * 0.15

                return min(base_score + boost, 0.85)  # Cap at 0.85 for non-exact matches

            # Match each pattern to its results
            results_by_pattern = {}
            similar_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                scored_matches = []
                for ex in all_exercises:
                    score = similarity_score(pattern, ex["name"])
                    if score > 0:
                        scored_matches.append((score, ex))

                # Sort by score descending
                scored_matches.sort(key=lambda x: x[0], reverse=True)

                # Separate exact/high matches from similar matches
                exact_matches = [ex for score, ex in scored_matches if score >= 0.85]
                similar_matches = [
                    {**ex, "similarity": f"{int(score * 100)}%"}
                    for score, ex in scored_matches
                    if 0.3 <= score < 0.85
                ][:limit_per_pattern]

                if exact_matches:
                    results_by_pattern[pattern] = exact_matches[:limit_per_pattern]
                    matched_patterns.add(pattern)
                elif similar_matches:
                    # No exact match but found similar exercises
                    similar_by_pattern[pattern] = similar_matches
                    missing_patterns.append(pattern)
                else:
                    missing_patterns.append(pattern)

            # Build response based on output_mode
            response: Dict[str, Any] = {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns)
            }

            if output_mode in ("matches", "both"):
                response["matches"] = results_by_pattern

            if output_mode in ("missing", "both"):
                response["missing"] = missing_patterns

            # Add similar matches (always include if found)
            if similar_by_pattern:
                response["similar"] = similar_by_pattern
                response["has_similar"] = True

            # Summary for quick overview
            response["summary"] = f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            if similar_by_pattern:
                response["summary"] += f". Found {len(similar_by_pattern)} similar exercise(s) that might be what you're looking for"
            elif missing_patterns and len(missing_patterns) <= 10:
                response["summary"] += f". Missing: {', '.join(missing_patterns[:5])}"
                if len(missing_patterns) > 5:
                    response["summary"] += f" (+{len(missing_patterns) - 5} more)"

            return response

        except Exception as e:
            logger.error(f"Error in grep_exercises: {e}")
            return {"success": False, "message": str(e)}

    async def _grep_workouts(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fast pattern-matching search across workout templates using regex.
        """
        try:
            patterns = args.get("patterns", [])
            if not patterns:
                return {"success": False, "message": "No search patterns provided"}

            limit_per_pattern = args.get("limit", 5)
            search_fields = args.get("search_fields", ["name", "goal"])

            # Build ownership filter
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

            # Build combined regex pattern
            combined_regex = "|".join(f"({p})" for p in patterns)

            # Build field search conditions
            field_conditions = []
            if "name" in search_fields:
                field_conditions.append({"name": {"$regex": combined_regex, "$options": "i"}})
            if "goal" in search_fields:
                field_conditions.append({"goal": {"$regex": combined_regex, "$options": "i"}})
            if "tags" in search_fields:
                field_conditions.append({"tags": {"$regex": combined_regex, "$options": "i"}})

            query = {
                "$and": [
                    ownership_filter,
                    {"$or": field_conditions} if field_conditions else {}
                ]
            }

            # Fetch matching workouts
            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "tags": 1, "blocks": 1, "_id": 1}
            ).to_list(None)

            # Build lookup
            all_workouts = [
                {
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "tags": w.get("tags", []),
                    "exercise_count": sum(len(b.get("exercises", [])) for b in w.get("blocks", []))
                }
                for w in workouts
            ]

            # Match each pattern
            import re
            results_by_pattern = {}
            matched_patterns = set()
            missing_patterns = []

            for pattern in patterns:
                try:
                    regex = re.compile(pattern, re.IGNORECASE)
                    matches = []
                    for w in all_workouts:
                        # Search in configured fields
                        if ("name" in search_fields and regex.search(w["name"])) or \
                           ("goal" in search_fields and regex.search(w["goal"])) or \
                           ("tags" in search_fields and any(regex.search(t) for t in w["tags"])):
                            matches.append(w)

                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)
                except re.error:
                    pattern_lower = pattern.lower()
                    matches = [w for w in all_workouts if pattern_lower in w["name"].lower() or pattern_lower in w["goal"].lower()]
                    if matches:
                        results_by_pattern[pattern] = matches[:limit_per_pattern]
                        matched_patterns.add(pattern)
                    else:
                        missing_patterns.append(pattern)

            return {
                "success": True,
                "total_patterns": len(patterns),
                "patterns_matched": len(matched_patterns),
                "patterns_missing": len(missing_patterns),
                "matches": results_by_pattern,
                "missing": missing_patterns,
                "summary": f"Found matches for {len(matched_patterns)}/{len(patterns)} patterns"
            }

        except Exception as e:
            logger.error(f"Error in grep_workouts: {e}")
            return {"success": False, "message": str(e)}

    # ==================== WORKOUT TEMPLATE TOOL HANDLERS ====================

    async def _create_workout_template(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a workout template (PredefinedWorkout) with blocks structure"""
        try:
            # Get existing exercises to link IDs
            existing_exercises = await self.db.exercises.find(
                {"$or": [{"isCommon": True}, {"createdBy": ObjectId(user_id)}]},
                {"name": 1, "_id": 1}
            ).to_list(None)
            exercise_map = {ex["name"].lower(): ex["_id"] for ex in existing_exercises}

            # Process blocks and link exercise IDs
            blocks = []
            for block in args.get("blocks", []):
                block_exercises = []
                for ex in block.get("exercises", []):
                    exercise_name = ex.get("exercise_name", "")
                    exercise_id = exercise_map.get(exercise_name.lower())

                    block_exercises.append({
                        "exercise_id": exercise_id,
                        "exercise_name": exercise_name,
                        "volume": ex.get("volume", "3x10"),
                        "rest": ex.get("rest", "60s"),
                        "notes": ex.get("notes", "")
                    })

                blocks.append({
                    "name": block.get("name", "Main Work"),
                    "exercises": block_exercises
                })

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
                return {
                    "success": True,
                    "message": f"Created workout template '{args['name']}' with {len(blocks)} blocks and {total_exercises} exercises!",
                    "workout_id": str(result.inserted_id)
                }
            else:
                return {"success": False, "message": "Failed to create workout template"}

        except Exception as e:
            logger.error(f"Error creating workout template: {e}")
            return {"success": False, "message": str(e)}

    async def _list_workout_templates(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

            limit = args.get("limit", 10)

            workouts = await self.db.predefinedworkouts.find(
                query,
                {"name": 1, "goal": 1, "difficulty_level": 1, "estimated_duration": 1, "blocks": 1, "primary_disciplines": 1}
            ).limit(limit).to_list(None)

            results = []
            for w in workouts:
                total_exercises = sum(len(b.get("exercises", [])) for b in w.get("blocks", []))
                results.append({
                    "id": str(w["_id"]),
                    "name": w["name"],
                    "goal": w.get("goal", ""),
                    "difficulty": w.get("difficulty_level"),
                    "duration": w.get("estimated_duration"),
                    "disciplines": w.get("primary_disciplines", []),
                    "total_exercises": total_exercises
                })

            return {
                "success": True,
                "count": len(results),
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error listing workout templates: {e}")
            return {"success": False, "message": str(e)}

    # ==================== WORKOUT LOG TOOL HANDLERS ====================

    async def _log_workout(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    async def _get_workout_history(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
                results.append({
                    "id": str(w["_id"]),
                    "title": w["title"],
                    "date": w["date"].isoformat() if w.get("date") else None,
                    "type": w.get("type"),
                    "status": w.get("status"),
                    "duration": w.get("durationMinutes"),
                    "exercise_count": len(w.get("exercises", []))
                })

            return {
                "success": True,
                "count": len(results),
                "workouts": results
            }

        except Exception as e:
            logger.error(f"Error getting workout history: {e}")
            return {"success": False, "message": str(e)}

    # ==================== PLAN TOOL HANDLERS ====================

    async def _create_plan(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    async def _list_plans(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    # ==================== GOAL TOOL HANDLERS ====================

    async def _list_goals(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
    
    async def _create_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    async def _update_goal(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

    # ==================== CALENDAR TOOL HANDLERS ====================

    async def _schedule_to_calendar(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

                response_msg = f"✅ Scheduled **{title_with_date}** for **{formatted_date}**!"
                if workout_template_id:
                    response_msg += "\n\n💾 **Saved to your workout library** - you can reuse this workout anytime!"
                if event_type == "workout" and exercise_count > 0:
                    duration = workout_details.get("estimatedDuration", 45)
                    response_msg += f"\n\n📋 **{exercise_count} exercises** | ⏱️ **~{duration} min**"

                # Check if it's today
                today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                if event_date.date() == today.date():
                    response_msg += "\n\n🎯 **This is for today!** Would you like to start training now?"

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

    async def _get_calendar_events(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
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
                summary += f"\n- 💪 **{workout_count}** workout(s)"
            if rest_count > 0:
                summary += f"\n- 😴 **{rest_count}** rest day(s)"

            return {
                "success": True,
                "message": summary,
                "events": formatted_events
            }

        except Exception as e:
            logger.error(f"Error getting calendar events: {e}")
            return {"success": False, "message": f"Error fetching calendar: {str(e)}"}

    # ==================== WEB SEARCH TOOL HANDLER ====================

    async def _web_search(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Search the web for fitness-related content using Tavily"""
        try:
            query = args.get("query")
            if not query:
                return {"success": False, "message": "Search query is required"}

            search_type = args.get("search_type", "general")
            max_results = min(args.get("max_results", 3), 5)  # Cap at 5

            # Check if Tavily API key is configured
            if not self.settings.tavily_api_key:
                return {
                    "success": False,
                    "message": "Web search is not configured. Please add TAVILY_API_KEY to your environment."
                }

            # Initialize Tavily client
            tavily = TavilyClient(api_key=self.settings.tavily_api_key)

            # Preferred fitness creators by category
            PREFERRED_CREATORS = {
                "calisthenics": ["Saturno Movement", "Calisthenicmovement", "FitnessFAQs", "Chris Heria", "Hybrid Calisthenics"],
                "bodyweight": ["Saturno Movement", "Calisthenicmovement", "FitnessFAQs", "Hybrid Calisthenics", "Minus The Gym"],
                "strength": ["Athlean-X", "Jeff Nippard", "Jeremy Ethier", "Renaissance Periodization"],
                "mobility": ["Tom Merrick", "Squat University", "GMB Fitness"],
                "flexibility": ["Tom Merrick", "GMB Fitness", "Yoga With Adriene"],
                "powerlifting": ["Juggernaut Training Systems", "Calgary Barbell", "Squat University"],
                "yoga": ["Yoga With Adriene", "Breathe and Flow"],
                "meditation": ["Yoga With Adriene", "Headspace"],
            }

            # Detect category from query to boost with preferred creators
            query_lower = query.lower()
            creator_boost = ""

            # Check for category keywords in query
            for category, creators in PREFERRED_CREATORS.items():
                if category in query_lower:
                    creator_boost = f" {creators[0]} OR {creators[1]}"
                    break

            # Also check for common exercise types
            if not creator_boost:
                calisthenics_keywords = ["pull up", "pull-up", "muscle up", "muscle-up", "dip", "handstand", "planche", "front lever", "back lever", "l-sit", "ring"]
                strength_keywords = ["deadlift", "squat", "bench press", "barbell", "dumbbell", "overhead press"]
                mobility_keywords = ["mobility", "stretch", "flexibility", "warm up", "warm-up"]

                if any(kw in query_lower for kw in calisthenics_keywords):
                    creator_boost = " Saturno Movement OR Calisthenicmovement"
                elif any(kw in query_lower for kw in strength_keywords):
                    creator_boost = " Athlean-X OR Jeff Nippard"
                elif any(kw in query_lower for kw in mobility_keywords):
                    creator_boost = " Tom Merrick OR Squat University"

            # Enhance query for fitness context
            enhanced_query = query
            if search_type == "video":
                enhanced_query = f"{query}{creator_boost} video tutorial youtube"
            elif search_type == "article":
                enhanced_query = f"{query} guide article"
            else:
                enhanced_query = f"{query}{creator_boost}"

            # Perform search
            logger.info(f"Web search for user {user_id}: {enhanced_query}")
            response = tavily.search(
                query=enhanced_query,
                max_results=max_results,
                search_depth="basic",
                include_answer=True,
                include_domains=["youtube.com", "bodybuilding.com", "menshealth.com",
                                "womenshealthmag.com", "stack.com", "t-nation.com",
                                "strengthlog.com", "exrx.net", "verywellfit.com"] if search_type != "general" else None
            )

            # Format results
            results = []
            for result in response.get("results", []):
                url = result.get("url", "")
                is_video = "youtube.com" in url or "youtu.be" in url
                video_id = None

                # Extract YouTube video ID
                if is_video:
                    import re
                    patterns = [
                        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
                    ]
                    for pattern in patterns:
                        match = re.search(pattern, url)
                        if match:
                            video_id = match.group(1)
                            break

                results.append({
                    "title": result.get("title", ""),
                    "url": url,
                    "snippet": result.get("content", "")[:300] + "..." if len(result.get("content", "")) > 300 else result.get("content", ""),
                    "is_video": is_video,
                    "video_id": video_id
                })

            # Build response message
            if results:
                message = f"Found **{len(results)} results** for \"{query}\":"

                for i, r in enumerate(results, 1):
                    if r["is_video"] and r["video_id"]:
                        # Use video-embed tag for YouTube videos
                        message += f"\n\n<video-embed videoid=\"{r['video_id']}\" title=\"{r['title']}\" />"
                    else:
                        # Regular link for articles
                        message += f"\n\n📄 **{i}. [{r['title']}]({r['url']})**\n{r['snippet']}"

                # Include Tavily's AI answer if available
                ai_answer = response.get("answer")
                if ai_answer:
                    message = f"**Quick Answer:** {ai_answer}\n\n---\n\n{message}"
            else:
                message = f"No results found for \"{query}\". Try a different search term."

            return {
                "success": True,
                "message": message,
                "results": results,
                "answer": response.get("answer")
            }

        except Exception as e:
            logger.error(f"Error in web search: {e}")
            return {"success": False, "message": f"Search failed: {str(e)}"}

    # ==================== MEMORY TOOL HANDLER ====================

    async def _save_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Save important information about the user to memory"""
        try:
            content = args.get("content")
            if not content:
                return {"success": False, "message": "Memory content is required"}

            category = args.get("category", "general")
            importance = args.get("importance", "medium")
            tags = args.get("tags", [])

            # Ensure tags are lowercase strings
            if tags:
                tags = [str(t).lower().strip() for t in tags if t]

            memory_item = {
                "_id": ObjectId(),
                "content": content.strip()[:500],  # Limit to 500 chars
                "category": category,
                "tags": tags,
                "source": "sensei",  # Mark as AI-generated
                "importance": importance,
                "isActive": True,
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow()
            }

            # Try to find existing user memory document
            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})

            if user_memory:
                # Add to existing memories array
                result = await self.db.usermemories.update_one(
                    {"user": ObjectId(user_id)},
                    {
                        "$push": {"memories": memory_item},
                        "$set": {"updatedAt": datetime.utcnow()}
                    }
                )
                success = result.modified_count > 0
            else:
                # Create new user memory document
                new_doc = {
                    "user": ObjectId(user_id),
                    "memories": [memory_item],
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }
                result = await self.db.usermemories.insert_one(new_doc)
                success = result.inserted_id is not None

            if success:
                # Build a friendly confirmation message
                category_emoji = {
                    "health": "🏥",
                    "preference": "✨",
                    "goal": "🎯",
                    "lifestyle": "🌟",
                    "general": "📝"
                }
                emoji = category_emoji.get(category, "📝")

                logger.info(f"Saved memory for user {user_id}: {content[:50]}...")
                return {
                    "success": True,
                    "message": f"{emoji} I'll remember that! Saved to your memory under **{category}**.",
                    "memory_id": str(memory_item["_id"])
                }
            else:
                return {"success": False, "message": "Failed to save memory"}

        except Exception as e:
            logger.error(f"Error saving memory: {e}")
            return {"success": False, "message": f"Error saving memory: {str(e)}"}

    async def _get_user_memories(self, user_id: str) -> list:
        """Get active memories for a user (for prompt injection)"""
        try:
            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return []

            # Filter to only active memories and sort by importance
            active_memories = [m for m in user_memory.get("memories", []) if m.get("isActive", True)]

            # Sort by importance (high first)
            importance_order = {"high": 0, "medium": 1, "low": 2}
            active_memories.sort(key=lambda m: importance_order.get(m.get("importance", "medium"), 1))

            return active_memories
        except Exception as e:
            logger.error(f"Error getting user memories: {e}")
            return []

    async def _delete_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a memory matching the search text"""
        try:
            search_text = args.get("search_text", "").lower()
            category_filter = args.get("category")

            if not search_text:
                return {"success": False, "message": "Please specify what memory to delete"}

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {"success": False, "message": "No memories found"}

            memories = user_memory.get("memories", [])
            original_count = len(memories)

            # Find memories matching the search text
            memories_to_keep = []
            deleted_memories = []

            for mem in memories:
                content_lower = mem.get("content", "").lower()
                category_match = not category_filter or mem.get("category") == category_filter

                if search_text in content_lower and category_match:
                    deleted_memories.append(mem)
                else:
                    memories_to_keep.append(mem)

            if not deleted_memories:
                return {"success": False, "message": f"No memories found matching '{search_text}'"}

            # Update the document
            result = await self.db.usermemories.update_one(
                {"user": ObjectId(user_id)},
                {
                    "$set": {
                        "memories": memories_to_keep,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                deleted_count = len(deleted_memories)
                deleted_preview = deleted_memories[0].get("content", "")[:50]
                logger.info(f"Deleted {deleted_count} memory(ies) for user {user_id}")
                return {
                    "success": True,
                    "message": f"🗑️ Deleted {deleted_count} memory(ies) matching '{search_text}'.",
                    "deleted_count": deleted_count
                }
            else:
                return {"success": False, "message": "Failed to delete memory"}

        except Exception as e:
            logger.error(f"Error deleting memory: {e}")
            return {"success": False, "message": f"Error deleting memory: {str(e)}"}

    async def _list_memories(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """List all memories for the user"""
        try:
            category_filter = args.get("category")

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {
                    "success": True,
                    "message": "I don't have any memories saved about you yet.",
                    "memories": []
                }

            memories = user_memory.get("memories", [])

            # Filter by category if specified
            if category_filter:
                memories = [m for m in memories if m.get("category") == category_filter]

            # Filter to active only
            active_memories = [m for m in memories if m.get("isActive", True)]

            if not active_memories:
                if category_filter:
                    return {
                        "success": True,
                        "message": f"No active memories in the **{category_filter}** category.",
                        "memories": []
                    }
                return {
                    "success": True,
                    "message": "I don't have any active memories saved about you.",
                    "memories": []
                }

            # Format memories for display
            category_emoji = {
                "health": "🏥",
                "preference": "✨",
                "goal": "🎯",
                "lifestyle": "🌟",
                "general": "📝"
            }

            formatted = []
            for mem in active_memories:
                cat = mem.get("category", "general")
                emoji = category_emoji.get(cat, "📝")
                importance = mem.get("importance", "medium")
                imp_marker = "⚠️ " if importance == "high" else ""
                formatted.append({
                    "category": cat,
                    "content": mem.get("content"),
                    "importance": importance,
                    "display": f"{imp_marker}{emoji} [{cat}] {mem.get('content')}"
                })

            # Build message
            message = f"Here's what I remember about you ({len(formatted)} memories):\n\n"
            for f in formatted:
                message += f"• {f['display']}\n"

            message += "\n_You can manage these in **Settings → Sensei Memory**_"

            return {
                "success": True,
                "message": message,
                "memories": formatted,
                "count": len(formatted)
            }

        except Exception as e:
            logger.error(f"Error listing memories: {e}")
            return {"success": False, "message": f"Error listing memories: {str(e)}"}

    async def _update_memory(self, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing memory"""
        try:
            search_text = args.get("search_text", "").lower()
            new_content = args.get("new_content")
            new_category = args.get("category")
            new_importance = args.get("importance")

            if not search_text or not new_content:
                return {"success": False, "message": "Please specify what memory to update and the new content"}

            user_memory = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            if not user_memory:
                return {"success": False, "message": "No memories found"}

            memories = user_memory.get("memories", [])
            updated = False

            for mem in memories:
                content_lower = mem.get("content", "").lower()
                if search_text in content_lower:
                    mem["content"] = new_content.strip()[:500]
                    mem["updatedAt"] = datetime.utcnow()
                    if new_category:
                        mem["category"] = new_category
                    if new_importance:
                        mem["importance"] = new_importance
                    updated = True
                    break  # Only update first match

            if not updated:
                # No existing memory found - create a new one instead
                logger.info(f"No memory found matching '{search_text}', creating new memory")
                return await self._save_memory(user_id, {
                    "content": new_content,
                    "category": new_category or "general",
                    "importance": new_importance or "medium"
                })

            result = await self.db.usermemories.update_one(
                {"user": ObjectId(user_id)},
                {
                    "$set": {
                        "memories": memories,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )

            if result.modified_count > 0:
                category_emoji = {
                    "health": "🏥",
                    "preference": "✨",
                    "goal": "🎯",
                    "lifestyle": "🌟",
                    "general": "📝"
                }
                emoji = category_emoji.get(new_category or "general", "📝")
                logger.info(f"Updated memory for user {user_id}")
                return {
                    "success": True,
                    "message": f"{emoji} Memory updated! New content: **{new_content[:100]}{'...' if len(new_content) > 100 else ''}**"
                }
            else:
                return {"success": False, "message": "Failed to update memory"}

        except Exception as e:
            logger.error(f"Error updating memory: {e}")
            return {"success": False, "message": f"Error updating memory: {str(e)}"}