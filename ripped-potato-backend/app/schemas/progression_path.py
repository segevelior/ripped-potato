from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from beanie import PydanticObjectId


class ProgressionStepSchema(BaseModel):
    step_number: int = Field(..., ge=1)
    exercise_id: PydanticObjectId
    exercise_name: str
    min_reps: Optional[int] = Field(None, ge=1)
    max_reps: Optional[int] = Field(None, ge=1)
    min_sets: Optional[int] = Field(None, ge=1)
    target_weight: Optional[float] = Field(None, ge=0)
    target_time: Optional[int] = Field(None, ge=1)
    target_distance: Optional[float] = Field(None, ge=0)
    mastery_criteria: str = Field(..., max_length=500)
    min_sessions_at_level: int = Field(default=3, ge=1)
    min_weeks_at_level: Optional[int] = Field(None, ge=1)
    description: Optional[str] = Field(None, max_length=1000)
    form_cues: List[str] = []
    common_mistakes: List[str] = []
    modification_options: List[str] = []
    difficulty_score: float = Field(default=1.0, ge=0.1, le=10.0)
    estimated_time_to_master: Optional[int] = None


class ProgressionPathCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: str = Field(..., regex="^(strength|endurance|skill|flexibility|power|sport_specific)$")
    muscle_groups: List[str] = []
    movement_pattern: str = Field(..., regex="^(push|pull|squat|hinge|lunge|carry|rotation|isolation)$")
    equipment_required: List[str] = []
    steps: List[ProgressionStepSchema] = []
    difficulty_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert)$")
    estimated_duration_weeks: Optional[int] = Field(None, ge=1, le=104)
    is_public: bool = False
    requires_assessment: bool = False
    tags: List[str] = []
    prerequisites: List[str] = []
    leads_to: List[PydanticObjectId] = []


class ProgressionPathUpdateSchema(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, regex="^(strength|endurance|skill|flexibility|power|sport_specific)$")
    muscle_groups: Optional[List[str]] = None
    movement_pattern: Optional[str] = Field(None, regex="^(push|pull|squat|hinge|lunge|carry|rotation|isolation)$")
    equipment_required: Optional[List[str]] = None
    steps: Optional[List[ProgressionStepSchema]] = None
    difficulty_level: Optional[str] = Field(None, regex="^(beginner|intermediate|advanced|expert)$")
    estimated_duration_weeks: Optional[int] = Field(None, ge=1, le=104)
    is_public: Optional[bool] = None
    is_active: Optional[bool] = None
    requires_assessment: Optional[bool] = None
    tags: Optional[List[str]] = None
    prerequisites: Optional[List[str]] = None
    leads_to: Optional[List[PydanticObjectId]] = None


class ProgressionPathResponseSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    category: str
    muscle_groups: List[str]
    movement_pattern: str
    equipment_required: List[str]
    steps: List[ProgressionStepSchema]
    total_steps: int
    difficulty_level: str
    estimated_duration_weeks: Optional[int]
    is_system_path: bool
    created_by_user_id: Optional[PydanticObjectId]
    is_public: bool
    users_following: int
    completion_rate: float
    average_time_to_complete: Optional[int]
    is_active: bool
    requires_assessment: bool
    tags: List[str]
    prerequisites: List[str]
    leads_to: List[PydanticObjectId]
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class ProgressionPathListSchema(BaseModel):
    id: PydanticObjectId = Field(alias="_id")
    name: str
    description: Optional[str]
    category: str
    movement_pattern: str
    difficulty_level: str
    total_steps: int
    estimated_duration_weeks: Optional[int]
    users_following: int
    completion_rate: float
    is_public: bool
    is_system_path: bool
    created_at: datetime
    tags: List[str]

    class Config:
        populate_by_name = True


class ProgressionPathStatsSchema(BaseModel):
    total_paths: int
    paths_by_category: Dict[str, int]
    paths_by_difficulty: Dict[str, int]
    paths_by_movement: Dict[str, int]
    average_completion_rate: float
    most_popular_paths: List[ProgressionPathListSchema]
    system_paths_count: int
    user_created_paths_count: int


class ProgressionStepDetailSchema(BaseModel):
    step_number: int
    exercise_id: PydanticObjectId
    exercise_name: str
    criteria: Dict[str, Any]
    instructions: Dict[str, Any]
    difficulty_score: float
    estimated_time_to_master: Optional[int]


class ProgressionSummarySchema(BaseModel):
    total_steps: int
    difficulty_range: Dict[str, float]
    estimated_duration_days: Optional[int]
    equipment_needed: int
    muscle_groups_targeted: int
    completion_stats: Dict[str, Any]


class ProgressionSearchSchema(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None
    difficulty_level: Optional[str] = None
    movement_pattern: Optional[str] = None
    muscle_groups: Optional[List[str]] = None
    equipment_required: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_system_path: Optional[bool] = None
    min_steps: Optional[int] = None
    max_steps: Optional[int] = None
    min_duration_weeks: Optional[int] = None
    max_duration_weeks: Optional[int] = None
    tags: Optional[List[str]] = None


class StartProgressionSchema(BaseModel):
    starting_step: int = Field(default=1, ge=1)
    notes: Optional[str] = None


class FollowProgressionSchema(BaseModel):
    follow: bool = True


class CompleteProgressionSchema(BaseModel):
    completion_time_days: int = Field(..., ge=1)
    final_notes: Optional[str] = None
    rating: Optional[float] = Field(None, ge=1.0, le=5.0)


class ProgressionStepAdvanceSchema(BaseModel):
    step_completed: int = Field(..., ge=1)
    time_spent_days: int = Field(..., ge=1)
    notes: Optional[str] = None
    difficulty_rating: Optional[float] = Field(None, ge=1.0, le=10.0)