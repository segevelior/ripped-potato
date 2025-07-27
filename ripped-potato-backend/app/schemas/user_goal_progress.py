from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class ProgressMeasurementSchema(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    value: float
    unit: str
    measurement_type: str = Field(..., regex="^(actual|estimated|calculated|user_reported)$")
    workout_id: Optional[PydanticObjectId] = None
    exercise_id: Optional[PydanticObjectId] = None
    notes: Optional[str] = Field(None, max_length=500)
    confidence_level: float = Field(default=1.0, ge=0.0, le=1.0)
    measurement_method: Optional[str] = None
    tags: List[str] = []
    conditions: Optional[Dict[str, Any]] = None


class ProgressMilestoneSchema(BaseModel):
    milestone_id: str
    name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    target_value: float
    target_unit: str
    achieved_value: Optional[float] = None
    achieved_date: Optional[datetime] = None
    is_achieved: bool = False
    achievement_method: Optional[str] = None
    celebration_notes: Optional[str] = None
    difficulty_rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    progress_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    estimated_achievement_date: Optional[datetime] = None


class ProgressTrendSchema(BaseModel):
    period_start: datetime
    period_end: datetime
    trend_direction: str = Field(..., regex="^(increasing|decreasing|stable|volatile)$")
    trend_strength: float = Field(..., ge=0.0, le=1.0)
    rate_of_change: float
    rate_of_change_unit: str
    average_value: float
    min_value: float
    max_value: float
    standard_deviation: float
    correlation_coefficient: Optional[float] = None
    data_points_count: int
    reliability_score: float = Field(..., ge=0.0, le=1.0)
    trend_confidence: float = Field(..., ge=0.0, le=1.0)


class UserGoalProgressCreateSchema(BaseModel):
    goal_id: PydanticObjectId
    goal_name: str = Field(..., max_length=200)
    goal_type: str
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    starting_value: Optional[float] = None
    unit: Optional[str] = None
    target_completion_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=1000)
    tags: List[str] = []


class UserGoalProgressUpdateSchema(BaseModel):
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    target_completion_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = None


class UserGoalProgressResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    goal_id: PydanticObjectId
    goal_name: str
    goal_type: str
    current_value: Optional[float]
    target_value: Optional[float]
    starting_value: Optional[float]
    unit: Optional[str]
    progress_percentage: float
    absolute_progress: Optional[float]
    remaining_progress: Optional[float]
    start_date: datetime
    last_updated: datetime
    target_completion_date: Optional[datetime]
    estimated_completion_date: Optional[datetime]
    actual_completion_date: Optional[datetime]
    measurements: List[ProgressMeasurementSchema]
    milestones: List[ProgressMilestoneSchema]
    current_trend: Optional[ProgressTrendSchema]
    total_measurements: int
    measurement_frequency_days: Optional[float]
    consistency_score: float
    velocity: Optional[float]
    acceleration: Optional[float]
    efficiency_score: Optional[float]
    predicted_completion_date: Optional[datetime]
    confidence_in_prediction: Optional[float]
    risk_factors: List[str]
    is_active: bool
    is_completed: bool
    is_on_track: bool
    requires_attention: bool
    notes: Optional[str]
    tags: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class UserGoalProgressListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    goal_id: PydanticObjectId
    goal_name: str
    goal_type: str
    progress_percentage: float
    current_value: Optional[float]
    target_value: Optional[float]
    unit: Optional[str]
    last_updated: datetime
    target_completion_date: Optional[datetime]
    is_active: bool
    is_completed: bool
    is_on_track: bool
    requires_attention: bool
    total_measurements: int
    consistency_score: float

    class Config:
        populate_by_name = True


class AddMeasurementSchema(BaseModel):
    value: float
    unit: str
    measurement_type: str = Field(default="user_reported", regex="^(actual|estimated|calculated|user_reported)$")
    workout_id: Optional[PydanticObjectId] = None
    exercise_id: Optional[PydanticObjectId] = None
    notes: Optional[str] = Field(None, max_length=500)
    conditions: Optional[Dict[str, Any]] = None


class AddMilestoneSchema(BaseModel):
    milestone_id: str
    name: str = Field(..., max_length=200)
    target_value: float
    target_unit: str
    description: Optional[str] = Field(None, max_length=500)


class ProgressSummarySchema(BaseModel):
    current_progress: Dict[str, Any]
    timeline: Dict[str, Any]
    measurements: Dict[str, Any]
    performance: Dict[str, Any]
    milestones: Dict[str, Any]
    trend: Optional[Dict[str, Any]]


class UserGoalProgressStatsSchema(BaseModel):
    total_goals_tracked: int
    active_goals: int
    completed_goals: int
    goals_on_track: int
    goals_requiring_attention: int
    average_progress_percentage: float
    average_consistency_score: float
    total_measurements: int
    goals_by_type: Dict[str, int]
    recent_achievements: List[ProgressMilestoneSchema]


class ProgressSearchSchema(BaseModel):
    goal_type: Optional[str] = None
    is_active: Optional[bool] = None
    is_completed: Optional[bool] = None
    is_on_track: Optional[bool] = None
    requires_attention: Optional[bool] = None
    min_progress_percentage: Optional[float] = Field(None, ge=0.0, le=100.0)
    max_progress_percentage: Optional[float] = Field(None, ge=0.0, le=100.0)
    target_completion_from: Optional[datetime] = None
    target_completion_to: Optional[datetime] = None
    tags: Optional[List[str]] = None


class TrendAnalysisSchema(BaseModel):
    days_back: int = Field(default=30, ge=7, le=365)


class PredictCompletionSchema(BaseModel):
    use_current_trend: bool = True
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)