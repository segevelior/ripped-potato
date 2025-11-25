from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ChatMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)
    metadata: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[ChatMessage]] = []
    conversation_id: Optional[str] = None  # For continuing existing conversations


class ChatResponse(BaseModel):
    message: str
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    sources: Optional[List[str]] = []
    suggestions: Optional[List[Dict[str, Any]]] = []
    action: Optional[Dict[str, Any]] = None  # For structured actions like create_goal
    disclaimer: Optional[str] = None
    pending_change: Optional[Dict[str, Any]] = None  # For CRUD operations requiring confirmation


class UserContext(BaseModel):
    user_id: str
    fitness_level: Optional[str] = None
    goals: Optional[List[str]] = []
    recent_workouts: Optional[List[Dict[str, Any]]] = []
    preferences: Optional[Dict[str, Any]] = {}


# ============ Conversation History Models ============

class ConversationMessage(BaseModel):
    """Individual message in a conversation."""
    model_config = ConfigDict(from_attributes=True)

    role: str = Field(..., pattern="^(human|ai)$")
    content: str
    timestamp: Optional[str] = None
    response_time_ms: Optional[int] = None  # Only for AI responses


class ModelInfo(BaseModel):
    """Information about the LLM used for the conversation."""
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    embedding_model: Optional[str] = None
    embedding_provider: Optional[str] = None


class ConversationFeedback(BaseModel):
    """Feedback for a specific message in a conversation."""
    message_index: int
    rating: Optional[str] = Field(None, pattern="^(thumbs_up|thumbs_down)$")
    feedback_text: Optional[str] = None
    timestamp: Optional[str] = None
    question_preview: Optional[str] = None
    answer_preview: Optional[str] = None


class ConversationMetadata(BaseModel):
    """Metadata for a conversation."""
    user_id: str


class ConversationCreate(BaseModel):
    """Request to create a new conversation."""
    title: Optional[str] = None  # Auto-generated from first message if not provided
    user_id: str
    initial_message: Optional[str] = None


class ConversationDocument(BaseModel):
    """Full conversation document as stored in MongoDB."""
    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = Field(None, alias="_id")
    conversation_id: str
    title: str
    messages: List[ConversationMessage] = []
    metadata: ConversationMetadata
    model_info: ModelInfo = Field(default_factory=ModelInfo)
    feedback: List[ConversationFeedback] = []
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class ConversationSummary(BaseModel):
    """Summary of a conversation for listing."""
    conversation_id: str
    title: str
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    message_count: int = 0


class ConversationHistoryResponse(BaseModel):
    """Response for user's conversation history."""
    conversations: List[ConversationSummary] = []
    total: int = 0


class MessageFeedbackRequest(BaseModel):
    """Request to submit feedback for a message."""
    message_index: int
    rating: Optional[str] = Field(None, pattern="^(thumbs_up|thumbs_down)$")
    feedback_text: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""
    status: str
    message: str
    conversation_id: str


class FeedbackSummary(BaseModel):
    """Summary of a feedback entry for listing."""
    conversation_id: str
    message_index: int
    rating: Optional[str] = None
    feedback_text: Optional[str] = None
    question_preview: Optional[str] = None
    answer_preview: Optional[str] = None
    timestamp: Optional[str] = None
    user_id: str


class PaginatedFeedbackResponse(BaseModel):
    """Paginated response for feedback listing."""
    feedbacks: List[FeedbackSummary] = []
    total: int = 0
    page: int = 1
    limit: int = 50
    total_pages: int = 0