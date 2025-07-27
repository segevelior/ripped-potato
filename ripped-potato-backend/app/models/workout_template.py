from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING, TEXT

from app.models.mixins import TimestampMixin, UserOwnedMixin
from app.models.utils import PydanticObjectId


class ExerciseTemplate(BaseModel):
    exercise_id: PydanticObjectId
    exercise_name: str  # Denormalized for display
    order: int = Field(default=0, ge=0)
    
    # Set configuration
    sets_min: int = Field(default=1, ge=1)
    sets_max: int = Field(default=1, ge=1)
    target_sets: Optional[int] = None  # Recommended number of sets
    
    # Rep configuration
    reps_min: Optional[int] = Field(None, ge=1)
    reps_max: Optional[int] = Field(None, ge=1)
    target_reps: Optional[int] = None  # Recommended reps
    
    # Weight configuration
    weight_type: str = Field(default="fixed", regex="^(fixed|percentage|bodyweight|rpe_based)$")
    weight_percentage: Optional[float] = Field(None, ge=0.0, le=200.0)  # % of 1RM
    rpe_target: Optional[float] = Field(None, ge=1.0, le=10.0)  # Rate of Perceived Exertion
    
    # Time configuration
    rest_seconds_min: Optional[int] = Field(None, ge=0)
    rest_seconds_max: Optional[int] = Field(None, ge=0)
    target_rest_seconds: Optional[int] = Field(None, ge=0)
    tempo: Optional[str] = None  # e.g., "3-1-2-1" (eccentric-pause-concentric-pause)
    
    # Additional configuration
    notes: Optional[str] = Field(None, max_length=500)
    is_superset: bool = False
    superset_group: Optional[int] = None
    is_drop_set: bool = False
    is_warm_up: bool = False
    alternatives: List[PydanticObjectId] = []  # Alternative exercises
    
    # Progression parameters
    progression_type: str = Field(default="linear", regex="^(linear|double_progression|percentage|time_based)$")
    progression_increment: Optional[float] = None
    
    def validate_sets(self) -> bool:
        """Validate that sets_max >= sets_min"""
        return self.sets_max >= self.sets_min
    
    def validate_reps(self) -> bool:
        """Validate that reps_max >= reps_min if both are set"""
        if self.reps_min is not None and self.reps_max is not None:
            return self.reps_max >= self.reps_min
        return True
    
    def validate_rest(self) -> bool:
        """Validate that rest_max >= rest_min if both are set"""
        if self.rest_seconds_min is not None and self.rest_seconds_max is not None:
            return self.rest_seconds_max >= self.rest_seconds_min
        return True


