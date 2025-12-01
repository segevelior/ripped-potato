"""
Streaming chat endpoint with tool calling support
Shows AI's intermediate thinking steps and tool executions as it processes requests
"""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Dict, Any, AsyncGenerator
import json
import structlog
import time

from app.models.schemas import ChatRequest
from app.middleware.auth import get_current_user
from app.core.agents.orchestrator import AgentOrchestrator
from app.services.conversation_service import ConversationService

router = APIRouter()
logger = structlog.get_logger()


async def generate_sse_stream(
    orchestrator: AgentOrchestrator,
    message: str,
    user_context: Dict[str, Any],
    conversation_service: ConversationService,
    conversation_id: str,
    conversation_history: list = None
) -> AsyncGenerator[str, None]:
    """
    Convert orchestrator streaming events to Server-Sent Events (SSE) format.
    Handles conversation persistence with tool call markers.
    """
    start_time = time.time()
    response_parts = []  # Track all parts including tool markers
    active_tools = {}  # Track tool descriptions by name for completion matching

    try:
        # Stream events from orchestrator
        async for event in orchestrator.process_request_streaming(
            message=message,
            user_context=user_context,
            conversation_history=conversation_history
        ):
            event_type = event.get("type")

            if event_type == "token":
                # Track token content
                response_parts.append(event.get("content", ""))
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "tool_start":
                # Track tool start and inject marker into saved response
                tool_name = event.get("tool", "")
                description = event.get("description", "")
                active_tools[tool_name] = description
                response_parts.append(f"\n\n<tool-complete>{description}</tool-complete>\n\n")
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "tool_complete":
                # Tool completed - marker already added at start (as complete since we save after)
                yield f"data: {json.dumps(event)}\n\n"

            elif event_type == "complete":
                # Build full response with tool markers
                full_response = "".join(response_parts)

                # Calculate response time
                response_time_ms = int((time.time() - start_time) * 1000)

                # Save AI response to conversation (includes tool markers)
                if full_response.strip():
                    await conversation_service.add_message(
                        conversation_id=conversation_id,
                        role="ai",
                        content=full_response,
                        response_time_ms=response_time_ms
                    )
                    logger.info(f"Saved AI response to conversation {conversation_id}")

                # Send completion event with conversation_id
                yield f"data: {json.dumps({'type': 'complete', 'conversation_id': conversation_id})}\n\n"

            else:
                # Forward other events (error, reasoning) as-is
                yield f"data: {json.dumps(event)}\n\n"

        logger.info(f"Stream completed successfully for conversation {conversation_id}")

    except Exception as e:
        logger.error(f"Streaming error: {e}", exc_info=True)
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
    logger.info("STREAMING ENDPOINT CALLED")
    logger.info(f"User: {current_user.get('user_id')}")
    logger.info(f"Message: {request.message}")
    logger.info("=" * 60)

    # Check if streaming is requested (default to true for this endpoint)
    stream_header = http_request.headers.get("x-stream", "true").lower() == "true"

    if not stream_header:
        # Fallback to non-streaming if explicitly disabled
        logger.info("Falling back to non-streaming mode")
        from app.api.v1.chat import handle_chat
        return await handle_chat(request, current_user)

    # Get database and Redis connections
    from app.main import db, redis_client

    # Initialize orchestrator and conversation service
    orchestrator = AgentOrchestrator(db, redis_client)
    conversation_service = ConversationService(db)

    user_id = current_user["user_id"]

    # Get or create conversation and retrieve history
    conversation_id = request.conversation_id
    conversation_history = []

    # Keep force flags in saved messages so AI can see research intent in history
    # Title extraction handles stripping flags for display purposes

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
            logger.info(f"Loaded {len(conversation_history)} previous messages for context")

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

    logger.info(f"Using conversation {conversation_id} for user {user_id}")

    # Prepare user context
    user_context = {
        "user_id": user_id,
        "email": current_user.get("email"),
        "username": current_user.get("username"),
        "schema": request.context.get("schema") if request.context else None
    }

    # Generate streaming response
    stream_generator = generate_sse_stream(
        orchestrator=orchestrator,
        message=request.message,
        user_context=user_context,
        conversation_service=conversation_service,
        conversation_id=conversation_id,
        conversation_history=conversation_history
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
