"""
Enhanced Agent Orchestrator - OpenAI with comprehensive fitness tools
"""

import json
from typing import Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.tool_definitions import get_all_tools
from app.core.agents.services import (
    ExerciseService,
    WorkoutService,
    PlanService,
    GoalService,
    CalendarService,
    SearchService,
    MemoryService,
)

logger = structlog.get_logger()


class AgentOrchestrator:
    """Enhanced orchestrator with comprehensive fitness management tools"""

    def __init__(self, db: AsyncIOMotorDatabase, redis_client=None):
        logger.info("Initializing AgentOrchestrator...")

        self.db = db
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        self.data_reader = DataReaderAgent(db)

        # Initialize services
        logger.info("Initializing services...")
        self.exercise_service = ExerciseService(db)
        self.workout_service = WorkoutService(db)
        self.plan_service = PlanService(db)
        self.goal_service = GoalService(db)
        self.calendar_service = CalendarService(db)
        self.search_service = SearchService(self.settings.tavily_api_key)
        self.memory_service = MemoryService(db)

        # Log configuration
        tools = get_all_tools()
        logger.info(
            "AgentOrchestrator initialized",
            model=self.settings.openai_model,
            tools_count=len(tools),
            services=[
                "ExerciseService",
                "WorkoutService",
                "PlanService",
                "GoalService",
                "CalendarService",
                "SearchService",
                "MemoryService"
            ],
            tavily_enabled=bool(self.settings.tavily_api_key)
        )
        
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
        user_memories = await self.memory_service.get_user_memories(user_id)

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
        user_memories = await self.memory_service.get_user_memories(user_id)

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
        """Route tool calls to appropriate service handlers"""
        tool_handlers = {
            # Exercise tools
            "add_exercise": self.exercise_service.add_exercise,
            "list_exercises": self.exercise_service.list_exercises,
            "grep_exercises": self.exercise_service.grep_exercises,
            "grep_workouts": self.exercise_service.grep_workouts,
            # Workout template tools
            "create_workout_template": self.workout_service.create_workout_template,
            "list_workout_templates": self.workout_service.list_workout_templates,
            # Workout log tools
            "log_workout": self.workout_service.log_workout,
            "get_workout_history": self.workout_service.get_workout_history,
            # Plan tools
            "create_plan": self.plan_service.create_plan,
            "list_plans": self.plan_service.list_plans,
            "update_plan": self.plan_service.update_plan,
            "add_plan_workout": self.plan_service.add_plan_workout,
            "remove_plan_workout": self.plan_service.remove_plan_workout,
            # Goal tools
            "create_goal": self.goal_service.create_goal,
            "update_goal": self.goal_service.update_goal,
            "list_goals": self.goal_service.list_goals,
            # Calendar tools
            "schedule_to_calendar": self.calendar_service.schedule_to_calendar,
            "get_calendar_events": self.calendar_service.get_calendar_events,
            # Web search
            "web_search": self.search_service.web_search,
            # Memory
            "save_memory": self.memory_service.save_memory,
            "delete_memory": self.memory_service.delete_memory,
            "list_memories": self.memory_service.list_memories,
            "update_memory": self.memory_service.update_memory,
        }

        handler = tool_handlers.get(function_name)
        if handler:
            return await handler(user_id, args)
        else:
            return {"error": f"Unknown function: {function_name}"}