class WorkoutTemplate(Document, TimestampMixin, UserOwnedMixin):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    
    # Template structure
    exercises: List[ExerciseTemplate] = []
    
    # Categorization
    workout_type: str = Field(default="strength", regex="^(strength|cardio|flexibility|mobility|sport_specific|rehabilitation|mixed)$")
    target_muscle_groups: List[str] = []  # Primary muscle groups targeted
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    
    # Requirements and logistics
    equipment_required: List[str] = []
    estimated_duration_minutes: Optional[int] = Field(None, ge=5, le=300)
    space_requirements: List[str] = []  # gym, home, outdoor, minimal_space
    
    # Template metadata
    tags: List[str] = []
    category: Optional[str] = None  # upper_body, lower_body, full_body, push, pull, legs
    
    # Usage and sharing
    is_public: bool = False
    is_system_template: bool = False  # Created by system/admin
    based_on_template_id: Optional[PydanticObjectId] = None  # If derived from another template
    
    # Stats and popularity (for public templates)
    usage_count: int = Field(default=0, ge=0)
    rating_average: float = Field(default=0.0, ge=0.0, le=5.0)
    rating_count: int = Field(default=0, ge=0)
    
    # Template settings
    auto_progression: bool = True
    warm_up_included: bool = False
    cool_down_included: bool = False
    
    # Instructions and notes
    setup_instructions: Optional[str] = Field(None, max_length=1000)
    coaching_notes: Optional[str] = Field(None, max_length=1000)
    safety_notes: Optional[str] = Field(None, max_length=500)
    
    class Settings:
        name = "workout_templates"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("workout_type", ASCENDING)]),
            IndexModel([("is_public", ASCENDING), ("workout_type", ASCENDING)]),
            IndexModel([("is_public", ASCENDING), ("difficulty_level", ASCENDING)]),
            IndexModel([("is_public", ASCENDING), ("rating_average", DESCENDING)]),
            IndexModel([("is_public", ASCENDING), ("usage_count", DESCENDING)]),
            IndexModel([("is_system_template", ASCENDING)]),
            IndexModel([("tags", ASCENDING)]),
            IndexModel([("target_muscle_groups", ASCENDING)]),
            IndexModel([("equipment_required", ASCENDING)]),
            IndexModel([
                ("name", TEXT),
                ("description", TEXT),
                ("tags", TEXT)
            ])
        ]

    def get_total_exercises(self) -> int:
        """Get total number of exercises in the template"""
        return len([ex for ex in self.exercises if not ex.is_warm_up])

    def get_superset_groups(self) -> Dict[int, List[ExerciseTemplate]]:
        """Group exercises by superset groups"""
        supersets = {}
        for exercise in self.exercises:
            if exercise.is_superset and exercise.superset_group is not None:
                if exercise.superset_group not in supersets:
                    supersets[exercise.superset_group] = []
                supersets[exercise.superset_group].append(exercise)
        return supersets

    def get_estimated_volume(self) -> Dict[str, Any]:
        """Calculate estimated training volume"""
        total_sets = 0
        total_exercises = 0
        
        for exercise in self.exercises:
            if not exercise.is_warm_up:
                total_exercises += 1
                # Use target sets or average of min/max
                if exercise.target_sets:
                    total_sets += exercise.target_sets
                else:
                    total_sets += (exercise.sets_min + exercise.sets_max) / 2
        
        return {
            "total_exercises": total_exercises,
            "estimated_total_sets": int(total_sets),
            "exercises_per_muscle_group": len(set(self.target_muscle_groups))
        }

    def validate_exercise_order(self) -> bool:
        """Validate that exercise order values are unique and sequential"""
        orders = [ex.order for ex in self.exercises]
        return len(orders) == len(set(orders))  # All unique

    def reorder_exercises(self):
        """Reorder exercises based on their order field"""
        self.exercises.sort(key=lambda x: x.order)

    def get_equipment_list(self) -> List[str]:
        """Get comprehensive equipment list for the template"""
        return list(set(self.equipment_required))

    def calculate_difficulty_score(self) -> float:
        """Calculate a difficulty score based on various factors"""
        score = 0.0
        
        # Base score from difficulty level
        difficulty_scores = {
            "beginner": 1.0,
            "intermediate": 2.0,
            "advanced": 3.0,
            "expert": 4.0
        }
        score += difficulty_scores.get(self.difficulty_level, 2.0)
        
        # Add complexity factors
        score += len(self.exercises) * 0.1  # More exercises = harder
        score += len(self.get_superset_groups()) * 0.3  # Supersets add complexity
        
        # Duration factor
        if self.estimated_duration_minutes:
            score += (self.estimated_duration_minutes / 60) * 0.5
        
        return min(score, 5.0)  # Cap at 5.0

    def can_be_performed_with_equipment(self, available_equipment: List[str]) -> bool:
        """Check if template can be performed with available equipment"""
        required = set(self.equipment_required)
        available = set(available_equipment)
        return required.issubset(available)

    def get_muscle_group_distribution(self) -> Dict[str, int]:
        """Get distribution of exercises per muscle group"""
        distribution = {}
        for muscle_group in self.target_muscle_groups:
            distribution[muscle_group] = distribution.get(muscle_group, 0) + 1
        return distribution

    def update_rating(self, new_rating: float):
        """Update the average rating with a new rating"""
        if 0.0 <= new_rating <= 5.0:
            total_rating = self.rating_average * self.rating_count
            self.rating_count += 1
            self.rating_average = (total_rating + new_rating) / self.rating_count

    def increment_usage(self):
        """Increment usage count"""
        self.usage_count += 1