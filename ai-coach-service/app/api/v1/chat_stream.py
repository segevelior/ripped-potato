"""
Streaming chat endpoint with tool calling support
Shows AI's intermediate thinking steps and tool executions as it processes requests
"""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Dict, Any, AsyncGenerator
import json
import structlog
from openai import AsyncOpenAI
import asyncio
import time

from app.config import get_settings
from app.models.schemas import ChatRequest
from app.middleware.auth import get_current_user
from app.core.agents.orchestrator import AgentOrchestrator
from app.core.agents.data_reader import DataReaderAgent
from app.services.conversation_service import ConversationService

router = APIRouter()
logger = structlog.get_logger()


async def generate_stream_with_reasoning(
    message: str,
    user_context: Dict[str, Any],
    settings: Any,
    orchestrator: AgentOrchestrator,
    data_reader: DataReaderAgent,
    conversation_service: ConversationService,
    conversation_id: str,
    conversation_history: list = None
) -> AsyncGenerator[str, None]:
    """
    Generate streaming response with tool calling and reasoning steps shown to user.
    The AI can use tools to interact with the database while streaming.
    Saves messages to conversation history.
    """
    logger.info(f"📝 generate_stream_with_reasoning called with message: {message[:50]}...")
    start_time = time.time()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    user_id = user_context.get("user_id")

    # Read user data for context (same as non-streaming)
    logger.info(f"Processing request for user {user_id}")
    data_context = await data_reader.process(message, user_context)

    # Build context string
    context_str = f"""User has:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} workouts
- {len(data_context.get('goals', []))} goals"""

    # System prompt (same as orchestrator but with streaming guidance)
    system_prompt = """You are an expert AI fitness coach helping users manage their fitness journey.

TOOL USAGE:
- grep_exercises: Search ALL available exercises (common + user's custom). Use output_mode="both" to find similar exercises when exact match not found.
- add_exercise: Add new exercises. ALWAYS use grep_exercises first to check if it exists!
- create_workout_template: Create workout templates with exercise blocks.
- log_workout: Record completed workouts.
- create_plan: Create training plans.
- update_plan, add_plan_workout, remove_plan_workout: Manage plans.
- create_goal, update_goal: Manage fitness goals.

When user asks "do I have X exercise?" use grep_exercises with output_mode="both".

IMPORTANT: Show your thinking process naturally as you work:
- Before calling a tool, explain what you're about to do
- After getting results, explain what happened
- Be conversational and guide users through your process

For example:
- "Let me search for that exercise..."
- "I found a similar exercise called X - is that what you meant?"
- "Great! I've successfully added the workout to your library."""

    # Build messages array with conversation history
    messages = [
        {"role": "system", "content": system_prompt},
    ]

    # Add conversation history if available (excluding the current message which we'll add separately)
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

    # Track the full response for saving to conversation
    full_response = []

    try:
        # Create streaming completion WITH TOOLS
        logger.info(f"🤖 Calling OpenAI API with model: {settings.openai_model} and {len(orchestrator.get_tools())} tools")
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            tools=orchestrator.get_tools(),  # CRITICAL: Add tools for function calling
            tool_choice="auto",
            temperature=0.7,
            max_tokens=1500,
            stream=True
        )

        logger.info("✅ OpenAI stream created successfully, starting to stream tokens...")
        token_count = 0
        tool_calls_data = {}  # Accumulate tool call chunks by index

        # Stream tokens as SSE events
        async for chunk in stream:
            token_count += 1

            # Log the entire chunk for debugging
            logger.debug(f"Chunk #{token_count}: {chunk}")

            # Check for different types of content in the chunk
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                logger.warning(f"Chunk #{token_count} has no choices")
                continue

            delta = choice.delta

            # Stream content tokens
            if delta.content:
                logger.debug(f"Token #{token_count}: '{delta.content}'")
                token = delta.content
                full_response.append(token)  # Capture for saving
                # Format as Server-Sent Event
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                # Optional: Small delay for more natural feel on punctuation
                if token in ['.', '!', '?'] and len(token) == 1:
                    await asyncio.sleep(0.05)

            # Accumulate tool call chunks
            if delta.tool_calls:
                logger.info(f"🔧 Tool call chunk detected in chunk #{token_count}")
                for tool_call_chunk in delta.tool_calls:
                    index = tool_call_chunk.index
                    if index not in tool_calls_data:
                        tool_calls_data[index] = {
                            "id": "",
                            "function": {"name": "", "arguments": ""}
                        }

                    # Accumulate tool call data
                    if tool_call_chunk.id:
                        tool_calls_data[index]["id"] = tool_call_chunk.id
                    if tool_call_chunk.function:
                        if tool_call_chunk.function.name:
                            tool_calls_data[index]["function"]["name"] += tool_call_chunk.function.name
                        if tool_call_chunk.function.arguments:
                            tool_calls_data[index]["function"]["arguments"] += tool_call_chunk.function.arguments

            # Check for finish reason
            if choice.finish_reason:
                logger.info(f"🏁 Finish reason: {choice.finish_reason}")

                # If finish reason is tool_calls, execute them and continue
                if choice.finish_reason == "tool_calls" and tool_calls_data:
                    logger.info(f"🔧 Executing {len(tool_calls_data)} tool calls...")

                    # Send a message to user that we're executing tools
                    newline_event = json.dumps({'type': 'token', 'content': '\n\n'})
                    yield f"data: {newline_event}\n\n"

                    # Execute each tool call
                    tool_results = []
                    for index in sorted(tool_calls_data.keys()):
                        tool_data = tool_calls_data[index]
                        function_name = tool_data["function"]["name"]
                        function_args = json.loads(tool_data["function"]["arguments"])

                        logger.info(f"🔧 Executing {function_name} with args: {function_args}")

                        # Map tool names to user-friendly descriptions
                        tool_descriptions = {
                            # Exercise tools
                            "add_exercise": f"Adding {function_args.get('name', 'exercise')} to your library",
                            "list_exercises": "Searching exercises in the database",
                            "grep_exercises": f"Grep searching {len(function_args.get('patterns', []))} exercise patterns",
                            "grep_workouts": f"Grep searching {len(function_args.get('patterns', []))} workout patterns",
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
                            "list_goals": "Fetching your fitness goals"
                        }

                        # Send tool execution start event
                        tool_display_name = tool_descriptions.get(function_name, f"Processing {function_name}")
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': function_name, 'description': tool_display_name})}\n\n"

                        # Execute using orchestrator's unified tool router
                        result = await orchestrator._execute_tool(user_id, function_name, function_args)

                        logger.info(f"✅ Tool {function_name} result: {result}")

                        tool_results.append({
                            "tool_call_id": tool_data["id"],
                            "role": "tool",
                            "content": json.dumps(result)
                        })

                        # Send tool completion event with the result message
                        yield f"data: {json.dumps({'type': 'tool_complete', 'tool': function_name, 'success': result.get('success', False), 'message': result.get('message', '')})}\n\n"

                    # Now get the final response from OpenAI with tool results
                    logger.info("🤖 Getting final response after tool execution...")

                    # Build message history with tool results
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

                    # Stream the final response
                    final_stream = await client.chat.completions.create(
                        model=settings.openai_model,
                        messages=messages,
                        temperature=0.7,
                        max_tokens=500,
                        stream=True
                    )

                    async for final_chunk in final_stream:
                        final_choice = final_chunk.choices[0] if final_chunk.choices else None
                        if final_choice and final_choice.delta.content:
                            full_response.append(final_choice.delta.content)  # Capture for saving
                            yield f"data: {json.dumps({'type': 'token', 'content': final_choice.delta.content})}\n\n"

        # Calculate response time
        response_time_ms = int((time.time() - start_time) * 1000)

        # Save AI response to conversation
        final_response_text = "".join(full_response)
        if final_response_text:
            await conversation_service.add_message(
                conversation_id=conversation_id,
                role="ai",
                content=final_response_text,
                response_time_ms=response_time_ms
            )
            logger.info(f"💾 Saved AI response to conversation {conversation_id}")

        # Send completion event with conversation_id
        logger.info(f"✅ Stream completed successfully. Total chunks: {token_count}")
        yield f"data: {json.dumps({'type': 'complete', 'conversation_id': conversation_id})}\n\n"

    except Exception as e:
        logger.error(f"❌ Streaming error: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    http_request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> StreamingResponse:
    """
    Streaming chat endpoint with tool calling support.
    Returns Server-Sent Events (SSE) with token-by-token streaming.

    The AI can use tools to interact with the database while showing its reasoning process.

    Headers:
        x-stream: "true" (default) for streaming, "false" for non-streaming
    """
    logger.info("=" * 60)
    logger.info("🚀 STREAMING ENDPOINT CALLED")
    logger.info(f"User: {current_user.get('user_id')}")
    logger.info(f"Message: {request.message}")
    logger.info(f"Headers: {dict(http_request.headers)}")
    logger.info("=" * 60)

    # Check if streaming is requested (default to true for this endpoint)
    stream_header = http_request.headers.get("x-stream", "true").lower() == "true"
    logger.info(f"Streaming enabled: {stream_header}")

    if not stream_header:
        # Fallback to non-streaming if explicitly disabled
        logger.info("Falling back to non-streaming mode")
        from app.api.v1.chat import handle_chat
        return await handle_chat(request, current_user)

    settings = get_settings()

    # Get database and Redis connections
    from app.main import db, redis_client

    # Initialize orchestrator, data reader, and conversation service
    orchestrator = AgentOrchestrator(db, redis_client)
    data_reader = DataReaderAgent(db)
    conversation_service = ConversationService(db)

    user_id = current_user["user_id"]

    # Get or create conversation and retrieve history
    conversation_id = request.conversation_id
    conversation_history = []

    if conversation_id:
        # Verify conversation exists and belongs to user
        existing = await conversation_service.get_conversation(conversation_id, user_id)
        if not existing:
            # Create new if not found
            result = await conversation_service.create_conversation(
                user_id=user_id,
                initial_message=request.message
            )
            conversation_id = result["conversation_id"]
        else:
            # Get existing conversation history for context
            conversation_history = existing.get("messages", [])
            logger.info(f"📚 Loaded {len(conversation_history)} previous messages for context")

            # Add human message to existing conversation
            await conversation_service.add_message(
                conversation_id=conversation_id,
                role="human",
                content=request.message
            )
    else:
        # Create new conversation with initial message
        result = await conversation_service.create_conversation(
            user_id=user_id,
            initial_message=request.message
        )
        conversation_id = result["conversation_id"]

    logger.info(f"💬 Using conversation {conversation_id} for user {user_id}")

    # Prepare user context
    user_context = {
        "user_id": user_id,
        "email": current_user.get("email"),
        "username": current_user.get("username"),
        "schema": request.context.get("schema") if request.context else None
    }

    logger.info(f"✅ Starting stream generation for user {user_id}")

    # Generate streaming response with tools
    stream_generator = generate_stream_with_reasoning(
        request.message,
        user_context,
        settings,
        orchestrator,
        data_reader,
        conversation_service,
        conversation_id,
        conversation_history
    )

    return StreamingResponse(
        stream_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )