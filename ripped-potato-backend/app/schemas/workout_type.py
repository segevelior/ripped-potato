from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class WorkoutTypeCharacteristicsSchema(BaseModel):
    primary_energy_system: str = Field(..., regex="^(aerobic|anaerobic_alactic|anaerobic_lactic|mixed)$")
    intensity_level: str = Field(default="moderate", regex="^(low|moderate|high|variable)$")
    typical_duration_min: Optional[int] = Field(None, ge=5, le=300)
    typical_duration_max: Optional[int] = Field(None, ge=5, le=300)
    rest_to_work_ratio: Optional[str] = None
    rep_range_focus: Optional[str] = None
    load_intensity: str = Field(default="moderate", regex="^(light|moderate|heavy|variable)$")
    movement_complexity: str = Field(default="simple", regex="^(simple|moderate|complex|variable)$")


class WorkoutTypeStructureSchema(BaseModel):
    warm_up_required: bool = True
    cool_down_required: bool = True
    typical_exercises_count: Optional[int] = Field(None, ge=1, le=50)
    typical_sets_per_exercise: Optional[int] = Field(None, ge=1, le=20)
    allows_supersets: bool = False
    allows_circuits: bool = False
    allows_drop_sets: bool = False
    progression_style: str = Field(default="linear", regex="^(linear|undulating|block|concurrent)$")


class WorkoutTypeCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100, regex="^[a-z0-9-]+$")
    description: Optional[str] = Field(None, max_length=1000)
    category: str = Field(..., regex="^(strength|cardio|flexibility|sports|rehabilitation|mixed)$")
    subcategory: Optional[str] = None
    characteristics: WorkoutTypeCharacteristicsSchema
    structure: WorkoutTypeStructureSchema
    primary_benefits: List[str] = []
    secondary_benefits: List[str] = []
    target_fitness_components: List[str] = []
    skill_level_required: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert|any)$")
    equipment_required: List[str] = []
    space_requirements: List[str] = []
    suitable_for_goals: List[str] = []
    recommended_frequency_per_week: Optional[str] = None
    recovery_time_hours: Optional[int] = Field(None, ge=0, le=168)
    can_be_combined_with: List[str] = []
    conflicts_with: List[str] = []
    contraindications: List[str] = []
    precautions: List[str] = []
    modifications_available: List[str] = []
    icon_url: Optional[str] = None
    demonstration_video_url: Optional[str] = None
    example_workouts: List[PydanticObjectId] = []
    is_featured: bool = False
    tags: List[str] = []
    keywords: List[str] = []


class WorkoutTypeUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, regex="^(strength|cardio|flexibility|sports|rehabilitation|mixed)$")
    subcategory: Optional[str] = None
    characteristics: Optional[WorkoutTypeCharacteristicsSchema] = None
    structure: Optional[WorkoutTypeStructureSchema] = None
    primary_benefits: Optional[List[str]] = None
    secondary_benefits: Optional[List[str]] = None
    target_fitness_components: Optional[List[str]] = None
    skill_level_required: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert|any)$")
    equipment_required: Optional[List[str]] = None
    space_requirements: Optional[List[str]] = None
    suitable_for_goals: Optional[List[str]] = None
    recommended_frequency_per_week: Optional[str] = None
    recovery_time_hours: Optional[int] = Field(None, ge=0, le=168)
    can_be_combined_with: Optional[List[str]] = None
    conflicts_with: Optional[List[str]] = None
    contraindications: Optional[List[str]] = None
    precautions: Optional[List[str]] = None
    modifications_available: Optional[List[str]] = None
    icon_url: Optional[str] = None
    demonstration_video_url: Optional[str] = None
    example_workouts: Optional[List[PydanticObjectId]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    tags: Optional[List[str]] = None
    keywords: Optional[List[str]] = None


class WorkoutTypeResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    slug: str
    description: Optional[str]
    category: str
    subcategory: Optional[str]
    characteristics: WorkoutTypeCharacteristicsSchema
    structure: WorkoutTypeStructureSchema
    primary_benefits: List[str]
    secondary_benefits: List[str]
    target_fitness_components: List[str]
    skill_level_required: str
    equipment_required: List[str]
    space_requirements: List[str]
    suitable_for_goals: List[str]
    recommended_frequency_per_week: Optional[str]
    recovery_time_hours: Optional[int]
    can_be_combined_with: List[str]
    conflicts_with: List[str]
    contraindications: List[str]
    precautions: List[str]
    modifications_available: List[str]
    usage_count: int
    popularity_score: float
    user_rating_average: float
    user_rating_count: int
    icon_url: Optional[str]
    demonstration_video_url: Optional[str]
    example_workouts: List[PydanticObjectId]
    is_system_type: bool
    is_active: bool
    is_featured: bool
    created_by_user_id: Optional[PydanticObjectId]
    approved_by_admin: bool
    tags: List[str]
    keywords: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class WorkoutTypeListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    slug: str
    description: Optional[str]
    category: str
    subcategory: Optional[str]
    skill_level_required: str
    primary_benefits: List[str]
    intensity_level: str
    duration_range: Optional[Dict[str, int]]
    popularity_score: float
    user_rating_average: float
    usage_count: int
    is_featured: bool
    icon_url: Optional[str]
    tags: List[str]

    class Config:
        populate_by_name = True


class WorkoutTypeStatsSchema(BaseModel):
    total_workout_types: int
    types_by_category: Dict[str, int]
    types_by_skill_level: Dict[str, int]
    types_by_intensity: Dict[str, int]
    featured_types_count: int
    most_popular_types: List[WorkoutTypeListSchema]
    average_rating: float
    total_usage_count: int


class WorkoutTypeSearchSchema(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    skill_level_required: Optional[str] = None
    intensity_level: Optional[str] = None
    primary_benefits: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    space_requirements: Optional[List[str]] = None
    suitable_for_goals: Optional[List[str]] = None
    min_duration: Optional[int] = None
    max_duration: Optional[int] = None
    energy_system: Optional[str] = None
    is_featured: Optional[bool] = None
    min_rating: Optional[float] = None
    tags: Optional[List[str]] = None


class WorkoutTypeInfoSchema(BaseModel):
    basic_info: Dict[str, Any]
    characteristics: Dict[str, Any]
    structure: Dict[str, Any]
    benefits: Dict[str, Any]
    requirements: Dict[str, Any]
    programming: Dict[str, Any]
    safety: Dict[str, Any]
    popularity: Dict[str, Any]


class AddRatingSchema(BaseModel):
    rating: float = Field(..., ge=0.0, le=5.0)


class CalorieBurnEstimateSchema(BaseModel):
    user_weight_kg: float = Field(default=70.0, ge=30.0, le=200.0)


class CompatibilityCheckSchema(BaseModel):
    other_workout_type_ids: List[PydanticObjectId]


class SuitabilityCheckSchema(BaseModel):
    user_skill_level: str = Field(..., regex="^(beginner|intermediate|advanced|expert)$")
    available_equipment: List[str] = []
    available_space: str