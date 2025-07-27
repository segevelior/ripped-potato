from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.models.utils import PydanticObjectId


class PredefinedExerciseSchema(BaseModel):
    exercise_id: PydanticObjectId
    exercise_name: str
    order: int = Field(default=0, ge=0)
    sets: int = Field(default=3, ge=1)
    reps_min: Optional[int] = Field(None, ge=1)
    reps_max: Optional[int] = Field(None, ge=1)
    target_reps: Optional[int] = None
    weight_guidance: Optional[str] = None
    weight_percentage: Optional[float] = Field(None, ge=0.0, le=200.0)
    rpe_target: Optional[float] = Field(None, ge=1.0, le=10.0)
    rest_seconds: Optional[int] = Field(None, ge=0)
    tempo: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=300)
    is_superset: bool = False
    superset_group: Optional[int] = None
    is_drop_set: bool = False
    is_warm_up: bool = False
    alternatives: List[PydanticObjectId] = []
    beginner_modification: Optional[str] = None
    advanced_modification: Optional[str] = None


class PredefinedWorkoutResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    short_description: Optional[str]
    exercises: List[PredefinedExerciseSchema]
    workout_type: str
    primary_muscle_groups: List[str]
    secondary_muscle_groups: List[str]
    difficulty_level: str
    estimated_duration_minutes: int
    calories_burned_estimate: Optional[int]
    intensity_level: str
    equipment_required: List[str]
    space_requirements: List[str]
    prerequisites: List[str]
    category: str
    subcategory: Optional[str]
    tags: List[str]
    created_by: str
    author_name: Optional[str]
    author_credentials: Optional[str]
    source: Optional[str]
    usage_count: int
    rating_average: float
    rating_count: int
    popularity_score: float
    is_active: bool
    is_featured: bool
    is_premium: bool
    warm_up_instructions: Optional[str]
    cool_down_instructions: Optional[str]
    form_cues: List[str]
    safety_notes: List[str]
    progression_notes: Optional[str]
    regression_notes: Optional[str]
    variations: List[str]
    primary_goals: List[str]
    benefits: List[str]
    contraindications: List[str]
    frequency_per_week: Optional[int]
    rest_days_between: Optional[int]
    best_time_of_day: Optional[str]
    image_url: Optional[str]
    video_url: Optional[str]
    tutorial_links: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class PredefinedWorkoutListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    short_description: Optional[str]
    workout_type: str
    primary_muscle_groups: List[str]
    difficulty_level: str
    estimated_duration_minutes: int
    equipment_required: List[str]
    category: str
    tags: List[str]
    rating_average: float
    rating_count: int
    popularity_score: float
    is_featured: bool
    is_premium: bool
    calories_burned_estimate: Optional[int]
    intensity_level: str

    class Config:
        populate_by_name = True


class PredefinedWorkoutSearchSchema(BaseModel):
    query: Optional[str] = None
    workout_type: Optional[str] = None
    category: Optional[str] = None
    difficulty_level: Optional[str] = None
    primary_muscle_groups: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    primary_goals: Optional[List[str]] = None
    intensity_level: Optional[str] = None
    min_duration: Optional[int] = None
    max_duration: Optional[int] = None
    min_rating: Optional[float] = None
    is_featured: Optional[bool] = None
    space_requirements: Optional[List[str]] = None
    best_time_of_day: Optional[str] = None


class PredefinedWorkoutStatsSchema(BaseModel):
    total_workouts: int
    workouts_by_type: Dict[str, int]
    workouts_by_category: Dict[str, int]
    workouts_by_difficulty: Dict[str, int]
    average_rating: float
    most_popular_workout: Optional[str]
    featured_count: int
    premium_count: int


class WorkoutVolumeAnalysisSchema(BaseModel):
    total_exercises: int
    total_sets: int
    sets_per_exercise: float
    estimated_duration: int
    superset_count: int
    muscle_groups_targeted: int


class WorkoutDifficultyAnalysisSchema(BaseModel):
    difficulty_score: int
    exercise_count: int
    superset_count: int
    duration_minutes: int
    intensity_level: str
    equipment_complexity: int
    skill_requirements: int


class WorkoutRecommendationSchema(BaseModel):
    difficulty_match: bool
    goal_alignment: bool
    modifications: List[str]
    warnings: List[str]


class WorkoutSuitabilitySchema(BaseModel):
    equipment_match: bool
    duration_match: bool
    goal_match: bool
    difficulty_appropriate: bool
    overall_score: float


class RatePredefinedWorkoutSchema(BaseModel):
    rating: float = Field(..., ge=1.0, le=5.0)


class WorkoutEquipmentCheckSchema(BaseModel):
    available_equipment: List[str]


class WorkoutFilterSchema(BaseModel):
    available_equipment: List[str]
    max_duration_minutes: int
    user_goals: List[str]
    difficulty_levels: List[str]


class WorkoutRecommendationRequestSchema(BaseModel):
    user_goals: List[str]
    difficulty_level: str
    available_equipment: List[str]
    max_duration_minutes: int
    preferred_muscle_groups: Optional[List[str]] = None
    workout_type: Optional[str] = None
    intensity_preference: Optional[str] = None
    space_requirements: Optional[List[str]] = None


class CreateFromPredefinedSchema(BaseModel):
    predefined_workout_id: PydanticObjectId
    scheduled_date: Optional[datetime] = None
    customizations: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None