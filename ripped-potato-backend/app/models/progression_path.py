from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class ProgressionStep(BaseModel):
    """Individual step in a progression path"""
    step_number: int = Field(..., ge=1)
    exercise_id: PydanticObjectId
    exercise_name: str  # Denormalized for display
    
    # Progression criteria
    min_reps: Optional[int] = Field(None, ge=1)
    max_reps: Optional[int] = Field(None, ge=1)
    min_sets: Optional[int] = Field(None, ge=1)
    target_weight: Optional[float] = Field(None, ge=0)
    target_time: Optional[int] = Field(None, ge=1)  # seconds
    target_distance: Optional[float] = Field(None, ge=0)  # meters/miles
    
    # Advancement criteria
    mastery_criteria: str = Field(..., max_length=500)  # "Complete 3x8 reps with perfect form"
    min_sessions_at_level: int = Field(default=3, ge=1)
    min_weeks_at_level: Optional[int] = Field(None, ge=1)
    
    # Instructions
    description: Optional[str] = Field(None, max_length=1000)
    form_cues: List[str] = []
    common_mistakes: List[str] = []
    modification_options: List[str] = []
    
    # Metrics
    difficulty_score: float = Field(default=1.0, ge=0.1, le=10.0)
    estimated_time_to_master: Optional[int] = None  # days
    
    def validate_progression_criteria(self) -> bool:
        """Validate that progression criteria are logically consistent"""
        if self.min_reps and self.max_reps:
            return self.max_reps >= self.min_reps
        return True


class ProgressionPath(Document):
    """Exercise progression tracking system"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    
    # Path categorization
    category: str = Field(..., regex="^(strength|endurance|skill|flexibility|power|sport_specific)$")
    muscle_groups: List[str] = []
    movement_pattern: str = Field(..., regex="^(push|pull|squat|hinge|lunge|carry|rotation|isolation)$")
    equipment_required: List[str] = []
    
    # Progression structure
    steps: List[ProgressionStep] = []
    total_steps: int = Field(default=0, ge=0)
    
    # Path metadata
    difficulty_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert)$")
    estimated_duration_weeks: Optional[int] = Field(None, ge=1, le=104)  # 2 years max
    
    # System or user created
    is_system_path: bool = False
    created_by_user_id: Optional[PydanticObjectId] = None
    is_public: bool = False
    
    # Usage statistics
    users_following: int = Field(default=0, ge=0)
    completion_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    average_time_to_complete: Optional[int] = None  # days
    
    # Path validity
    is_active: bool = True
    requires_assessment: bool = False  # Whether starting point needs assessment
    
    # Metadata
    tags: List[str] = []
    prerequisites: List[str] = []  # Other progression paths or skills needed
    leads_to: List[PydanticObjectId] = []  # Next progression paths
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "progression_paths"
        indexes = [
            [("category", 1), ("difficulty_level", 1)],
            [("muscle_groups", 1)],
            [("movement_pattern", 1)],
            [("is_system_path", 1), ("is_public", 1)],
            [("created_by_user_id", 1), ("created_at", -1)],
            [("users_following", -1)],
            [("completion_rate", -1)],
            [("tags", 1)],
            [("equipment_required", 1)],
        ]

    def calculate_total_steps(self) -> int:
        """Calculate and update total steps in progression"""
        self.total_steps = len(self.steps)
        return self.total_steps

    def get_step_by_number(self, step_number: int) -> Optional[ProgressionStep]:
        """Get a specific step by its number"""
        return next(
            (step for step in self.steps if step.step_number == step_number),
            None
        )

    def get_next_step(self, current_step: int) -> Optional[ProgressionStep]:
        """Get the next step in the progression"""
        return self.get_step_by_number(current_step + 1)

    def get_previous_step(self, current_step: int) -> Optional[ProgressionStep]:
        """Get the previous step in the progression"""
        return self.get_step_by_number(current_step - 1)

    def validate_step_sequence(self) -> bool:
        """Validate that steps are properly sequenced"""
        if not self.steps:
            return True
        
        step_numbers = [step.step_number for step in self.steps]
        expected_sequence = list(range(1, len(step_numbers) + 1))
        return sorted(step_numbers) == expected_sequence

    def get_difficulty_progression(self) -> List[float]:
        """Get difficulty scores for all steps"""
        return [step.difficulty_score for step in self.steps]

    def calculate_average_difficulty(self) -> float:
        """Calculate average difficulty across all steps"""
        if not self.steps:
            return 0.0
        
        difficulties = self.get_difficulty_progression()
        return sum(difficulties) / len(difficulties)

    def estimate_total_duration(self) -> Optional[int]:
        """Estimate total time to complete progression in days"""
        if not self.steps:
            return None
        
        total_days = 0
        for step in self.steps:
            if step.estimated_time_to_master:
                total_days += step.estimated_time_to_master
            else:
                # Default estimation based on difficulty
                total_days += int(step.difficulty_score * 7)  # 1 week per difficulty point
        
        return total_days

    def get_equipment_list(self) -> List[str]:
        """Get comprehensive equipment list for entire progression"""
        all_equipment = set(self.equipment_required)
        return list(all_equipment)

    def can_start_with_equipment(self, available_equipment: List[str]) -> bool:
        """Check if progression can be started with available equipment"""
        if not self.steps:
            return True
        
        first_step_equipment = set(self.equipment_required)
        available = set(available_equipment)
        return first_step_equipment.issubset(available)

    def get_progression_summary(self) -> Dict[str, Any]:
        """Get summary statistics for the progression"""
        return {
            "total_steps": self.total_steps,
            "difficulty_range": {
                "min": min(self.get_difficulty_progression()) if self.steps else 0,
                "max": max(self.get_difficulty_progression()) if self.steps else 0,
                "average": self.calculate_average_difficulty()
            },
            "estimated_duration_days": self.estimate_total_duration(),
            "equipment_needed": len(self.equipment_required),
            "muscle_groups_targeted": len(self.muscle_groups),
            "completion_stats": {
                "users_following": self.users_following,
                "completion_rate": self.completion_rate,
                "average_completion_time": self.average_time_to_complete
            }
        }

    def reorder_steps(self):
        """Reorder steps based on their step_number"""
        self.steps.sort(key=lambda x: x.step_number)

    def update_usage_stats(self, new_follower: bool = False, completion: bool = False, completion_time: Optional[int] = None):
        """Update usage statistics"""
        if new_follower:
            self.users_following += 1
        
        if completion:
            # Update completion rate (simplified calculation)
            if self.users_following > 0:
                completed_users = (self.completion_rate / 100.0) * self.users_following + 1
                self.completion_rate = (completed_users / self.users_following) * 100.0
            
            # Update average completion time
            if completion_time and self.average_time_to_complete:
                # Simple moving average
                self.average_time_to_complete = (self.average_time_to_complete + completion_time) // 2
            elif completion_time:
                self.average_time_to_complete = completion_time