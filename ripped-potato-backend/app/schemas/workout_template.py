from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.models.utils import PydanticObjectId


class ExerciseTemplateSchema(BaseModel):
    exercise_id: PydanticObjectId
    exercise_name: str
    order: int = Field(default=0, ge=0)
    sets_min: int = Field(default=1, ge=1)
    sets_max: int = Field(default=1, ge=1)
    target_sets: Optional[int] = None
    reps_min: Optional[int] = Field(None, ge=1)
    reps_max: Optional[int] = Field(None, ge=1)
    target_reps: Optional[int] = None
    weight_type: str = Field(default="fixed", regex="^(fixed|percentage|bodyweight|rpe_based)$")
    weight_percentage: Optional[float] = Field(None, ge=0.0, le=200.0)
    rpe_target: Optional[float] = Field(None, ge=1.0, le=10.0)
    rest_seconds_min: Optional[int] = Field(None, ge=0)
    rest_seconds_max: Optional[int] = Field(None, ge=0)
    target_rest_seconds: Optional[int] = Field(None, ge=0)
    tempo: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)
    is_superset: bool = False
    superset_group: Optional[int] = None
    is_drop_set: bool = False
    is_warm_up: bool = False
    alternatives: List[PydanticObjectId] = []
    progression_type: str = Field(default="linear", regex="^(linear|double_progression|percentage|time_based)$")
    progression_increment: Optional[float] = None


class WorkoutTemplateCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    exercises: List[ExerciseTemplateSchema] = []
    workout_type: str = Field(default="strength", regex="^(strength|cardio|flexibility|mobility|sport_specific|rehabilitation|mixed)$")
    target_muscle_groups: List[str] = []
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: List[str] = []
    estimated_duration_minutes: Optional[int] = Field(None, ge=5, le=300)
    space_requirements: List[str] = []
    tags: List[str] = []
    category: Optional[str] = None
    is_public: bool = False
    based_on_template_id: Optional[PydanticObjectId] = None
    auto_progression: bool = True
    warm_up_included: bool = False
    cool_down_included: bool = False
    setup_instructions: Optional[str] = Field(None, max_length=1000)
    coaching_notes: Optional[str] = Field(None, max_length=1000)
    safety_notes: Optional[str] = Field(None, max_length=500)


class WorkoutTemplateUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    exercises: Optional[List[ExerciseTemplateSchema]] = None
    workout_type: Optional[str] = Field(None, regex="^(strength|cardio|flexibility|mobility|sport_specific|rehabilitation|mixed)$")
    target_muscle_groups: Optional[List[str]] = None
    difficulty_level: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: Optional[List[str]] = None
    estimated_duration_minutes: Optional[int] = Field(None, ge=5, le=300)
    space_requirements: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None
    auto_progression: Optional[bool] = None
    warm_up_included: Optional[bool] = None
    cool_down_included: Optional[bool] = None
    setup_instructions: Optional[str] = Field(None, max_length=1000)
    coaching_notes: Optional[str] = Field(None, max_length=1000)
    safety_notes: Optional[str] = Field(None, max_length=500)


class WorkoutTemplateResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    user_id: Optional[PydanticObjectId]
    name: str
    description: Optional[str]
    exercises: List[ExerciseTemplateSchema]
    workout_type: str
    target_muscle_groups: List[str]
    difficulty_level: str
    equipment_required: List[str]
    estimated_duration_minutes: Optional[int]
    space_requirements: List[str]
    tags: List[str]
    category: Optional[str]
    is_public: bool
    is_system_template: bool
    based_on_template_id: Optional[PydanticObjectId]
    usage_count: int
    rating_average: float
    rating_count: int
    auto_progression: bool
    warm_up_included: bool
    cool_down_included: bool
    setup_instructions: Optional[str]
    coaching_notes: Optional[str]
    safety_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class WorkoutTemplateListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    workout_type: str
    difficulty_level: str
    estimated_duration_minutes: Optional[int]
    target_muscle_groups: List[str]
    equipment_required: List[str]
    tags: List[str]
    is_public: bool
    is_system_template: bool
    usage_count: int
    rating_average: float
    rating_count: int
    created_at: datetime

    class Config:
        populate_by_name = True


class WorkoutTemplateStatsSchema(BaseModel):
    total_templates: int
    public_templates: int
    private_templates: int
    system_templates: int
    average_rating: float
    most_popular_type: str
    templates_by_type: Dict[str, int]
    templates_by_difficulty: Dict[str, int]
    total_usage: int


class WorkoutTemplateSearchSchema(BaseModel):
    query: Optional[str] = None
    workout_type: Optional[str] = None
    difficulty_level: Optional[str] = None
    target_muscle_groups: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_system_template: Optional[bool] = None
    min_duration: Optional[int] = None
    max_duration: Optional[int] = None
    min_rating: Optional[float] = None
    space_requirements: Optional[List[str]] = None
    category: Optional[str] = None


class RateTemplateSchema(BaseModel):
    rating: float = Field(..., ge=1.0, le=5.0)


class UseTemplateSchema(BaseModel):
    template_id: PydanticObjectId
    customizations: Optional[Dict[str, Any]] = None
    planned_date: Optional[datetime] = None


class TemplateVolumeSchema(BaseModel):
    total_exercises: int
    estimated_total_sets: int
    exercises_per_muscle_group: int
    estimated_duration_minutes: Optional[int]
    difficulty_score: float


class TemplateSupersetSchema(BaseModel):
    superset_group: int
    exercises: List[ExerciseTemplateSchema]


class TemplateEquipmentCheckSchema(BaseModel):
    available_equipment: List[str]


class TemplateEquipmentCheckResponseSchema(BaseModel):
    can_perform: bool
    missing_equipment: List[str]
    alternative_exercises: List[Dict[str, Any]]


class DuplicateTemplateSchema(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=200)
    make_public: bool = False
    modifications: Optional[Dict[str, Any]] = None