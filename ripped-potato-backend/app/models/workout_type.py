from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class WorkoutTypeCharacteristics(BaseModel):
    """Defining characteristics of a workout type"""
    primary_energy_system: str = Field(..., regex="^(aerobic|anaerobic_alactic|anaerobic_lactic|mixed)$")
    intensity_level: str = Field(default="moderate", regex="^(low|moderate|high|variable)$")
    typical_duration_min: Optional[int] = Field(None, ge=5, le=300)
    typical_duration_max: Optional[int] = Field(None, ge=5, le=300)
    rest_to_work_ratio: Optional[str] = None  # "1:3", "2:1", etc.
    rep_range_focus: Optional[str] = None  # "1-5", "6-12", "12+", "time_based"
    load_intensity: str = Field(default="moderate", regex="^(light|moderate|heavy|variable)$")
    movement_complexity: str = Field(default="simple", regex="^(simple|moderate|complex|variable)$")


class WorkoutTypeStructure(BaseModel):
    """Typical structure and components of the workout type"""
    warm_up_required: bool = True
    cool_down_required: bool = True
    typical_exercises_count: Optional[int] = Field(None, ge=1, le=50)
    typical_sets_per_exercise: Optional[int] = Field(None, ge=1, le=20)
    allows_supersets: bool = False
    allows_circuits: bool = False
    allows_drop_sets: bool = False
    progression_style: str = Field(default="linear", regex="^(linear|undulating|block|concurrent)$")


