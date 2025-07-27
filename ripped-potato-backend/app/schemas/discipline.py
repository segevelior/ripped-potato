from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class DisciplineMetricsSchema(BaseModel):
    total_exercises: int = Field(default=0, ge=0)
    total_workouts: int = Field(default=0, ge=0)
    active_practitioners: int = Field(default=0, ge=0)
    average_session_duration: Optional[int] = None
    difficulty_distribution: Dict[str, int] = {}
    popular_equipment: List[str] = []
    common_goals: List[str] = []


class DisciplineRequirementsSchema(BaseModel):
    skill_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: List[str] = []
    equipment_optional: List[str] = []
    space_requirements: List[str] = []
    time_commitment_min: Optional[int] = None
    time_commitment_max: Optional[int] = None
    frequency_recommendation: Optional[str] = None
    prerequisite_skills: List[str] = []
    safety_considerations: List[str] = []


class DisciplineCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100, regex="^[a-z0-9-]+$")
    description: Optional[str] = Field(None, max_length=1000)
    category: str = Field(..., regex="^(strength|cardio|flexibility|martial_arts|sports|rehabilitation|mind_body|hybrid)$")
    subcategory: Optional[str] = None
    primary_focus: List[str] = []
    movement_patterns: List[str] = []
    energy_systems: List[str] = []
    requirements: DisciplineRequirementsSchema = Field(default_factory=DisciplineRequirementsSchema)
    muscle_groups_targeted: List[str] = []
    typical_workout_types: List[str] = []
    principles: List[str] = []
    common_progressions: List[str] = []
    key_concepts: List[str] = []
    parent_discipline_id: Optional[PydanticObjectId] = None
    related_disciplines: List[PydanticObjectId] = []
    icon_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    introduction_video_url: Optional[str] = None
    is_featured: bool = False
    tags: List[str] = []
    keywords: List[str] = []
    difficulty_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert|mixed)$")


class DisciplineUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, regex="^(strength|cardio|flexibility|martial_arts|sports|rehabilitation|mind_body|hybrid)$")
    subcategory: Optional[str] = None
    primary_focus: Optional[List[str]] = None
    movement_patterns: Optional[List[str]] = None
    energy_systems: Optional[List[str]] = None
    requirements: Optional[DisciplineRequirementsSchema] = None
    muscle_groups_targeted: Optional[List[str]] = None
    typical_workout_types: Optional[List[str]] = None
    principles: Optional[List[str]] = None
    common_progressions: Optional[List[str]] = None
    key_concepts: Optional[List[str]] = None
    related_disciplines: Optional[List[PydanticObjectId]] = None
    icon_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    introduction_video_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    tags: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    difficulty_level: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert|mixed)$")


class DisciplineResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    slug: str
    description: Optional[str]
    category: str
    subcategory: Optional[str]
    primary_focus: List[str]
    movement_patterns: List[str]
    energy_systems: List[str]
    requirements: DisciplineRequirementsSchema
    metrics: DisciplineMetricsSchema
    muscle_groups_targeted: List[str]
    typical_workout_types: List[str]
    principles: List[str]
    common_progressions: List[str]
    key_concepts: List[str]
    is_system_discipline: bool
    parent_discipline_id: Optional[PydanticObjectId]
    related_disciplines: List[PydanticObjectId]
    icon_url: Optional[str]
    banner_image_url: Optional[str]
    introduction_video_url: Optional[str]
    is_active: bool
    is_featured: bool
    popularity_score: float
    tags: List[str]
    keywords: List[str]
    difficulty_level: str
    created_by_user_id: Optional[PydanticObjectId]
    approved_by_admin: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class DisciplineListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    slug: str
    description: Optional[str]
    category: str
    subcategory: Optional[str]
    difficulty_level: str
    primary_focus: List[str]
    is_featured: bool
    popularity_score: float
    active_practitioners: int
    total_exercises: int
    icon_url: Optional[str]
    tags: List[str]

    class Config:
        populate_by_name = True


class DisciplineStatsSchema(BaseModel):
    total_disciplines: int
    disciplines_by_category: Dict[str, int]
    disciplines_by_difficulty: Dict[str, int]
    featured_disciplines_count: int
    most_popular_disciplines: List[DisciplineListSchema]
    total_practitioners: int
    average_exercises_per_discipline: float


class DisciplineSearchSchema(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    difficulty_level: Optional[str] = None
    primary_focus: Optional[List[str]] = None
    movement_patterns: Optional[List[str]] = None
    muscle_groups: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    space_requirements: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    tags: Optional[List[str]] = None
    min_popularity_score: Optional[float] = None


class DisciplineInfoSchema(BaseModel):
    basic_info: Dict[str, Any]
    focus_areas: Dict[str, Any]
    requirements: Dict[str, Any]
    metrics: Dict[str, Any]
    learning: Dict[str, Any]
    popularity: Dict[str, Any]


class UpdateMetricsSchema(BaseModel):
    exercise_count: Optional[int] = None
    workout_count: Optional[int] = None
    practitioner_count: Optional[int] = None


class DifficultyDistributionSchema(BaseModel):
    beginner: int = 0
    intermediate: int = 0
    advanced: int = 0
    expert: int = 0