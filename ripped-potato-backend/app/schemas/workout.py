from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator
from beanie import PydanticObjectId


class WorkoutSetBase(BaseModel):
    """Base schema for workout set"""
    reps: Optional[int] = None
    weight: Optional[float] = None
    distance: Optional[float] = None
    duration: Optional[int] = None
    rest: Optional[int] = None
    rpe: Optional[float] = Field(None, ge=1, le=10)
    notes: Optional[str] = None


class WorkoutSetCreate(WorkoutSetBase):
    """Schema for creating a workout set"""
    pass


class WorkoutExerciseBase(BaseModel):
    """Base schema for workout exercise"""
    exercise_id: PydanticObjectId
    exercise_name: Optional[str] = None
    notes: Optional[str] = None
    order: int = 0
    superset_group: Optional[str] = None
    rest_after: Optional[int] = None


class WorkoutExerciseCreate(WorkoutExerciseBase):
    """Schema for creating workout exercise"""
    sets: List[WorkoutSetCreate]
    
    @validator('sets')
    def validate_sets(cls, v):
        if not v:
            raise ValueError('At least one set is required')
        return v


class WorkoutExerciseResponse(WorkoutExerciseBase):
    """Schema for workout exercise response"""
    sets: List[WorkoutSetBase]


class WorkoutBase(BaseModel):
    """Base workout schema"""
    name: str
    date: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None
    workout_type: Optional[str] = None
    location: Optional[str] = None
    template_id: Optional[PydanticObjectId] = None
    plan_id: Optional[PydanticObjectId] = None
    
    @validator('workout_type')
    def validate_workout_type(cls, v):
        valid_types = ['strength', 'cardio', 'flexibility', 'mixed', 'other', None]
        if v and v not in valid_types:
            raise ValueError(f'Workout type must be one of {valid_types}')
        return v


class WorkoutCreate(WorkoutBase):
    """Schema for creating a workout"""
    exercises: List[WorkoutExerciseCreate] = Field(default_factory=list)
    start_time: Optional[datetime] = None


class WorkoutUpdate(BaseModel):
    """Schema for updating a workout"""
    name: Optional[str] = None
    date: Optional[datetime] = None
    exercises: Optional[List[WorkoutExerciseCreate]] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    workout_type: Optional[str] = None
    location: Optional[str] = None
    is_completed: Optional[bool] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    calories_burned: Optional[int] = None
    
    @validator('workout_type')
    def validate_workout_type(cls, v):
        valid_types = ['strength', 'cardio', 'flexibility', 'mixed', 'other', None]
        if v and v not in valid_types:
            raise ValueError(f'Workout type must be one of {valid_types}')
        return v


class WorkoutResponse(BaseModel):
    """Schema for workout response"""
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    name: str
    date: datetime
    exercises: List[WorkoutExerciseResponse]
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    workout_type: Optional[str] = None
    location: Optional[str] = None
    template_id: Optional[PydanticObjectId] = None
    plan_id: Optional[PydanticObjectId] = None
    is_completed: bool
    rating: Optional[int] = None
    calories_burned: Optional[int] = None
    total_volume: Optional[float] = None
    total_sets: Optional[int] = None
    total_reps: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            PydanticObjectId: str,
            datetime: lambda v: v.isoformat()
        }


class WorkoutListResponse(BaseModel):
    """Schema for paginated workout list"""
    items: List[WorkoutResponse]
    total: int
    page: int
    pages: int
    size: int


class WorkoutSearchRequest(BaseModel):
    """Schema for workout search request"""
    user_id: Optional[PydanticObjectId] = None
    name: Optional[str] = None
    workout_type: Optional[str] = None
    location: Optional[str] = None
    is_completed: Optional[bool] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    template_id: Optional[PydanticObjectId] = None
    plan_id: Optional[PydanticObjectId] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    rating_min: Optional[int] = Field(None, ge=1, le=5)
    rating_max: Optional[int] = Field(None, ge=1, le=5)