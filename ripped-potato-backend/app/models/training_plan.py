from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class TrainingPhase(BaseModel):
    """Individual phase within a training plan"""
    phase_number: int = Field(..., ge=1)
    name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    duration_weeks: int = Field(..., ge=1, le=52)
    focus: str  # "strength", "hypertrophy", "power", "endurance", "recovery"
    intensity_percentage: float = Field(..., ge=0.0, le=100.0)
    volume_percentage: float = Field(..., ge=0.0, le=200.0)  # Can exceed 100% for volume phases
    workout_template_ids: List[PydanticObjectId] = []
    deload_week: Optional[int] = None  # Which week is deload (if any)
    

class TrainingPlan(Document):
    """Periodized training programs"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    
    # Plan structure
    total_duration_weeks: int = Field(..., ge=1, le=104)  # Max 2 years
    phases: List[TrainingPhase] = []
    
    # Plan categorization
    plan_type: str = Field(..., regex="^(strength|hypertrophy|powerlifting|bodybuilding|endurance|sport_specific|general_fitness)$")
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    
    # Target demographics
    target_age_min: Optional[int] = Field(None, ge=13, le=100)
    target_age_max: Optional[int] = Field(None, ge=13, le=100)
    target_experience_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    
    # Requirements
    equipment_required: List[str] = []
    time_commitment_hours_per_week: Optional[float] = Field(None, ge=1.0, le=40.0)
    sessions_per_week: Optional[int] = Field(None, ge=1, le=14)
    
    # Goals and outcomes
    primary_goals: List[str] = []  # "strength_gain", "muscle_growth", "fat_loss", etc.
    expected_outcomes: List[str] = []
    prerequisite_skills: List[str] = []
    
    # Popularity and usage
    usage_count: int = Field(default=0, ge=0)
    success_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    completion_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    average_rating: float = Field(default=0.0, ge=0.0, le=5.0)
    rating_count: int = Field(default=0, ge=0)
    
    # System management
    is_system_plan: bool = True
    created_by_user_id: Optional[PydanticObjectId] = None
    is_public: bool = True
    is_active: bool = True
    is_featured: bool = False
    
    # SEO and discovery
    tags: List[str] = []
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "training_plans"
        indexes = [
            [("plan_type", 1), ("difficulty_level", 1)],
            [("is_active", 1), ("is_featured", 1)],
            [("usage_count", -1)],
            [("average_rating", -1)],
            [("primary_goals", 1)],
            [("equipment_required", 1)],
            [("tags", 1)],
        ]

    def calculate_total_weeks(self) -> int:
        """Calculate total weeks from all phases"""
        return sum(phase.duration_weeks for phase in self.phases)
    
    def validate_phases(self) -> bool:
        """Validate that phases are properly sequenced"""
        if not self.phases:
            return True
        
        phase_numbers = [phase.phase_number for phase in self.phases]
        expected_sequence = list(range(1, len(phase_numbers) + 1))
        return sorted(phase_numbers) == expected_sequence
    
    def get_phase_by_week(self, week: int) -> Optional[TrainingPhase]:
        """Get which phase a specific week belongs to"""
        current_week = 0
        for phase in sorted(self.phases, key=lambda x: x.phase_number):
            if current_week < week <= current_week + phase.duration_weeks:
                return phase
            current_week += phase.duration_weeks
        return None
    
    def add_rating(self, rating: float):
        """Add a new rating"""
        if 0.0 <= rating <= 5.0:
            total_rating = self.average_rating * self.rating_count
            self.rating_count += 1
            self.average_rating = (total_rating + rating) / self.rating_count