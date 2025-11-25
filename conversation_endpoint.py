from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Any, Optional

from app.models.conversation_models import (
    PaginatedFeedbackResponse,
    ConversationHistoryResponse
)
from app.core import logger
from app.core.context import AltecoContext, get_alteco_context
from app.api.dependencies import require_admin
from app.services.conversations import ConversationsService

router = APIRouter()
conversations_service = ConversationsService()


@router.get("/feedbacks", response_model=PaginatedFeedbackResponse)
async def get_all_feedbacks(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (starts at 1)"),
    limit: int = Query(50, ge=1, le=200, description="Items per page (max 200)"),
    rating: Optional[str] = Query(None, description="Filter by rating: thumbs_up or thumbs_down"),
    user_id: Optional[str] = Query(None, description="Filter by user_id"),
    context: AltecoContext = Depends(require_admin)
) -> Any:
    """
    Get all feedbacks with pagination and filtering (Admin only).

    Admin endpoint to fetch all feedback entries with previews for table display.
    Supports pagination and optional filtering by rating and user_id.

    Args:
        page: Page number (starts at 1)
        limit: Number of items per page (max 200)
        rating: Optional filter by rating (thumbs_up or thumbs_down)
        user_id: Optional filter by user_id
        context: Admin context (injected by dependency)

    Returns:
        Paginated list of feedback summaries with metadata

    Raises:
        403: If user is not an admin
    """
    try:
        logger.info(
            f"Admin {context.user_id} fetching feedbacks - "
            f"page={page}, limit={limit}, rating={rating}, user_id={user_id}"
        )

        return conversations_service.get_paginated_feedbacks(
            page=page,
            limit=limit,
            rating=rating,
            user_id=user_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching feedbacks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: str,
    request: Request,
    context: AltecoContext = Depends(require_admin)
) -> Any:
    """
    Get full conversation details by ID (Admin only).

    Admin endpoint to fetch complete conversation with all messages,
    metadata, and feedback. Used for "Show full conversation" modal.

    Args:
        conversation_id: The conversation ID to fetch
        context: Admin context (injected by dependency)

    Returns:
        Complete conversation document

    Raises:
        403: If user is not an admin
        404: If conversation not found
    """
    try:
        logger.info(f"Admin {context.user_id} fetching conversation: {conversation_id}")

        conversation = conversations_service.get_conversation_by_id(conversation_id)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return conversation

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/history/{user_id}", response_model=ConversationHistoryResponse)
async def get_user_conversation_history(
    user_id: str,
    request: Request,
    context: AltecoContext = Depends(get_alteco_context)
) -> Any:
    """
    Get conversation history for a user (Self-access or Admin).

    Fetch list of conversations for a user. Users can only access their own
    history unless they are admins.

    Security:
        - Users can access their own data (context.user_id == user_id)
        - Admins can access any user's data (context.is_alteco = True)

    Args:
        user_id: The user ID to fetch conversations for
        context: User/admin context (injected by dependency)

    Returns:
        List of conversation summaries (conversation_id, title, created_at)

    Raises:
        403: If user tries to access another user's data
    """
    try:
        # Check authorization: self or admin
        if not context.is_alteco and context.user_id != user_id:
            logger.warning(
                f"Unauthorized access: user {context.user_id} attempted to access "
                f"conversation history for user {user_id}"
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied. You can only access your own conversation history."
            )

        logger.info(
            f"{'Admin' if context.is_alteco else 'User'} {context.user_id} "
            f"fetching conversation history for user: {user_id}"
        )

        return conversations_service.get_user_conversation_history(user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching history for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Any
from datetime import datetime

from app.models.base_models import MessageFeedback, FeedbackResponse
from app.core import logger
from app.core.context import get_alteco_context
from app.services.memory_service import ConversationMemory

router = APIRouter()


@router.post("/feedback")
async def submit_feedback(
    feedback: MessageFeedback,
    http_request: Request,
) -> Any:
    """
    Submit feedback for a specific message in a conversation.
    Stores thumbs up/down rating and optional text feedback.
    Uses new chatConversations collection.

    Includes question and answer previews (first 100 chars) for context.

    Returns:
        FeedbackResponse with status and confirmation
    """
    logger.info(f"Received feedback for conversation: {feedback.conversation_id}")
    logger.info(f"Feedback details: rating={feedback.rating}, message_index={feedback.message_index}")

    try:
        # Add timestamp if not provided
        if not feedback.timestamp:
            feedback.timestamp = datetime.utcnow().isoformat()

        # Extract question and answer previews (first 100 chars) from request
        question_preview = feedback.question[:100] if feedback.question else None
        answer_preview = feedback.answer[:100] if feedback.answer else None

        # Store feedback in MongoDB via memory service (now uses chatConversations collection)
        memory = ConversationMemory(conversation_id=feedback.conversation_id)
        memory.store_feedback(
            message_index=feedback.message_index,
            rating=feedback.rating,
            feedback_text=feedback.feedback_text,
            timestamp=feedback.timestamp,
            question_preview=question_preview,
            answer_preview=answer_preview
        )

        logger.info(f"Feedback stored successfully for conversation {feedback.conversation_id}")

        return FeedbackResponse(
            status="success",
            message="Feedback submitted successfully",
            conversation_id=feedback.conversation_id
        )

    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class MessageFeedback(BaseModel):
    conversation_id: str
    message_index: int  # Index of the message in the conversation
    rating: Optional[str] = None  # "thumbs_up" or "thumbs_down"
    feedback_text: Optional[str] = None  # Optional text feedback
    user_id: Optional[str] = None
    timestamp: Optional[str] = None
    question: Optional[str] = None  # The user's question that was rated
    answer: Optional[str] = None  # The bot's answer that was rated


class FeedbackResponse(BaseModel):
    status: str
    message: str
    conversation_id: str