from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class TrainingPhaseSchema(BaseModel):
    phase_number: int = Field(..., ge=1)
    name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    duration_weeks: int = Field(..., ge=1, le=52)
    focus: str
    intensity_percentage: float = Field(..., ge=0.0, le=100.0)
    volume_percentage: float = Field(..., ge=0.0, le=200.0)
    workout_template_ids: List[PydanticObjectId] = []
    deload_week: Optional[int] = None


class TrainingPlanCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    total_duration_weeks: int = Field(..., ge=1, le=104)
    phases: List[TrainingPhaseSchema] = []
    plan_type: str = Field(..., regex="^(strength|hypertrophy|powerlifting|bodybuilding|endurance|sport_specific|general_fitness)$")
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    target_age_min: Optional[int] = Field(None, ge=13, le=100)
    target_age_max: Optional[int] = Field(None, ge=13, le=100)
    target_experience_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: List[str] = []
    time_commitment_hours_per_week: Optional[float] = Field(None, ge=1.0, le=40.0)
    sessions_per_week: Optional[int] = Field(None, ge=1, le=14)
    primary_goals: List[str] = []
    expected_outcomes: List[str] = []
    prerequisite_skills: List[str] = []
    is_public: bool = True
    is_featured: bool = False
    tags: List[str] = []


class TrainingPlanUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    phases: Optional[List[TrainingPhaseSchema]] = None
    difficulty_level: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: Optional[List[str]] = None
    primary_goals: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    tags: Optional[List[str]] = None


class TrainingPlanResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    total_duration_weeks: int
    phases: List[TrainingPhaseSchema]
    plan_type: str
    difficulty_level: str
    target_age_min: Optional[int]
    target_age_max: Optional[int]
    target_experience_level: str
    equipment_required: List[str]
    time_commitment_hours_per_week: Optional[float]
    sessions_per_week: Optional[int]
    primary_goals: List[str]
    expected_outcomes: List[str]
    prerequisite_skills: List[str]
    usage_count: int
    success_rate: float
    completion_rate: float
    average_rating: float
    rating_count: int
    is_system_plan: bool
    created_by_user_id: Optional[PydanticObjectId]
    is_public: bool
    is_active: bool
    is_featured: bool
    tags: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class TrainingPlanListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    plan_type: str
    difficulty_level: str
    total_duration_weeks: int
    usage_count: int
    average_rating: float
    is_featured: bool
    tags: List[str]

    class Config:
        populate_by_name = True