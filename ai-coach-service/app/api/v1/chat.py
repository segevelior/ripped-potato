from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
import json
import structlog

from app.config import get_settings
from app.models.schemas import ChatRequest, ChatResponse
from app.middleware.auth import get_current_user
from app.core.agents.orchestrator import AgentOrchestrator

router = APIRouter()
logger = structlog.get_logger()


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> ChatResponse:
    """
    Main chat endpoint - uses agent orchestrator for intelligent responses with CRUD support
    """
    
    # Get database and Redis connections
    from app.main import db, redis_client
    
    # Initialize agent orchestrator with Redis for CRUD operations
    orchestrator = AgentOrchestrator(db, redis_client)
    
    # Prepare user context
    user_context = {
        "user_id": current_user["user_id"],
        "email": current_user.get("email"),
        "username": current_user.get("username"),
        "schema": request.context.get("schema") if request.context else None
    }
    
    try:
        # Process request through agent orchestrator
        result = await orchestrator.process_request(
            request.message,
            user_context
        )
        
        # Build response with pending change support
        response = ChatResponse(
            message=result.get("message", ""),
            action=result.get("action"),
            confidence=result.get("confidence", 0.8),
            suggestions=result.get("data", {}).get("suggestion", []) if isinstance(result.get("data", {}).get("suggestion"), list) else None,
            disclaimer="Remember to consult with a healthcare professional before starting any new fitness program."
        )
        
        # Add pending change information if this is a CRUD proposal
        if result.get("type") == "crud_proposal" and result.get("pending_change"):
            response.pending_change = result["pending_change"]
        
        return response
        
    except Exception as e:
        logger.error(f"Agent processing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process chat request")


@router.post("/simple", response_model=ChatResponse)
async def simple_chat(
    request: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> ChatResponse:
    """
    Simple chat endpoint - direct OpenAI call without agents (fallback)
    """
    from openai import AsyncOpenAI
    from app.services.context_service import ContextService
    
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    
    # Get user context
    from app.main import db
    context_service = ContextService(db)
    user_context = await context_service.get_user_context(current_user["user_id"])
    
    # Build messages
    messages = [
        {
            "role": "system",
            "content": """You are an AI fitness coach assistant. Help users with workouts, exercises, and fitness goals.
            Be supportive, knowledgeable, and practical. Keep responses concise and actionable."""
        }
    ]
    
    # Add context
    if user_context:
        context_str = f"\nUser Level: {user_context.get('fitness_level', 'intermediate')}"
        if user_context.get('goals'):
            context_str += f"\nGoals: {', '.join(user_context['goals'][:3])}"
        messages[0]["content"] += context_str
    
    # Add current message
    messages.append({"role": "user", "content": request.message})
    
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )
        
        return ChatResponse(
            message=response.choices[0].message.content,
            confidence=0.85
        )
        
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process chat request")


# Alias for the streaming fallback
handle_chat = simple_chat