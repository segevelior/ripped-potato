from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class TrainingSessionSchema(BaseModel):
    date: datetime
    workout_id: Optional[PydanticObjectId] = None
    duration_minutes: Optional[int] = None
    workout_type: Optional[str] = None
    intensity_rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    exercises_count: Optional[int] = None
    total_volume: Optional[float] = None
    calories_burned: Optional[float] = None


class UserTrainingPatternResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    analysis_start_date: datetime
    analysis_end_date: datetime
    total_analysis_days: int
    total_sessions: int
    average_sessions_per_week: float
    longest_streak_days: int
    current_streak_days: int
    preferred_workout_days: List[str]
    preferred_workout_times: List[str]
    most_active_hour: Optional[int]
    preferred_workout_types: List[str]
    average_workout_duration_minutes: Optional[float]
    preferred_intensity_level: Optional[str]
    consistency_score: float
    adherence_rate: float
    dropout_risk_score: float
    volume_trend: Optional[str]
    intensity_trend: Optional[str]
    duration_trend: Optional[str]
    last_analyzed: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class AddSessionSchema(BaseModel):
    date: datetime
    workout_id: Optional[PydanticObjectId] = None
    duration_minutes: Optional[int] = None
    workout_type: Optional[str] = None
    intensity_rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    exercises_count: Optional[int] = None
    total_volume: Optional[float] = None
    calories_burned: Optional[float] = None


class PatternInsightsSchema(BaseModel):
    activity_level: str
    consistency: str
    dropout_risk: str
    preferred_schedule: Dict[str, List[str]]
    workout_preferences: Dict[str, Any]
    streaks: Dict[str, int]