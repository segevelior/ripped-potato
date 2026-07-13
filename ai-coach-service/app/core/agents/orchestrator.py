"""
Enhanced Agent Orchestrator - OpenAI with comprehensive fitness tools
"""

import asyncio
import json
import re
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.text_utils import dedupe_repeated_response
from app.core.agents.tool_definitions import get_all_tools
from app.core.agents.reflection_config import REFLECTION_CONFIG
from app.core.agents.reflection_prompt import REFLECTION_SYSTEM_PROMPT, REFLECTION_USER_PROMPT
from app.core.agents.services import (
    ExerciseService,
    WorkoutService,
    PlanService,
    GoalService,
    CalendarService,
    SearchService,
    MemoryService,
)
from app.services.recommendation_service import RecommendationService
from app.services.short_term_context_service import ShortTermContextService
# Importing the skills package registers every skill via the @skill decorator.
from app.core.agents.skills import (
    SkillContext,
    get_skill_definitions,
    get_skill_handler,
)

logger = structlog.get_logger()

# Messages that reference the user's OWN plan/calendar/workouts must be grounded
# in their real data — force at least one tool call on the first LLM round so the
# model reads the data instead of answering generically (see prompts.py principle 1).
_GROUNDING_INTENT_RE = re.compile(
    r"\bmy\s+(plan|plans|workout|workouts|program|calendar|schedule|training|routine|session|sessions|history|week)\b"
    r"|\b(scheduled|swap|replace|substitute|reschedule|move|skip)\b"
    r"|\bbased on my\b"
    r"|\bwhat('s| is) (on |in )?(my|the) (calendar|schedule)\b"
    r"|\b(today|tomorrow|this week|next week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)('s)? workout\b"
    r"|\bworkout (for |on )?(today|tomorrow|this week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b"
    r"|\btoday'?s\s+pick\b"
    r"|\b(suggested|recommended)\s+workout\b"
    r"|\bwhat\s+(should|do)\s+i\s+(do|train)\s+today\b"
    r"|\bshould\s+i\s+(train|work\s?out|rest)\s+today\b"
    r"|\b(do|have)\s+i\s+(got\s+|have\s+)?a?\s*workout\s+today\b",
    re.IGNORECASE,
)


def _needs_grounding(message: str) -> bool:
    """True when the message references the user's own data and the first
    LLM round should be forced to call a tool (tool_choice='required')."""
    return bool(_GROUNDING_INTENT_RE.search(message or ""))


_VIDEO_EMBED_RE = re.compile(r'<video-embed\s+videoid="([^"]+)"[^>]*/>')


