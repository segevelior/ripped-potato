"""
Conversation history endpoints for chat management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from typing import Any, Optional
import structlog

from app.models.schemas import (
    ConversationCreate,
    ConversationDocument,
    ConversationHistoryResponse,
    ConversationSummary,
    MessageFeedbackRequest,
    FeedbackResponse,
    PaginatedFeedbackResponse
)
from app.middleware.auth import get_current_user
from app.services.conversation_service import ConversationService

router = APIRouter()
logger = structlog.get_logger()


def get_conversation_service(request: Request) -> ConversationService:
    """Get conversation service with DB from app state"""
    return ConversationService(request.app.state.db)


# ============ User Endpoints ============

@router.post("/", status_code=201)
async def create_conversation(
    data: ConversationCreate,
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Create a new conversation.

    Creates a new conversation for the authenticated user.
    Title is auto-generated from initial message if not provided.
    """
    try:
        # Ensure user can only create conversations for themselves
        if data.user_id != current_user["user_id"]:
            raise HTTPException(
                status_code=403,
                detail="Cannot create conversations for other users"
            )

        service = get_conversation_service(request)
        result = await service.create_conversation(
            user_id=data.user_id,
            title=data.title,
            initial_message=data.initial_message
        )

        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("message"))

        logger.info(f"Created conversation {result['conversation_id']} for user {data.user_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=ConversationHistoryResponse)
async def get_my_conversation_history(
    request: Request,
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    skip: int = Query(0, ge=0, description="Items to skip"),
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Get conversation history for the authenticated user.

    Returns a list of conversation summaries sorted by most recent.
    """
    try:
        service = get_conversation_service(request)
        result = await service.get_user_conversations(
            user_id=current_user["user_id"],
            limit=limit,
            skip=skip
        )

        return result

    except Exception as e:
        logger.error(f"Error fetching conversation history: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Get a conversation by ID.

    Returns the full conversation with all messages.
    Users can only access their own conversations.
    """
    try:
        service = get_conversation_service(request)
        conversation = await service.get_conversation(
            conversation_id=conversation_id,
            user_id=current_user["user_id"]
        )

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return conversation

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Delete a conversation.

    Users can only delete their own conversations.
    """
    try:
        service = get_conversation_service(request)
        deleted = await service.delete_conversation(
            conversation_id=conversation_id,
            user_id=current_user["user_id"]
        )

        if not deleted:
            raise HTTPException(status_code=404, detail="Conversation not found")

        logger.info(f"Deleted conversation {conversation_id}")
        return {"status": "success", "message": "Conversation deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation {conversation_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{conversation_id}/title")
async def update_conversation_title(
    conversation_id: str,
    request: Request,
    title: str = Query(..., min_length=1, max_length=200),
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Update conversation title.

    Users can only update their own conversations.
    """
    try:
        service = get_conversation_service(request)
        updated = await service.update_title(
            conversation_id=conversation_id,
            title=title,
            user_id=current_user["user_id"]
        )

        if not updated:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return {"status": "success", "message": "Title updated", "title": title}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating conversation title: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{conversation_id}/feedback", response_model=FeedbackResponse)
async def submit_feedback(
    conversation_id: str,
    feedback: MessageFeedbackRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Submit feedback for a message in a conversation.

    Stores thumbs up/down rating and optional text feedback.
    """
    try:
        service = get_conversation_service(request)

        # Verify user owns this conversation
        conversation = await service.get_conversation(
            conversation_id=conversation_id,
            user_id=current_user["user_id"]
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Extract previews
        question_preview = feedback.question[:100] if feedback.question else None
        answer_preview = feedback.answer[:100] if feedback.answer else None

        success = await service.add_feedback(
            conversation_id=conversation_id,
            message_index=feedback.message_index,
            rating=feedback.rating,
            feedback_text=feedback.feedback_text,
            question_preview=question_preview,
            answer_preview=answer_preview
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to save feedback")

        logger.info(f"Feedback saved for conversation {conversation_id}")
        return FeedbackResponse(
            status="success",
            message="Feedback submitted successfully",
            conversation_id=conversation_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============ Admin Endpoints ============

@router.get("/admin/feedbacks", response_model=PaginatedFeedbackResponse)
async def get_all_feedbacks(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page"),
    rating: Optional[str] = Query(None, description="Filter by rating"),
    user_id: Optional[str] = Query(None, description="Filter by user_id"),
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Get all feedbacks with pagination (Admin only).

    Returns paginated feedback entries with previews.
    TODO: Add admin role check
    """
    try:
        service = get_conversation_service(request)
        result = await service.get_paginated_feedbacks(
            page=page,
            limit=limit,
            rating=rating,
            user_id=user_id
        )

        return result

    except Exception as e:
        logger.error(f"Error fetching feedbacks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/conversations/{conversation_id}")
async def admin_get_conversation(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Get any conversation by ID (Admin only).

    Admin can access any conversation regardless of owner.
    TODO: Add admin role check
    """
    try:
        service = get_conversation_service(request)
        conversation = await service.get_conversation(
            conversation_id=conversation_id,
            user_id=None  # Admin can access any
        )

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return conversation

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching conversation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/user/{user_id}/history", response_model=ConversationHistoryResponse)
async def admin_get_user_history(
    user_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
) -> Any:
    """
    Get conversation history for any user (Admin only).

    TODO: Add admin role check
    """
    try:
        service = get_conversation_service(request)
        result = await service.get_user_conversations(
            user_id=user_id,
            limit=limit,
            skip=skip
        )

        return result

    except Exception as e:
        logger.error(f"Error fetching user history: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
