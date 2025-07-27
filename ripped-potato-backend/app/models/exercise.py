from datetime import datetime
from typing import List, Optional, Dict
from beanie import Document
from pydantic import Field, BaseModel


class ExerciseStrain(BaseModel):
    intensity: str = Field(..., pattern="^(low|moderate|high|max)$")
    load: str = Field(..., pattern="^(bodyweight|light|moderate|heavy)$")
    duration_type: str = Field(..., pattern="^(reps|time|distance)$")
    typical_volume: str = Field(..., description="e.g., '3x8', '30 seconds', '1 mile'")


class Exercise(Document):
    name: str = Field(..., min_length=1, max_length=200)
    discipline: List[str] = Field(default_factory=list)
    muscles: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)
    strain: ExerciseStrain
    similar_exercises: List[str] = Field(default_factory=list)
    progression_group: Optional[str] = None
    progression_level: Optional[int] = None
    next_progression: Optional[str] = None
    previous_progression: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None  # User ID reference
    
    class Settings:
        name = "exercises"
        indexes = [
            [("name", 1)],
            [("discipline", 1)],
            [("muscles", 1)],
            [("progression_group", 1)],
        ]
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Push-up",
                "discipline": ["strength", "calisthenics"],
                "muscles": ["chest", "triceps", "shoulders"],
                "equipment": [],
                "strain": {
                    "intensity": "moderate",
                    "load": "bodyweight",
                    "duration_type": "reps",
                    "typical_volume": "3x10"
                },
                "similar_exercises": ["Diamond Push-up", "Incline Push-up"],
                "progression_group": "push_up_progression",
                "progression_level": 2,
                "description": "Classic bodyweight exercise for upper body strength"
            }
        } 