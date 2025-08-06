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