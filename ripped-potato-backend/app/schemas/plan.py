from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.models.utils import PydanticObjectId


class PlanWorkoutSchema(BaseModel):
    workout_template_id: Optional[PydanticObjectId] = None
    workout_id: Optional[PydanticObjectId] = None
    name: str
    description: Optional[str] = None
    day_of_week: int = Field(..., ge=0, le=6)
    week_number: int = Field(..., ge=1)
    estimated_duration_minutes: Optional[int] = None
    priority: str = Field(default="medium", regex="^(low|medium|high|critical)$")
    is_rest_day: bool = False
    notes: Optional[str] = None


class PlanWeekSchema(BaseModel):
    week_number: int = Field(..., ge=1)
    focus: Optional[str] = None
    workouts: List[PlanWorkoutSchema] = []
    weekly_goals: List[str] = []
    notes: Optional[str] = None
    rest_days: List[int] = []


class PlanProgressSchema(BaseModel):
    week_number: int
    completed_workouts: int = 0
    total_workouts: int = 0
    completion_percentage: float = 0.0
    goals_achieved: List[str] = []
    notes: Optional[str] = None
    date_completed: Optional[datetime] = None


class PlanCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    duration_weeks: int = Field(..., ge=1, le=52)
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    weeks: List[PlanWeekSchema] = []
    primary_goal_ids: List[PydanticObjectId] = []
    secondary_goal_ids: List[PydanticObjectId] = []
    target_workout_frequency: int = Field(default=3, ge=1, le=7)
    start_date: Optional[datetime] = None
    plan_type: str = Field(default="custom", regex="^(strength|endurance|weight_loss|weight_gain|rehabilitation|sport_specific|custom)$")
    tags: List[str] = []
    equipment_required: List[str] = []
    is_template: bool = False
    is_public: bool = False
    based_on_template_id: Optional[PydanticObjectId] = None


class PlanUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    duration_weeks: Optional[int] = Field(None, ge=1, le=52)
    difficulty_level: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert)$")
    weeks: Optional[List[PlanWeekSchema]] = None
    primary_goal_ids: Optional[List[PydanticObjectId]] = None
    secondary_goal_ids: Optional[List[PydanticObjectId]] = None
    target_workout_frequency: Optional[int] = Field(None, ge=1, le=7)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = Field(None, regex="^(draft|active|paused|completed|abandoned)$")
    plan_type: Optional[str] = Field(None, regex="^(strength|endurance|weight_loss|weight_gain|rehabilitation|sport_specific|custom)$")
    tags: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    is_template: Optional[bool] = None
    is_public: Optional[bool] = None


class PlanResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    name: str
    description: Optional[str]
    duration_weeks: int
    difficulty_level: str
    weeks: List[PlanWeekSchema]
    primary_goal_ids: List[PydanticObjectId]
    secondary_goal_ids: List[PydanticObjectId]
    target_workout_frequency: int
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    actual_end_date: Optional[datetime]
    is_active: bool
    status: str
    progress: List[PlanProgressSchema]
    current_week: int
    overall_completion_percentage: float
    plan_type: str
    tags: List[str]
    equipment_required: List[str]
    is_template: bool
    is_public: bool
    based_on_template_id: Optional[PydanticObjectId]
    created_by_coach: bool
    total_planned_workouts: int
    completed_workouts: int
    skipped_workouts: int
    adherence_rate: float
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class PlanListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    duration_weeks: int
    difficulty_level: str
    plan_type: str
    status: str
    is_active: bool
    overall_completion_percentage: float
    adherence_rate: float
    start_date: Optional[datetime]
    created_at: datetime
    tags: List[str]

    class Config:
        populate_by_name = True


class PlanStatsSchema(BaseModel):
    total_plans: int
    active_plans: int
    completed_plans: int
    average_adherence_rate: float
    total_planned_workouts: int
    total_completed_workouts: int
    plans_by_type: Dict[str, int]
    plans_by_difficulty: Dict[str, int]


class PlanWeekScheduleSchema(BaseModel):
    week_number: int
    schedule: Dict[str, PlanWorkoutSchema]  # day_name -> workout
    weekly_goals: List[str]
    focus: Optional[str]
    notes: Optional[str]


class StartPlanSchema(BaseModel):
    start_date: datetime


class CompletePlanSchema(BaseModel):
    completion_notes: Optional[str] = None


class PlanProgressUpdateSchema(BaseModel):
    week_number: int
    completed_workouts: Optional[int] = None
    goals_achieved: Optional[List[str]] = None
    notes: Optional[str] = None


class PlanSearchSchema(BaseModel):
    query: Optional[str] = None
    plan_type: Optional[str] = None
    difficulty_level: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    tags: Optional[List[str]] = None
    min_duration_weeks: Optional[int] = None
    max_duration_weeks: Optional[int] = None
    start_date_from: Optional[datetime] = None
    start_date_to: Optional[datetime] = None