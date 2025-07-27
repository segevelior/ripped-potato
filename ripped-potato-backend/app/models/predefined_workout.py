from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING, DESCENDING, TEXT

from app.models.mixins import TimestampMixin
from app.models.utils import PydanticObjectId


class PredefinedExercise(BaseModel):
    exercise_id: PydanticObjectId
    exercise_name: str  # Denormalized for display
    order: int = Field(default=0, ge=0)
    
    # Default set/rep configuration
    sets: int = Field(default=3, ge=1)
    reps_min: Optional[int] = Field(None, ge=1)
    reps_max: Optional[int] = Field(None, ge=1)
    target_reps: Optional[int] = None
    
    # Weight guidance
    weight_guidance: Optional[str] = None  # "bodyweight", "light", "moderate", "heavy", "1RM%"
    weight_percentage: Optional[float] = Field(None, ge=0.0, le=200.0)  # % of 1RM if applicable
    rpe_target: Optional[float] = Field(None, ge=1.0, le=10.0)  # Rate of Perceived Exertion
    
    # Rest and timing
    rest_seconds: Optional[int] = Field(None, ge=0)
    tempo: Optional[str] = None  # e.g., "3-1-2-1"
    
    # Exercise modifications
    notes: Optional[str] = Field(None, max_length=300)
    is_superset: bool = False
    superset_group: Optional[int] = None
    is_drop_set: bool = False
    is_warm_up: bool = False
    alternatives: List[PydanticObjectId] = []  # Alternative exercises
    
    # For beginners/modifications
    beginner_modification: Optional[str] = None
    advanced_modification: Optional[str] = None


