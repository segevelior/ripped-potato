from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from app.models.exercise import ExerciseStrain


# Request schemas
class ExerciseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    discipline: List[str] = Field(default_factory=list)
    muscles: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)
    strain: ExerciseStrain
    similar_exercises: List[str] = Field(default_factory=list)
    progression_group: Optional[str] = None
    progression_level: Optional[int] = None
    next_progression: Optional[str] = None
    previous_progression: Optional[str] = None
    description: Optional[str] = None


class ExerciseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    discipline: Optional[List[str]] = None
    muscles: Optional[List[str]] = None
    equipment: Optional[List[str]] = None
    strain: Optional[ExerciseStrain] = None
    similar_exercises: Optional[List[str]] = None
    progression_group: Optional[str] = None
    progression_level: Optional[int] = None
    next_progression: Optional[str] = None
    previous_progression: Optional[str] = None
    description: Optional[str] = None


class ExerciseSearchRequest(BaseModel):
    """GraphQL-style search request"""
    filters: Optional[Dict] = Field(default_factory=dict)
    sort: Optional[str] = "-created_at"
    limit: int = Field(default=20, ge=1, le=100)
    skip: int = Field(default=0, ge=0)


# Response schemas
class ExerciseResponse(BaseModel):
    id: str
    name: str
    discipline: List[str]
    muscles: List[str]
    equipment: List[str]
    strain: ExerciseStrain
    similar_exercises: List[str]
    progression_group: Optional[str]
    progression_level: Optional[int]
    next_progression: Optional[str]
    previous_progression: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]

    class Config:
        from_attributes = True


class ExerciseListResponse(BaseModel):
    exercises: List[ExerciseResponse]
    total: int
    skip: int
    limit: int 