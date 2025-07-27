from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.models.mixins import TimestampMixin, UserOwnedMixin
from app.models.utils import PydanticObjectId


class PlanWorkout(BaseModel):
    workout_template_id: Optional[PydanticObjectId] = None
    workout_id: Optional[PydanticObjectId] = None  # For completed workouts
    name: str
    description: Optional[str] = None
    day_of_week: int = Field(..., ge=0, le=6)  # 0=Monday, 6=Sunday
    week_number: int = Field(..., ge=1)
    estimated_duration_minutes: Optional[int] = None
    priority: str = Field(default="medium", regex="^(low|medium|high|critical)$")
    is_rest_day: bool = False
    notes: Optional[str] = None


class PlanWeek(BaseModel):
    week_number: int = Field(..., ge=1)
    focus: Optional[str] = None  # "strength", "endurance", "recovery", etc.
    workouts: List[PlanWorkout] = []
    weekly_goals: List[str] = []
    notes: Optional[str] = None
    rest_days: List[int] = []  # Days of week for rest (0-6)


class PlanProgress(BaseModel):
    week_number: int
    completed_workouts: int = 0
    total_workouts: int = 0
    completion_percentage: float = 0.0
    goals_achieved: List[str] = []
    notes: Optional[str] = None
    date_completed: Optional[datetime] = None


class Plan(Document, TimestampMixin, UserOwnedMixin):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    duration_weeks: int = Field(..., ge=1, le=52)
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    
    # Plan structure
    weeks: List[PlanWeek] = []
    
    # Goals and targets
    primary_goal_ids: List[PydanticObjectId] = []
    secondary_goal_ids: List[PydanticObjectId] = []
    target_workout_frequency: int = Field(default=3, ge=1, le=7)  # workouts per week
    
    # Dates and status
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    actual_end_date: Optional[datetime] = None
    is_active: bool = False
    status: str = Field(default="draft", regex="^(draft|active|paused|completed|abandoned)$")
    
    # Progress tracking
    progress: List[PlanProgress] = []
    current_week: int = Field(default=1, ge=1)
    overall_completion_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    
    # Plan metadata
    plan_type: str = Field(default="custom", regex="^(strength|endurance|weight_loss|weight_gain|rehabilitation|sport_specific|custom)$")
    tags: List[str] = []
    equipment_required: List[str] = []
    
    # Template and sharing
    is_template: bool = False
    is_public: bool = False
    based_on_template_id: Optional[PydanticObjectId] = None
    created_by_coach: bool = False
    
    # Analytics
    total_planned_workouts: int = 0
    completed_workouts: int = 0
    skipped_workouts: int = 0
    adherence_rate: float = Field(default=0.0, ge=0.0, le=100.0)

    class Settings:
        name = "plans"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("is_active", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("start_date", DESCENDING)]),
            IndexModel([("is_public", ASCENDING), ("plan_type", ASCENDING)]),
            IndexModel([("tags", ASCENDING)]),
            IndexModel([("difficulty_level", ASCENDING), ("plan_type", ASCENDING)]),
        ]

    def calculate_total_workouts(self) -> int:
        """Calculate total number of workouts in the plan"""
        total = 0
        for week in self.weeks:
            total += len([w for w in week.workouts if not w.is_rest_day])
        return total

    def get_current_week_workouts(self) -> List[PlanWorkout]:
        """Get workouts for the current week"""
        current_week_data = next(
            (week for week in self.weeks if week.week_number == self.current_week),
            None
        )
        return current_week_data.workouts if current_week_data else []

    def calculate_weekly_progress(self, week_number: int) -> Optional[PlanProgress]:
        """Calculate progress for a specific week"""
        week_progress = next(
            (p for p in self.progress if p.week_number == week_number),
            None
        )
        return week_progress

    def update_overall_progress(self):
        """Update overall completion percentage"""
        if self.total_planned_workouts == 0:
            self.overall_completion_percentage = 0.0
        else:
            self.overall_completion_percentage = (
                self.completed_workouts / self.total_planned_workouts
            ) * 100.0
        
        # Update adherence rate
        total_attempted = self.completed_workouts + self.skipped_workouts
        if total_attempted > 0:
            self.adherence_rate = (self.completed_workouts / total_attempted) * 100.0

    def get_next_workout(self) -> Optional[PlanWorkout]:
        """Get the next scheduled workout"""
        current_week_workouts = self.get_current_week_workouts()
        if not current_week_workouts:
            return None
        
        # Find first incomplete workout in current week
        # This would need to be cross-referenced with actual workout records
        return current_week_workouts[0] if current_week_workouts else None

    def advance_to_next_week(self) -> bool:
        """Advance the plan to the next week if conditions are met"""
        if self.current_week < self.duration_weeks:
            self.current_week += 1
            return True
        return False

    def is_plan_complete(self) -> bool:
        """Check if the plan is completed"""
        return (
            self.current_week > self.duration_weeks or
            self.overall_completion_percentage >= 100.0 or
            self.status == "completed"
        )

    def get_week_schedule(self, week_number: int) -> Dict[int, PlanWorkout]:
        """Get workout schedule for a specific week as day-of-week mapping"""
        week_data = next(
            (week for week in self.weeks if week.week_number == week_number),
            None
        )
        if not week_data:
            return {}
        
        schedule = {}
        for workout in week_data.workouts:
            schedule[workout.day_of_week] = workout
        
        return schedule