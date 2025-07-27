from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import Field, BaseModel
from beanie import Document, PydanticObjectId


class GoalProgress(BaseModel):
    """Progress snapshot for a goal"""
    date: datetime
    value: float
    notes: Optional[str] = None


class Goal(Document):
    """Goal model representing user objectives"""
    user_id: PydanticObjectId
    name: str
    description: Optional[str] = None
    goal_type: str = Field(...)  # strength, endurance, weight_loss, weight_gain, custom
    # Goal type examples:
    # strength: "Bench press 225 lbs", "Squat 2x bodyweight"
    # endurance: "Run 5K in under 25 minutes", "Complete a marathon"
    # weight_loss: "Lose 20 lbs", "Reach 15% body fat"
    # weight_gain: "Gain 10 lbs of muscle"
    # custom: Any other goal
    
    # Target values
    target_value: Optional[float] = None  # e.g., 225 (lbs), 25 (minutes), 150 (lbs body weight)
    target_unit: Optional[str] = None  # e.g., "lbs", "minutes", "reps", "miles"
    current_value: Optional[float] = None  # Current progress value
    starting_value: Optional[float] = None  # Starting point for tracking progress
    
    # Timeline
    start_date: datetime = Field(default_factory=datetime.utcnow)
    deadline: Optional[datetime] = None
    
    # Status
    status: str = Field(default="active")  # active, completed, paused, abandoned
    completed_date: Optional[datetime] = None
    
    # Progress tracking
    progress_snapshots: List[GoalProgress] = Field(default_factory=list)
    progress_percentage: Optional[float] = Field(None, ge=0, le=100)
    
    # Associations
    associated_exercise_ids: List[PydanticObjectId] = Field(default_factory=list)
    associated_workout_ids: List[PydanticObjectId] = Field(default_factory=list)
    plan_id: Optional[PydanticObjectId] = None  # If part of a training plan
    
    # Additional metadata
    priority: str = Field(default="medium")  # low, medium, high
    category: Optional[str] = None  # Additional categorization
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        collection = "goals"
        indexes = [
            [("user_id", 1), ("status", 1), ("deadline", 1)],  # Active goals by deadline
            [("user_id", 1), ("created_at", -1)],  # Recent goals
            [("user_id", 1), ("goal_type", 1), ("status", 1)],  # Goals by type
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Bench Press 225 lbs",
                "description": "Achieve a 1RM bench press of 225 pounds",
                "goal_type": "strength",
                "target_value": 225,
                "target_unit": "lbs",
                "current_value": 185,
                "starting_value": 155,
                "deadline": "2024-06-01T00:00:00",
                "status": "active",
                "progress_percentage": 66.7,
                "priority": "high",
                "associated_exercise_ids": ["507f1f77bcf86cd799439011"],
                "tags": ["strength", "upper-body", "compound-movement"]
            }
        }
    
    def calculate_progress(self) -> float:
        """Calculate progress percentage based on current, starting, and target values"""
        if not all([self.target_value is not None, 
                   self.current_value is not None, 
                   self.starting_value is not None]):
            return 0.0
        
        total_distance = abs(self.target_value - self.starting_value)
        if total_distance == 0:
            return 100.0 if self.current_value == self.target_value else 0.0
        
        current_distance = abs(self.current_value - self.starting_value)
        return min(100.0, (current_distance / total_distance) * 100)