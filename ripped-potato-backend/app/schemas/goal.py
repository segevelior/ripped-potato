from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from beanie import PydanticObjectId


class GoalProgressCreate(BaseModel):
    """Schema for creating a progress snapshot"""
    date: datetime = Field(default_factory=datetime.utcnow)
    value: float
    notes: Optional[str] = None


class GoalProgressResponse(BaseModel):
    """Schema for progress snapshot response"""
    date: datetime
    value: float
    notes: Optional[str] = None


class GoalBase(BaseModel):
    """Base goal schema"""
    name: str
    description: Optional[str] = None
    goal_type: str  # strength, endurance, weight_loss, weight_gain, custom
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    starting_value: Optional[float] = None
    deadline: Optional[datetime] = None
    priority: str = Field(default="medium")  # low, medium, high
    category: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

    @validator('goal_type')
    def validate_goal_type(cls, v):
        valid_types = ['strength', 'endurance', 'weight_loss', 'weight_gain', 'custom']
        if v not in valid_types:
            raise ValueError(f'goal_type must be one of {valid_types}')
        return v

    @validator('priority')
    def validate_priority(cls, v):
        valid_priorities = ['low', 'medium', 'high']
        if v not in valid_priorities:
            raise ValueError(f'priority must be one of {valid_priorities}')
        return v


class GoalCreate(GoalBase):
    """Schema for creating a goal"""
    associated_exercise_ids: List[PydanticObjectId] = Field(default_factory=list)
    plan_id: Optional[PydanticObjectId] = None


class GoalUpdate(BaseModel):
    """Schema for updating a goal"""
    name: Optional[str] = None
    description: Optional[str] = None
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    current_value: Optional[float] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    associated_exercise_ids: Optional[List[PydanticObjectId]] = None
    associated_workout_ids: Optional[List[PydanticObjectId]] = None

    @validator('status')
    def validate_status(cls, v):
        if v is not None:
            valid_statuses = ['active', 'completed', 'paused', 'abandoned']
            if v not in valid_statuses:
                raise ValueError(f'status must be one of {valid_statuses}')
        return v

    @validator('priority')
    def validate_priority(cls, v):
        if v is not None:
            valid_priorities = ['low', 'medium', 'high']
            if v not in valid_priorities:
                raise ValueError(f'priority must be one of {valid_priorities}')
        return v


class GoalResponse(BaseModel):
    """Schema for goal response"""
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    name: str
    description: Optional[str] = None
    goal_type: str
    target_value: Optional[float] = None
    target_unit: Optional[str] = None
    current_value: Optional[float] = None
    starting_value: Optional[float] = None
    start_date: datetime
    deadline: Optional[datetime] = None
    status: str
    completed_date: Optional[datetime] = None
    progress_snapshots: List[GoalProgressResponse]
    progress_percentage: Optional[float] = None
    associated_exercise_ids: List[PydanticObjectId]
    associated_workout_ids: List[PydanticObjectId]
    plan_id: Optional[PydanticObjectId] = None
    priority: str
    category: Optional[str] = None
    tags: List[str]
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            PydanticObjectId: str,
            datetime: lambda v: v.isoformat()
        }


class GoalListResponse(BaseModel):
    """Schema for paginated goal list"""
    items: List[GoalResponse]
    total: int
    page: int
    pages: int
    size: int


class GoalSearchRequest(BaseModel):
    """Schema for goal search request"""
    name: Optional[str] = None
    goal_type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    deadline_before: Optional[datetime] = None
    deadline_after: Optional[datetime] = None
    progress_min: Optional[float] = Field(None, ge=0, le=100)
    progress_max: Optional[float] = Field(None, ge=0, le=100)


class AddProgressRequest(BaseModel):
    """Schema for adding progress to a goal"""
    value: float
    date: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    update_current: bool = Field(default=True)  # Also update current_value