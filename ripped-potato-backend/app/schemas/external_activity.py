from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class ActivityMetricsSchema(BaseModel):
    duration_minutes: Optional[int] = None
    distance_km: Optional[float] = None
    calories_burned: Optional[float] = None
    average_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    steps: Optional[int] = None
    elevation_gain_m: Optional[float] = None
    pace_per_km: Optional[str] = None
    power_watts: Optional[float] = None


class ExternalActivityCreateSchema(BaseModel):
    external_id: str = Field(..., max_length=200)
    external_platform: str = Field(..., max_length=100)
    activity_type: str = Field(..., max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    start_time: datetime
    end_time: Optional[datetime] = None
    metrics: ActivityMetricsSchema = Field(default_factory=ActivityMetricsSchema)
    location: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    equipment_used: List[str] = []
    weather_conditions: Optional[Dict[str, Any]] = None
    raw_data: Optional[Dict[str, Any]] = None
    include_in_stats: bool = True
    include_in_goals: bool = True
    is_private: bool = False
    tags: List[str] = []
    notes: Optional[str] = Field(None, max_length=500)


class ExternalActivityUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    metrics: Optional[ActivityMetricsSchema] = None
    include_in_stats: Optional[bool] = None
    include_in_goals: Optional[bool] = None
    is_private: Optional[bool] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=500)


class ExternalActivityResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    user_id: PydanticObjectId
    external_id: str
    external_platform: str
    activity_type: str
    name: Optional[str]
    description: Optional[str]
    start_time: datetime
    end_time: Optional[datetime]
    metrics: ActivityMetricsSchema
    location: Optional[str]
    coordinates: Optional[Dict[str, float]]
    equipment_used: List[str]
    weather_conditions: Optional[Dict[str, Any]]
    last_synced: datetime
    sync_status: str
    mapped_workout_id: Optional[PydanticObjectId]
    mapped_exercise_ids: List[PydanticObjectId]
    include_in_stats: bool
    include_in_goals: bool
    is_private: bool
    tags: List[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class ExternalActivityListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    external_platform: str
    activity_type: str
    name: Optional[str]
    start_time: datetime
    duration_minutes: Optional[int]
    distance_km: Optional[float]
    calories_burned: Optional[float]
    sync_status: str
    include_in_stats: bool

    class Config:
        populate_by_name = True


class SyncExternalActivitiesSchema(BaseModel):
    platform: str = Field(..., max_length=100)
    force_sync: bool = False
    days_back: int = Field(default=7, ge=1, le=30)