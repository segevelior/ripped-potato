from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import Field, BaseModel
from beanie import Document, PydanticObjectId


class WorkoutExercise(BaseModel):
    """Embedded exercise within a workout"""
    exercise_id: PydanticObjectId
    exercise_name: str  # Denormalized for performance
    sets: List[Dict[str, Any]] = Field(default_factory=list)
    # Example sets: [
    #   {"reps": 10, "weight": 100, "rest": 60, "completed": true},
    #   {"reps": 8, "weight": 110, "rest": 90, "completed": true}
    # ]
    notes: Optional[str] = None
    order: int = 0
    superset_id: Optional[str] = None  # For grouping supersets
    rest_after_exercise: Optional[int] = None  # Rest in seconds


class Workout(Document):
    """Workout model representing a training session"""
    user_id: PydanticObjectId
    name: str
    date: datetime = Field(default_factory=datetime.utcnow)
    exercises: List[WorkoutExercise] = Field(default_factory=list)
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    workout_type: Optional[str] = None  # strength, cardio, flexibility, hybrid
    template_id: Optional[PydanticObjectId] = None  # if created from template
    is_completed: bool = False
    calories_burned: Optional[int] = None
    mood: Optional[str] = None  # great, good, okay, bad
    energy_level: Optional[int] = Field(None, ge=1, le=10)  # 1-10 scale
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        collection = "workouts"
        indexes = [
            [("user_id", 1), ("date", -1)],  # For user's workout history
            [("user_id", 1), ("created_at", -1)],  # For listing recent workouts
            [("user_id", 1), ("is_completed", 1), ("date", -1)],  # For completed workouts
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Upper Body Strength",
                "date": "2024-01-15T10:00:00",
                "exercises": [
                    {
                        "exercise_id": "507f1f77bcf86cd799439011",
                        "exercise_name": "Bench Press",
                        "sets": [
                            {"reps": 10, "weight": 135, "rest": 90, "completed": True},
                            {"reps": 8, "weight": 155, "rest": 90, "completed": True},
                            {"reps": 6, "weight": 175, "rest": 120, "completed": True}
                        ],
                        "notes": "Felt strong today",
                        "order": 1
                    }
                ],
                "duration_minutes": 45,
                "notes": "Great workout, increased bench press weight",
                "workout_type": "strength",
                "is_completed": True,
                "mood": "great",
                "energy_level": 8
            }
        }