class PredefinedWorkout(Document, TimestampMixin):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    short_description: Optional[str] = Field(None, max_length=200)  # For preview
    
    # Workout structure
    exercises: List[PredefinedExercise] = []
    
    # Categorization
    workout_type: str = Field(default="strength", regex="^(strength|cardio|flexibility|mobility|hiit|circuit|sport_specific|rehabilitation|yoga|pilates|mixed)$")
    primary_muscle_groups: List[str] = []
    secondary_muscle_groups: List[str] = []
    difficulty_level: str = Field(default="intermediate", regex="^(beginner|intermediate|advanced|expert)$")
    
    # Workout characteristics
    estimated_duration_minutes: int = Field(..., ge=5, le=180)
    calories_burned_estimate: Optional[int] = Field(None, ge=0)
    intensity_level: str = Field(default="moderate", regex="^(low|moderate|high|very_high)$")
    
    # Requirements
    equipment_required: List[str] = []
    space_requirements: List[str] = []  # gym, home, outdoor, minimal_space
    prerequisites: List[str] = []  # Required skills or experience
    
    # Content organization
    category: str = Field(..., regex="^(upper_body|lower_body|full_body|core|cardio|flexibility|sport_specific|rehabilitation)$")
    subcategory: Optional[str] = None  # push, pull, legs, etc.
    tags: List[str] = []
    
    # Metadata
    created_by: str = Field(default="system")  # "system", "coach", "community"
    author_name: Optional[str] = None
    author_credentials: Optional[str] = None
    source: Optional[str] = None  # Book, study, organization
    
    # Usage and popularity
    usage_count: int = Field(default=0, ge=0)
    rating_average: float = Field(default=0.0, ge=0.0, le=5.0)
    rating_count: int = Field(default=0, ge=0)
    popularity_score: float = Field(default=0.0, ge=0.0)  # Calculated metric
    
    # Status and availability
    is_active: bool = True
    is_featured: bool = False
    is_premium: bool = False
    
    # Instructions and guidance
    warm_up_instructions: Optional[str] = Field(None, max_length=500)
    cool_down_instructions: Optional[str] = Field(None, max_length=500)
    form_cues: List[str] = []
    safety_notes: List[str] = []
    
    # Progression and variations
    progression_notes: Optional[str] = Field(None, max_length=500)
    regression_notes: Optional[str] = Field(None, max_length=500)
    variations: List[str] = []
    
    # Goals and benefits
    primary_goals: List[str] = []  # strength, muscle_building, fat_loss, endurance, etc.
    benefits: List[str] = []
    contraindications: List[str] = []
    
    # Scheduling recommendations
    frequency_per_week: Optional[int] = Field(None, ge=1, le=7)
    rest_days_between: Optional[int] = Field(None, ge=0, le=7)
    best_time_of_day: Optional[str] = None  # morning, afternoon, evening, any
    
    # Media and resources
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    tutorial_links: List[str] = []
    
    class Settings:
        name = "predefined_workouts"
        indexes = [
            IndexModel([("workout_type", ASCENDING)]),
            IndexModel([("category", ASCENDING)]),
            IndexModel([("difficulty_level", ASCENDING)]),
            IndexModel([("primary_muscle_groups", ASCENDING)]),
            IndexModel([("equipment_required", ASCENDING)]),
            IndexModel([("estimated_duration_minutes", ASCENDING)]),
            IndexModel([("intensity_level", ASCENDING)]),
            IndexModel([("is_active", ASCENDING), ("is_featured", DESCENDING)]),
            IndexModel([("popularity_score", DESCENDING)]),
            IndexModel([("rating_average", DESCENDING)]),
            IndexModel([("usage_count", DESCENDING)]),
            IndexModel([("tags", ASCENDING)]),
            IndexModel([("primary_goals", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([
                ("name", TEXT),
                ("description", TEXT),
                ("tags", TEXT)
            ])
        ]

    def get_total_exercises(self) -> int:
        """Get total number of exercises (excluding warm-up)"""
        return len([ex for ex in self.exercises if not ex.is_warm_up])

    def get_equipment_list(self) -> List[str]:
        """Get comprehensive equipment list"""
        return list(set(self.equipment_required))

    def get_muscle_groups(self) -> List[str]:
        """Get all targeted muscle groups"""
        return list(set(self.primary_muscle_groups + self.secondary_muscle_groups))

    def get_superset_groups(self) -> Dict[int, List[PredefinedExercise]]:
        """Group exercises by superset groups"""
        supersets = {}
        for exercise in self.exercises:
            if exercise.is_superset and exercise.superset_group is not None:
                if exercise.superset_group not in supersets:
                    supersets[exercise.superset_group] = []
                supersets[exercise.superset_group].append(exercise)
        return supersets

    def calculate_estimated_volume(self) -> Dict[str, Any]:
        """Calculate estimated training volume"""
        total_sets = 0
        total_exercises = 0
        
        for exercise in self.exercises:
            if not exercise.is_warm_up:
                total_exercises += 1
                total_sets += exercise.sets
        
        return {
            "total_exercises": total_exercises,
            "total_sets": total_sets,
            "sets_per_exercise": round(total_sets / total_exercises, 1) if total_exercises > 0 else 0,
            "estimated_duration": self.estimated_duration_minutes
        }

    def get_difficulty_factors(self) -> Dict[str, Any]:
        """Analyze factors that contribute to difficulty"""
        factors = {
            "exercise_count": len(self.exercises),
            "superset_count": len(self.get_superset_groups()),
            "duration_minutes": self.estimated_duration_minutes,
            "intensity_level": self.intensity_level,
            "equipment_complexity": len(self.equipment_required),
            "skill_requirements": len(self.prerequisites)
        }
        
        # Calculate difficulty score
        score = 0
        if self.difficulty_level == "beginner":
            score = 1
        elif self.difficulty_level == "intermediate":
            score = 2
        elif self.difficulty_level == "advanced":
            score = 3
        elif self.difficulty_level == "expert":
            score = 4
        
        factors["difficulty_score"] = score
        return factors

    def is_suitable_for_equipment(self, available_equipment: List[str]) -> bool:
        """Check if workout can be performed with available equipment"""
        required = set(self.equipment_required)
        available = set(available_equipment)
        return required.issubset(available)

    def is_suitable_for_duration(self, available_minutes: int) -> bool:
        """Check if workout fits in available time"""
        return self.estimated_duration_minutes <= available_minutes

    def is_suitable_for_goals(self, user_goals: List[str]) -> bool:
        """Check if workout aligns with user goals"""
        workout_goals = set(self.primary_goals)
        user_goal_set = set(user_goals)
        return bool(workout_goals.intersection(user_goal_set))

    def calculate_popularity_score(self):
        """Calculate popularity score based on usage and ratings"""
        # Weighted score: 60% usage, 40% rating
        usage_score = min(self.usage_count / 100, 1.0)  # Normalize to 0-1
        rating_score = self.rating_average / 5.0 if self.rating_count > 0 else 0.0
        
        self.popularity_score = (usage_score * 0.6) + (rating_score * 0.4)

    def update_rating(self, new_rating: float):
        """Update the average rating with a new rating"""
        if 0.0 <= new_rating <= 5.0:
            total_rating = self.rating_average * self.rating_count
            self.rating_count += 1
            self.rating_average = (total_rating + new_rating) / self.rating_count
            self.calculate_popularity_score()

    def increment_usage(self):
        """Increment usage count and update popularity"""
        self.usage_count += 1
        self.calculate_popularity_score()

    def get_personalized_recommendations(self, user_level: str, user_goals: List[str]) -> Dict[str, Any]:
        """Get personalized recommendations for the workout"""
        recommendations = {
            "difficulty_match": self.difficulty_level == user_level,
            "goal_alignment": self.is_suitable_for_goals(user_goals),
            "modifications": [],
            "warnings": []
        }
        
        # Add difficulty-based recommendations
        if user_level == "beginner" and self.difficulty_level in ["advanced", "expert"]:
            recommendations["warnings"].append("This workout may be too challenging for beginners")
            if self.regression_notes:
                recommendations["modifications"].append(f"Consider: {self.regression_notes}")
        
        if user_level in ["advanced", "expert"] and self.difficulty_level == "beginner":
            recommendations["modifications"].append("Consider increasing intensity or adding variations")
            if self.progression_notes:
                recommendations["modifications"].append(f"Try: {self.progression_notes}")
        
        return recommendations

    def reorder_exercises(self):
        """Reorder exercises based on their order field"""
        self.exercises.sort(key=lambda x: x.order)