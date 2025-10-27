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

from app.config import get_settings
from app.models.schemas import ChatRequest
from app.middleware.auth import get_current_user
from app.core.agents.orchestrator import AgentOrchestrator
from app.core.agents.data_reader import DataReaderAgent

router = APIRouter()
logger = structlog.get_logger()


async def generate_stream_with_reasoning(
    message: str,
    user_context: Dict[str, Any],
    settings: Any,
    orchestrator: AgentOrchestrator,
    data_reader: DataReaderAgent
) -> AsyncGenerator[str, None]:
    """
    Generate streaming response with tool calling and reasoning steps shown to user.
    The AI can use tools to interact with the database while streaming.
    """
    logger.info(f"📝 generate_stream_with_reasoning called with message: {message[:50]}...")
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

When users ask to add exercises (like "add muscle ups to my exercises"), use add_exercise.
When they want to create workouts or goals, use create_workout or create_goal.
When they want to update an existing goal, use update_goal.
When they want to update a plan's details (name, status, start date, schedule), use update_plan.
When they want to add or remove weekly workouts in a plan, use add_plan_workout or remove_plan_workout.

IMPORTANT: Show your thinking process naturally as you work:
- Before calling a tool, explain what you're about to do
- After getting results, explain what happened
- Be conversational and guide users through your process

For example:
- "Let me create that workout for you..."
- "I'm adding these exercises to your predefined workouts..."
- "Great! I've successfully added the workout to your library."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"{context_str}\n\nUser: {message}"}
    ]

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
                            "add_exercise": f"Adding {function_args.get('name', 'exercise')} to your library",
                            "create_workout": f"Creating {function_args.get('name', 'workout')}",
                            "create_goal": f"Setting up {function_args.get('name', 'fitness goal')}",
                            "update_goal": "Updating your fitness goal",
                            "update_plan": "Updating your training plan",
                            "add_plan_workout": f"Adding workout to week {function_args.get('weekNumber', '')}",
                            "remove_plan_workout": f"Removing workout from week {function_args.get('weekNumber', '')}"
                        }

                        # Send tool execution start event
                        tool_display_name = tool_descriptions.get(function_name, f"Processing {function_name}")
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': function_name, 'description': tool_display_name})}\n\n"

                        # Execute using orchestrator's methods
                        if function_name == "add_exercise":
                            result = await orchestrator._add_exercise(user_id, function_args)
                        elif function_name == "create_workout":
                            result = await orchestrator._create_workout(user_id, function_args)
                        elif function_name == "create_goal":
                            result = await orchestrator._create_goal(user_id, function_args)
                        elif function_name == "update_goal":
                            result = await orchestrator._update_goal(user_id, function_args)
                        elif function_name == "update_plan":
                            result = await orchestrator._update_plan(user_id, function_args)
                        elif function_name == "add_plan_workout":
                            result = await orchestrator._add_plan_workout(user_id, function_args)
                        elif function_name == "remove_plan_workout":
                            result = await orchestrator._remove_plan_workout(user_id, function_args)
                        else:
                            result = {"error": f"Unknown function: {function_name}"}

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
                            yield f"data: {json.dumps({'type': 'token', 'content': final_choice.delta.content})}\n\n"

        # Send completion event
        logger.info(f"✅ Stream completed successfully. Total chunks: {token_count}")
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

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

    # Initialize orchestrator and data reader (same as non-streaming endpoint)
    orchestrator = AgentOrchestrator(db, redis_client)
    data_reader = DataReaderAgent(db)

    # Prepare user context
    user_context = {
        "user_id": current_user["user_id"],
        "email": current_user.get("email"),
        "username": current_user.get("username"),
        "schema": request.context.get("schema") if request.context else None
    }

    logger.info(f"✅ Starting stream generation for user {current_user['user_id']}")

    # Generate streaming response with tools
    stream_generator = generate_stream_with_reasoning(
        request.message,
        user_context,
        settings,
        orchestrator,
        data_reader
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