def _collect_video_tags(result: Dict[str, Any], into: Dict[str, str]) -> None:
    """Record any <video-embed> tags a tool returned, keyed by video id, so we
    can guarantee they render even if the model paraphrases them away."""
    if not isinstance(result, dict):
        return
    msg = result.get("message") or ""
    for m in _VIDEO_EMBED_RE.finditer(msg):
        into.setdefault(m.group(1), m.group(0))


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
        self.search_service = SearchService(
            tavily_api_key=self.settings.tavily_api_key,
            youtube_api_key=self.settings.youtube_api_key,
            db=db,
        )
        self.memory_service = MemoryService(db)
        self.recommendation_service = RecommendationService(db)
        self.short_term_context = ShortTermContextService(db)

        # Shared context handed to every registered skill handler.
        self.skill_context = SkillContext(
            db=self.db,
            settings=self.settings,
            exercise_service=self.exercise_service,
            workout_service=self.workout_service,
            plan_service=self.plan_service,
            goal_service=self.goal_service,
            calendar_service=self.calendar_service,
            search_service=self.search_service,
            memory_service=self.memory_service,
            openai_client=self.client,
        )

        # Log configuration
        tools = self.get_tools()
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
        """Available tools for the LLM: legacy tool_definitions + registered skills.

        Skills take precedence: if a skill shares a name with a legacy tool, the
        legacy definition is dropped so the tool isn't listed twice.
        """
        skill_definitions = get_skill_definitions()
        skill_names = {d["function"]["name"] for d in skill_definitions}
        legacy_tools = [
            t for t in get_all_tools()
            if t["function"]["name"] not in skill_names
        ]
        return legacy_tools + skill_definitions


    async def _build_extra_context(self, user_id: str, local_now: datetime, today_date: str) -> str:
        """Short-term awareness blocks appended after memories:
        1. Recent train-now recommendations (today + yesterday) with reasoning,
           so the sensei knows what it already suggested and stays consistent.
        2. Short-term context entries (dashboard check-ins, conversation
           summaries, 14-day TTL) — working memory across conversations.
        Best-effort: returns '' on any failure."""
        blocks = []
        try:
            yesterday_date = (local_now - timedelta(days=1)).strftime('%Y-%m-%d')
            recs = await self.recommendation_service.get_recent(user_id, [today_date, yesterday_date])
            rec_block = RecommendationService.format_for_prompt(recs, today_date)
            if rec_block:
                blocks.append(rec_block)
            if not any(rec.get("localDate") == today_date for rec in recs):
                # No pick generated yet today (user opened chat before the dashboard) —
                # tell the model the pick exists as a concept and how to fetch it.
                blocks.append(RecommendationService.placeholder_for_prompt(today_date))

            stc_entries = await self.short_term_context.get_recent(user_id, limit=8)
            stc_block = ShortTermContextService.format_for_prompt(stc_entries)
            if stc_block:
                blocks.append(stc_block)
        except Exception as e:
            logger.error(f"Failed building extra context for {user_id}: {e}")
        return ("\n\n" + "\n\n".join(blocks)) if blocks else ""

    async def process_request(
        self,
        message: str,
        user_context: Dict[str, Any],
        file_content: Dict[str, Any] = None
    ) -> Dict[str, Any]:
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
        timezone = user_profile.get('timezone') or 'UTC'

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        # Get current local time for user
        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p')
            today_date = local_now.strftime('%Y-%m-%d')
        except Exception:
            local_now = datetime.now(ZoneInfo('UTC'))
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'
            today_date = local_now.strftime('%Y-%m-%d')

        context_str = f"""RUNTIME:
- You are powered by the OpenAI model: {self.settings.openai_model} (say so if asked which model you are)

CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'not specified'}
- Preferred Workout Duration: {user_profile.get('workoutDuration', 'not set')} minutes
- Workout Days per Week: {len(user_profile.get('workoutDays', []))}
- Stated Goals (from profile): {', '.join(user_profile.get('goals', [])) or 'none listed'}
- Profile-listed Injuries (standing baseline): {', '.join(user_profile.get('injuries', [])) or 'none listed'}

USER DATA:
- {len(data_context.get('exercises', []))} exercises in library
- {len(data_context.get('workouts', []))} recent workouts
- {len(data_context.get('goals', []))} active tracked goals (Goals feature)
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

        # Add recent recommendations + short-term context (working memory)
        context_str += await self._build_extra_context(user_id, local_now, today_date)

        # Inject context into system prompt for consistent date awareness
        system_prompt_with_context = f"{SYSTEM_PROMPT}\n\n{context_str}"

        # Build user message - multimodal if file_content provided
        if file_content:
            user_message_content = [
                {"type": "text", "text": message},
                file_content
            ]
        else:
            user_message_content = message

        messages = [
            {"role": "system", "content": system_prompt_with_context},
            {"role": "user", "content": user_message_content}
        ]

        # Track tools used during this request for reflection triggering
        tools_used = []

        try:
            # Call OpenAI with function calling. If the user referenced their own
            # plan/calendar/workouts, force at least one tool call so the answer is
            # grounded in their real data instead of generic advice.
            first_tool_choice = "required" if _needs_grounding(message) else "auto"
            if first_tool_choice == "required":
                logger.info("Grounding intent detected — forcing tool use on first round")
            response = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice=first_tool_choice,
                **self.settings.llm_tuning_params(temperature=0.7)
            )

            response_message = response.choices[0].message

            # Handle tool calls
            if response_message.tool_calls:
                tool_results = []

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    tools_used.append(function_name)  # Track tool usage
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
                    **self.settings.llm_tuning_params(temperature=0.7)
                )

                final_content = final_response.choices[0].message.content

                # === REFLECTION FOR TOOL EXECUTION PATH ===
                if self._requires_reflection(final_content, tools_used):
                    logger.info("Triggering reflection for tool execution response")
                    reflection_result = await self._reflect_on_response(
                        original_response=final_content,
                        user_memories=user_memories,
                        user_profile=user_profile,
                        data_context=data_context,
                    )

                    if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                        final_content = reflection_result["revised_response"]
                        logger.info(f"Response revised. Issues fixed: {reflection_result['issues']}")

                return {
                    "message": dedupe_repeated_response(final_content),
                    "type": "tool_execution",
                    "confidence": 0.95
                }
            else:
                # No tool use, just conversation
                final_content = response_message.content

                # === REFLECTION FOR CONVERSATION PATH ===
                # Note: tools_used will be empty here, so reflection won't trigger
                # This is intentional - pure conversation doesn't need reflection
                if self._requires_reflection(final_content, tools_used):
                    logger.info("Triggering reflection for conversation response")
                    reflection_result = await self._reflect_on_response(
                        original_response=final_content,
                        user_memories=user_memories,
                        user_profile=user_profile,
                        data_context=data_context,
                    )

                    if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                        final_content = reflection_result["revised_response"]

                return {
                    "message": dedupe_repeated_response(final_content),
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
            "delete_workout_template": "Removing workout template(s)",
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
            # Daily suggestion
            "get_daily_recommendation": "Checking your Today's Pick",
            # Web search & research
            "web_search": (
                f"Finding a demo video: {function_args.get('query', 'exercise')}"
                if function_args.get("search_type") == "video"
                else f"Searching the web for: {function_args.get('query', 'fitness info')}"
            ),
            "save_exercise_video": f"Saving demo for {function_args.get('exercise_name', 'exercise')}",
            "read_url": f"Reading content from: {function_args.get('url', 'webpage')[:50]}...",
            "research": f"Researching: {function_args.get('topic', 'fitness topic')}",
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
        conversation_history: List[Dict[str, Any]] = None,
        file_content: Dict[str, Any] = None
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
        logger.info(f"[SENSEI DEBUG STREAMING] Loaded {len(user_memories)} memories for user {user_id}")
        for i, mem in enumerate(user_memories):
            logger.info(f"[SENSEI DEBUG STREAMING] Memory {i+1}: [{mem.get('importance')}] [{mem.get('category')}] {mem.get('content', '')[:80]}...")

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')
        timezone = user_profile.get('timezone') or 'UTC'

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        # Get current local time for user
        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p')
            today_date = local_now.strftime('%Y-%m-%d')
        except Exception:
            local_now = datetime.now(ZoneInfo('UTC'))
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'
            today_date = local_now.strftime('%Y-%m-%d')

        context_str = f"""RUNTIME:
- You are powered by the OpenAI model: {self.settings.openai_model} (say so if asked which model you are)

CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Stated Goals (from profile): {', '.join(user_profile.get('goals', [])) or 'none listed'}
- Profile-listed Injuries (standing baseline): {', '.join(user_profile.get('injuries', [])) or 'none listed'}

USER DATA:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} workouts
- {len(data_context.get('goals', []))} active tracked goals (Goals feature)"""

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

        # Add recent recommendations + short-term context (working memory)
        context_str += await self._build_extra_context(user_id, local_now, today_date)

        # Build messages array with conversation history
        # IMPORTANT: Inject context into system prompt so it's always at the top
        # This ensures the AI sees the current date BEFORE any conversation history
        system_prompt_with_context = f"{SYSTEM_PROMPT}\n\n{context_str}"
        messages = [
            {"role": "system", "content": system_prompt_with_context},
        ]

        # Build current user message - multimodal if file_content provided
        if file_content:
            current_user_message = [
                {"type": "text", "text": message},
                file_content
            ]
            logger.info(f"[SENSEI DEBUG STREAMING] Multimodal message with file content type: {file_content.get('type')}")
        else:
            current_user_message = message

        # Add conversation history if available
        if conversation_history:
            logger.info(f"[SENSEI DEBUG STREAMING] Has conversation history ({len(conversation_history)} messages)")
            for hist_msg in conversation_history:
                role = "user" if hist_msg.get("role") == "human" else "assistant"
                messages.append({
                    "role": role,
                    "content": hist_msg.get("content", "")
                })
            # Add current message (context is already in system prompt)
            messages.append({"role": "user", "content": current_user_message})
        else:
            # First message (context is already in system prompt)
            logger.info(f"[SENSEI DEBUG STREAMING] No conversation history")
            messages.append({"role": "user", "content": current_user_message})

        # Track the full response and tools used for reflection
        full_response = []
        tools_used = []
        # Video-embed tags returned by tools this turn. The model sometimes
        # paraphrases a video result instead of emitting the <video-embed> tag,
        # which breaks the player. We ensure the tag(s) end up in the response.
        turn_video_tags: Dict[str, str] = {}  # videoid -> full tag

        try:
            # Create streaming completion with tools. If the user referenced their
            # own plan/calendar/workouts, force at least one tool call so the answer
            # is grounded in their real data instead of generic advice.
            first_tool_choice = "required" if _needs_grounding(message) else "auto"
            logger.info(
                f"Calling OpenAI API with model: {self.settings.openai_model} and "
                f"{len(self.get_tools())} tools (tool_choice={first_tool_choice})"
            )
            stream = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice=first_tool_choice,
                max_completion_tokens=2500,
                stream=True,
                **self.settings.llm_tuning_params(temperature=0.7)
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
                        tools_used.append(function_name)  # Track for reflection

                        # Yield tool start event
                        tool_description = self._get_tool_description(function_name, function_args)
                        yield {
                            "type": "tool_start",
                            "tool": function_name,
                            "description": tool_description
                        }

                        # Execute tool
                        result = await self._execute_tool(user_id, function_name, function_args)
                        _collect_video_tags(result, turn_video_tags)

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

                    # Stream the final response after tool execution - with tools enabled for chaining
                    logger.info("Getting final response after tool execution...")

                    # Loop to allow multiple rounds of tool calls
                    max_tool_rounds = 5  # Prevent infinite loops
                    tool_round = 0

                    while tool_round < max_tool_rounds:
                        tool_round += 1
                        logger.info(f"Tool response round {tool_round}...")

                        final_stream = await self.client.chat.completions.create(
                            model=self.settings.openai_model,
                            messages=messages,
                            tools=self.get_tools(),  # Keep tools available for chaining
                            tool_choice="auto",
                            max_completion_tokens=1500,
                            stream=True,
                            **self.settings.llm_tuning_params(temperature=0.7)
                        )

                        follow_up_tool_calls = {}

                        async for final_chunk in final_stream:
                            final_choice = final_chunk.choices[0] if final_chunk.choices else None
                            if not final_choice:
                                continue

                            delta = final_choice.delta

                            # Stream content tokens
                            if delta.content:
                                token = delta.content
                                full_response.append(token)
                                yield {"type": "token", "content": token}

                            # Accumulate any follow-up tool calls
                            if delta.tool_calls:
                                for tool_call_chunk in delta.tool_calls:
                                    index = tool_call_chunk.index
                                    if index not in follow_up_tool_calls:
                                        follow_up_tool_calls[index] = {
                                            "id": "",
                                            "function": {"name": "", "arguments": ""}
                                        }
                                    if tool_call_chunk.id:
                                        follow_up_tool_calls[index]["id"] = tool_call_chunk.id
                                    if tool_call_chunk.function:
                                        if tool_call_chunk.function.name:
                                            follow_up_tool_calls[index]["function"]["name"] += tool_call_chunk.function.name
                                        if tool_call_chunk.function.arguments:
                                            follow_up_tool_calls[index]["function"]["arguments"] += tool_call_chunk.function.arguments

                            # Check for finish reason
                            if final_choice.finish_reason == "tool_calls" and follow_up_tool_calls:
                                logger.info(f"Follow-up round {tool_round}: Executing {len(follow_up_tool_calls)} additional tool calls...")

                                # Add newline before tool execution
                                yield {"type": "token", "content": "\n\n"}

                                # Execute each follow-up tool call
                                follow_up_results = []
                                for idx in sorted(follow_up_tool_calls.keys()):
                                    tool_data = follow_up_tool_calls[idx]
                                    function_name = tool_data["function"]["name"]
                                    function_args = json.loads(tool_data["function"]["arguments"])

                                    logger.info(f"Follow-up executing {function_name} with args: {function_args}")
                                    tools_used.append(function_name)  # Track for reflection

                                    # Yield tool start event
                                    tool_description = self._get_tool_description(function_name, function_args)
                                    yield {
                                        "type": "tool_start",
                                        "tool": function_name,
                                        "description": tool_description
                                    }

                                    # Execute tool
                                    result = await self._execute_tool(user_id, function_name, function_args)
                                    _collect_video_tags(result, turn_video_tags)
                                    logger.info(f"Follow-up tool {function_name} result: {result}")

                                    follow_up_results.append({
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

                                # Add to messages for next round
                                messages.append({
                                    "role": "assistant",
                                    "tool_calls": [
                                        {
                                            "id": follow_up_tool_calls[i]["id"],
                                            "type": "function",
                                            "function": {
                                                "name": follow_up_tool_calls[i]["function"]["name"],
                                                "arguments": follow_up_tool_calls[i]["function"]["arguments"]
                                            }
                                        }
                                        for i in sorted(follow_up_tool_calls.keys())
                                    ]
                                })

                                for result in follow_up_results:
                                    messages.append({
                                        "role": "tool",
                                        "tool_call_id": result["tool_call_id"],
                                        "content": result["content"]
                                    })

                                # Continue the loop to process more tool calls
                                break

                            elif final_choice.finish_reason in ["stop", "length"]:
                                # No more tool calls, we're done
                                tool_round = max_tool_rounds  # Exit the loop
                                break
                        else:
                            # Stream finished without tool_calls finish reason
                            break

            # Guarantee any video the tools returned actually renders: if the model
            # described it in prose but dropped the <video-embed> tag, append it.
            accumulated_content = "".join(full_response)
            missing_tags = [
                tag for vid, tag in turn_video_tags.items()
                if vid not in accumulated_content
            ]
            if missing_tags:
                injection = "\n\n" + "\n\n".join(missing_tags)
                full_response.append(injection)
                yield {"type": "token", "content": injection}
                logger.info(f"Injected {len(missing_tags)} missing video-embed tag(s)")

            # === REFLECTION FOR STREAMING PATH ===
            accumulated_content = "".join(full_response)

            if self._requires_reflection(accumulated_content, tools_used):
                logger.info("Triggering reflection for streaming response")

                # Yield a "status" event to show reflection is happening
                yield {
                    "type": "status",
                    "message": "Reviewing plan for safety and quality..."
                }

                reflection_result = await self._reflect_on_response(
                    original_response=accumulated_content,
                    user_memories=user_memories,
                    user_profile=user_profile,
                    data_context=data_context,
                )

                if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                    logger.info(f"Response revised. Issues fixed: {reflection_result['issues']}")

                    # Yield the revised response
                    yield {
                        "type": "revision",
                        "content": reflection_result["revised_response"],
                        "issues_fixed": reflection_result["issues"]
                    }
                    accumulated_content = reflection_result["revised_response"]

            # Safety net: gpt-5.4-mini sometimes emits its whole reply twice under
            # the large system prompt (streamed doubled). Collapse it and tell the
            # frontend to replace what it showed. Conservative — only fires on an
            # exact full duplication (see text_utils).
            deduped = dedupe_repeated_response(accumulated_content)
            if deduped != accumulated_content:
                logger.info("Collapsed a duplicated streamed response")
                yield {
                    "type": "revision",
                    "content": deduped,
                    "issues_fixed": ["Removed a duplicated copy of the reply."],
                }
                accumulated_content = deduped

            # Yield completion event with final content
            yield {
                "type": "complete",
                "full_response": accumulated_content
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}

    def _requires_reflection(self, response_content: str | None, tools_used: List[str]) -> bool:
        """
        Determine if response needs self-reflection.
        Triggers on:
        1. Tool-based detection (when plan/workout creation tools are used)
        2. Content-based detection (when response contains workout/plan patterns)
        """
        if not REFLECTION_CONFIG["enabled"]:
            return False

        # Handle None or empty response content
        if not response_content:
            return False

        # Skip short responses
        if len(response_content) < REFLECTION_CONFIG["min_response_length"]:
            return False

        # Check 1: Trigger if plan/workout creation tools were used
        trigger_tools = REFLECTION_CONFIG["trigger_tools"]
        if any(tool in trigger_tools for tool in tools_used):
            logger.info("Reflection triggered by tool usage", tools=tools_used)
            return True

        # Check 2: Trigger if response contains workout/plan content patterns
        content_lower = response_content.lower()
        trigger_patterns = REFLECTION_CONFIG.get("trigger_content_patterns", [])
        for pattern in trigger_patterns:
            if pattern.lower() in content_lower:
                logger.info("Reflection triggered by content pattern", pattern=pattern)
                return True

        return False

    async def _reflect_on_response(
        self,
        original_response: str,
        user_memories: List[Dict[str, Any]],
        user_profile: Dict[str, Any],
        data_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Perform self-reflection on a response.
        Uses JSON mode for reliable parsing.
        Includes timeout and error handling.
        """
        start_time = time.time()

        # Default response if reflection fails - return original unchanged
        default_result = {
            "needs_revision": False,
            "issues": [],
            "revised_response": None,
            "reflection_latency_ms": 0,
        }

        try:
            # Extract context using correct field names
            health_memories = [m for m in user_memories if m.get("category") == "health"]
            equipment = user_profile.get("equipment", [])
            fitness_level = user_profile.get("fitnessLevel", "not set")
            goals = data_context.get("goals", [])

            # Handle unknown fitness level conservatively
            fitness_level_display = (
                fitness_level if fitness_level != "not set"
                else "Unknown - BE CONSERVATIVE, assume beginner limitations"
            )

            # Build reflection prompt
            reflection_prompt = REFLECTION_USER_PROMPT.format(
                health_memories=self._format_memories_for_reflection(health_memories) or "None specified",
                equipment=", ".join(equipment) if equipment else "Not specified",
                fitness_level=fitness_level_display,
                goals=self._format_goals_for_reflection(goals) or "None specified",
                original_response=original_response,
            )

            # Call LLM with timeout
            async with asyncio.timeout(REFLECTION_CONFIG["timeout_seconds"]):
                reflection_response = await self.client.chat.completions.create(
                    model=REFLECTION_CONFIG["model"] or self.settings.openai_model_fast,
                    messages=[
                        {"role": "system", "content": REFLECTION_SYSTEM_PROMPT},
                        {"role": "user", "content": reflection_prompt}
                    ],
                    response_format={"type": "json_object"},
                    max_completion_tokens=REFLECTION_CONFIG["max_tokens"],
                    **self.settings.llm_tuning_params(temperature=REFLECTION_CONFIG["temperature"]),
                )

            # Parse JSON response
            reflection_text = reflection_response.choices[0].message.content
            reflection_data = json.loads(reflection_text)

            latency_ms = int((time.time() - start_time) * 1000)

            result = {
                "needs_revision": reflection_data.get("issues_found", False),
                "issues": reflection_data.get("issues", []),
                "revised_response": reflection_data.get("revised_response"),
                "reflection_latency_ms": latency_ms,
            }

            # Log metrics if enabled
            if REFLECTION_CONFIG["log_metrics"]:
                logger.info(
                    "Reflection completed",
                    issues_found=result["needs_revision"],
                    latency_ms=latency_ms,
                    issues=result["issues"]
                )

            return result

        except asyncio.TimeoutError:
            logger.warning(
                f"Reflection timed out after {REFLECTION_CONFIG['timeout_seconds']}s, returning original"
            )
            return default_result
        except json.JSONDecodeError as e:
            logger.error(f"Reflection JSON parse error: {e}")
            return default_result
        except Exception as e:
            logger.error(f"Reflection failed: {e}")
            return default_result

    def _format_memories_for_reflection(self, memories: List[Dict[str, Any]]) -> str:
        """Format health memories for reflection prompt.

        Note: This method receives pre-filtered health memories only,
        so we don't include the category prefix to avoid redundancy.
        """
        if not memories:
            return ""
        return "\n".join([
            f"- {m.get('content', '')}"
            for m in memories
        ])

    def _format_goals_for_reflection(self, goals: List[Dict[str, Any]]) -> str:
        """Format goals for reflection prompt."""
        if not goals:
            return ""
        max_goals = REFLECTION_CONFIG["max_goals_in_context"]
        return "\n".join([
            f"- {g.get('name', 'Goal')}: {g.get('description', '')}"
            for g in goals[:max_goals]
        ])

    async def _execute_tool(self, user_id: str, function_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Route tool calls to appropriate service handlers"""
        # Registered skills take precedence over legacy tools.
        skill_handler = get_skill_handler(function_name)
        if skill_handler:
            logger.info("Executing skill", skill=function_name)
            return await skill_handler(self.skill_context, user_id, args)

        tool_handlers = {
            # Exercise tools
            "add_exercise": self.exercise_service.add_exercise,
            "list_exercises": self.exercise_service.list_exercises,
            "grep_exercises": self.exercise_service.grep_exercises,
            "grep_workouts": self.exercise_service.grep_workouts,
            "save_exercise_video": self.exercise_service.save_exercise_video,
            # Workout template tools
            "create_workout_template": self.workout_service.create_workout_template,
            "list_workout_templates": self.workout_service.list_workout_templates,
            "delete_workout_template": self.workout_service.delete_workout_template,
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
            # Web search & research
            "web_search": self.search_service.web_search,
            "read_url": self.search_service.read_url,
            "research": self.search_service.research,
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