class WorkoutType(Document):
    """Workout type categorization system"""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100, regex="^[a-z0-9-]+$")
    description: Optional[str] = Field(None, max_length=1000)
    
    # Categorization
    category: str = Field(..., regex="^(strength|cardio|flexibility|sports|rehabilitation|mixed)$")
    subcategory: Optional[str] = None
    
    # Workout characteristics
    characteristics: WorkoutTypeCharacteristics
    structure: WorkoutTypeStructure
    
    # Target outcomes and benefits
    primary_benefits: List[str] = []  # "strength", "endurance", "power", "flexibility", etc.
    secondary_benefits: List[str] = []
    target_fitness_components: List[str] = []  # "muscular_strength", "cardiovascular_endurance", etc.
    
    # Suitability and requirements
    skill_level_required: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert|any)$")
    equipment_required: List[str] = []
    space_requirements: List[str] = []  # "gym", "home", "outdoor", "minimal"
    suitable_for_goals: List[str] = []  # Goal types this workout type supports
    
    # Programming guidelines
    recommended_frequency_per_week: Optional[str] = None  # "2-3", "3-4", "daily"
    recovery_time_hours: Optional[int] = Field(None, ge=0, le=168)  # Hours until next similar workout
    can_be_combined_with: List[str] = []  # Other workout types that pair well
    conflicts_with: List[str] = []  # Workout types that shouldn't be done together
    
    # Contraindications and precautions
    contraindications: List[str] = []  # Medical conditions or situations to avoid
    precautions: List[str] = []  # Things to be careful about
    modifications_available: List[str] = []  # Available modifications for different populations
    
    # Usage statistics
    usage_count: int = Field(default=0, ge=0)
    popularity_score: float = Field(default=0.0, ge=0.0)
    user_rating_average: float = Field(default=0.0, ge=0.0, le=5.0)
    user_rating_count: int = Field(default=0, ge=0)
    
    # Content and media
    icon_url: Optional[str] = None
    demonstration_video_url: Optional[str] = None
    example_workouts: List[PydanticObjectId] = []  # References to example workout templates
    
    # System management
    is_system_type: bool = True
    is_active: bool = True
    is_featured: bool = False
    created_by_user_id: Optional[PydanticObjectId] = None
    approved_by_admin: bool = True
    
    # SEO and discovery
    tags: List[str] = []
    keywords: List[str] = []
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "workout_types"
        indexes = [
            [("slug", 1)],  # Unique slug
            [("category", 1), ("subcategory", 1)],
            [("is_active", 1), ("is_featured", 1)],
            [("popularity_score", -1)],
            [("user_rating_average", -1)],
            [("primary_benefits", 1)],
            [("skill_level_required", 1)],
            [("equipment_required", 1)],
            [("suitable_for_goals", 1)],
            [("tags", 1)],
            [("usage_count", -1)],
        ]

    def calculate_popularity_score(self) -> float:
        """Calculate popularity score based on usage and ratings"""
        score = 0.0
        
        # Base score from usage
        score += self.usage_count * 0.1
        
        # Rating contribution
        if self.user_rating_count > 0:
            # Weight rating by number of ratings (more ratings = more reliable)
            rating_weight = min(1.0, self.user_rating_count / 100.0)  # Max weight at 100 ratings
            score += self.user_rating_average * 20 * rating_weight
        
        # Featured bonus
        if self.is_featured:
            score += 50.0
        
        # Content richness bonus
        if self.icon_url:
            score += 5.0
        if self.demonstration_video_url:
            score += 10.0
        if self.example_workouts:
            score += len(self.example_workouts) * 2.0
        
        # Versatility bonus (more benefits = more versatile)
        score += len(self.primary_benefits) * 3.0
        score += len(self.secondary_benefits) * 1.5
        
        self.popularity_score = score
        return score

    def add_rating(self, rating: float):
        """Add a new user rating"""
        if 0.0 <= rating <= 5.0:
            total_rating = self.user_rating_average * self.user_rating_count
            self.user_rating_count += 1
            self.user_rating_average = (total_rating + rating) / self.user_rating_count

    def increment_usage(self):
        """Increment usage count"""
        self.usage_count += 1

    def is_suitable_for_skill_level(self, user_skill_level: str) -> bool:
        """Check if workout type is suitable for user's skill level"""
        skill_hierarchy = {
            "beginner": 1,
            "intermediate": 2,
            "advanced": 3,
            "expert": 4
        }
        
        if self.skill_level_required == "any":
            return True
        
        required_level = skill_hierarchy.get(self.skill_level_required, 1)
        user_level = skill_hierarchy.get(user_skill_level, 1)
        
        return user_level >= required_level

    def can_be_performed_with_equipment(self, available_equipment: List[str]) -> bool:
        """Check if workout type can be performed with available equipment"""
        if not self.equipment_required:
            return True  # No equipment required
        
        required = set(self.equipment_required)
        available = set(available_equipment)
        return required.issubset(available)

    def can_be_performed_in_space(self, available_space: str) -> bool:
        """Check if workout type can be performed in available space"""
        if not self.space_requirements:
            return True  # No specific space required
        
        return available_space.lower() in [space.lower() for space in self.space_requirements]

    def get_recovery_recommendation(self) -> Optional[str]:
        """Get recovery time recommendation as human-readable string"""
        if not self.recovery_time_hours:
            return None
        
        if self.recovery_time_hours < 24:
            return f"{self.recovery_time_hours} hours"
        else:
            days = self.recovery_time_hours // 24
            remaining_hours = self.recovery_time_hours % 24
            if remaining_hours == 0:
                return f"{days} day{'s' if days > 1 else ''}"
            else:
                return f"{days} day{'s' if days > 1 else ''} and {remaining_hours} hours"

    def is_compatible_with(self, other_workout_type: str) -> bool:
        """Check if this workout type is compatible with another"""
        return (
            other_workout_type in self.can_be_combined_with and
            other_workout_type not in self.conflicts_with
        )

    def get_duration_range(self) -> Optional[Dict[str, int]]:
        """Get duration range as a dictionary"""
        if not (self.characteristics.typical_duration_min and self.characteristics.typical_duration_max):
            return None
        
        return {
            "min_minutes": self.characteristics.typical_duration_min,
            "max_minutes": self.characteristics.typical_duration_max,
            "average_minutes": (self.characteristics.typical_duration_min + self.characteristics.typical_duration_max) // 2
        }

    def get_comprehensive_info(self) -> Dict[str, Any]:
        """Get comprehensive workout type information"""
        return {
            "basic_info": {
                "name": self.name,
                "category": self.category,
                "subcategory": self.subcategory,
                "description": self.description,
                "skill_level_required": self.skill_level_required
            },
            "characteristics": self.characteristics.model_dump(),
            "structure": self.structure.model_dump(),
            "benefits": {
                "primary": self.primary_benefits,
                "secondary": self.secondary_benefits,
                "fitness_components": self.target_fitness_components
            },
            "requirements": {
                "equipment": self.equipment_required,
                "space": self.space_requirements,
                "suitable_goals": self.suitable_for_goals
            },
            "programming": {
                "frequency": self.recommended_frequency_per_week,
                "recovery_time": self.get_recovery_recommendation(),
                "compatible_with": self.can_be_combined_with,
                "conflicts_with": self.conflicts_with
            },
            "safety": {
                "contraindications": self.contraindications,
                "precautions": self.precautions,
                "modifications": self.modifications_available
            },
            "popularity": {
                "usage_count": self.usage_count,
                "popularity_score": self.popularity_score,
                "rating": {
                    "average": self.user_rating_average,
                    "count": self.user_rating_count
                }
            }
        }

    def estimate_calories_burned_per_hour(self, user_weight_kg: float = 70.0) -> Optional[float]:
        """Rough estimate of calories burned per hour (placeholder implementation)"""
        # This is a simplified estimation - in practice, you'd have more sophisticated calculations
        intensity_multipliers = {
            "low": 3.0,
            "moderate": 6.0,
            "high": 9.0,
            "variable": 6.5
        }
        
        base_met = intensity_multipliers.get(self.characteristics.intensity_level, 6.0)
        
        # MET calculation: METs * weight_kg * hours
        # We calculate per hour, so hours = 1
        calories_per_hour = base_met * user_weight_kg * 1.0
        
        return calories_per_hour

    def get_progression_suggestions(self) -> List[str]:
        """Get suggestions for how to progress in this workout type"""
        suggestions = []
        
        if self.structure.progression_style == "linear":
            suggestions.append("Gradually increase weight, reps, or duration each session")
        elif self.structure.progression_style == "undulating":
            suggestions.append("Vary intensity and volume throughout the week")
        elif self.structure.progression_style == "block":
            suggestions.append("Focus on one attribute for several weeks before switching")
        
        if self.characteristics.rep_range_focus:
            suggestions.append(f"Focus on {self.characteristics.rep_range_focus} rep range for optimal results")
        
        if self.recovery_time_hours:
            suggestions.append(f"Allow {self.get_recovery_recommendation()} recovery between sessions")
        
        return suggestions

    def validate_workout_structure(self) -> bool:
        """Validate that the workout structure makes sense"""
        # Check duration consistency
        if (self.characteristics.typical_duration_min and 
            self.characteristics.typical_duration_max and
            self.characteristics.typical_duration_min > self.characteristics.typical_duration_max):
            return False
        
        # Check that primary benefits aren't duplicated in secondary
        if set(self.primary_benefits) & set(self.secondary_benefits):
            return False
        
        return True