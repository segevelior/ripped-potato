"""
Minimal streaming chat endpoint with reasoning support for POC
Shows AI's intermediate thinking steps as it processes requests
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

router = APIRouter()
logger = structlog.get_logger()


async def generate_stream_with_reasoning(
    message: str,
    user_context: Dict[str, Any],
    settings: Any
) -> AsyncGenerator[str, None]:
    """
    Generate streaming response with reasoning steps shown to user.
    The AI naturally shows its thinking process through the prompt.
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # System prompt that encourages step-by-step reasoning
    system_prompt = """You are an AI fitness coach assistant. Help users with workouts, exercises, and fitness goals.

IMPORTANT: When responding to requests, show your thinking process naturally by:
1. First stating what you're going to do
2. Then describing each step as you work through it  
3. Finally providing the complete answer

For example, if asked to create a workout, say things like:
- "Let me create a 15-minute core workout for you..."
- "I'll start by selecting appropriate exercises..."
- "Adding rest intervals between sets..."
- "Here's your complete workout:"

If asked about exercises, show your process:
- "Let me check what exercises would work best..."
- "I found some great options for your fitness level..."
- "Here are my recommendations:"

Be conversational and show your work process naturally."""

    # Add user context if available
    if user_context:
        context_str = f"\n\nUser Context:"
        context_str += f"\n- User ID: {user_context.get('user_id')}"
        if user_context.get('username'):
            context_str += f"\n- Name: {user_context.get('username')}"
        if user_context.get('fitness_level'):
            context_str += f"\n- Fitness Level: {user_context['fitness_level']}"
        system_prompt += context_str

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message}
    ]

    try:
        # Create streaming completion
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.7,
            max_tokens=1500,
            stream=True
        )

        # Stream tokens as SSE events
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                # Format as Server-Sent Event
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                # Optional: Small delay for more natural feel on punctuation
                if token in ['.', '!', '?'] and len(token) == 1:
                    await asyncio.sleep(0.05)

        # Send completion event
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

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
    Minimal streaming chat endpoint for POC.
    Returns Server-Sent Events (SSE) with token-by-token streaming.
    
    The AI shows its reasoning process naturally through the response.

    Headers:
        x-stream: "true" (default) for streaming, "false" for non-streaming
    """

    # Check if streaming is requested (default to true for this endpoint)
    stream_header = http_request.headers.get("x-stream", "true").lower() == "true"

    if not stream_header:
        # Fallback to non-streaming if explicitly disabled
        from app.api.v1.chat import handle_chat
        return await handle_chat(request, current_user)

    settings = get_settings()

    # Prepare user context
    user_context = {
        "user_id": current_user["user_id"],
        "email": current_user.get("email"),
        "username": current_user.get("username")
    }

    logger.info(f"Streaming request from user {current_user['user_id']}: {request.message[:50]}...")

    # Generate streaming response
    stream_generator = generate_stream_with_reasoning(request.message, user_context, settings)

    return StreamingResponse(
        stream_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )