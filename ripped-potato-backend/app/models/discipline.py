from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class DisciplineMetrics(BaseModel):
    """Metrics and statistics for a discipline"""
    total_exercises: int = Field(default=0, ge=0)
    total_workouts: int = Field(default=0, ge=0)
    active_practitioners: int = Field(default=0, ge=0)
    average_session_duration: Optional[int] = None  # minutes
    difficulty_distribution: Dict[str, int] = {}  # beginner: 10, intermediate: 20, etc.
    popular_equipment: List[str] = []
    common_goals: List[str] = []


class DisciplineRequirements(BaseModel):
    """Requirements and recommendations for a discipline"""
    skill_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert)$")
    equipment_required: List[str] = []
    equipment_optional: List[str] = []
    space_requirements: List[str] = []  # "home", "gym", "outdoor", "minimal_space"
    time_commitment_min: Optional[int] = None  # minutes per session
    time_commitment_max: Optional[int] = None  # minutes per session
    frequency_recommendation: Optional[str] = None  # "2-3 times per week"
    prerequisite_skills: List[str] = []
    safety_considerations: List[str] = []


class Discipline(Document):
    """Workout categorization and discipline system"""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100, regex="^[a-z0-9-]+$")
    description: Optional[str] = Field(None, max_length=1000)
    
    # Categorization
    category: str = Field(..., regex="^(strength|cardio|flexibility|martial_arts|sports|rehabilitation|mind_body|hybrid)$")
    subcategory: Optional[str] = None  # More specific categorization
    
    # Core characteristics
    primary_focus: List[str] = []  # "strength", "endurance", "flexibility", "skill", "coordination"
    movement_patterns: List[str] = []  # "push", "pull", "squat", "hinge", "carry", etc.
    energy_systems: List[str] = []  # "aerobic", "anaerobic_alactic", "anaerobic_lactic"
    
    # Requirements and setup
    requirements: DisciplineRequirements = Field(default_factory=DisciplineRequirements)
    
    # Metrics and popularity
    metrics: DisciplineMetrics = Field(default_factory=DisciplineMetrics)
    
    # Content organization
    muscle_groups_targeted: List[str] = []
    typical_workout_types: List[str] = []  # "circuit", "strength", "endurance", "skill_practice"
    
    # Educational content
    principles: List[str] = []  # Core principles of the discipline
    common_progressions: List[str] = []  # Typical progression paths
    key_concepts: List[str] = []  # Important concepts to understand
    
    # System organization
    is_system_discipline: bool = True  # Most disciplines are system-defined
    parent_discipline_id: Optional[PydanticObjectId] = None  # For sub-disciplines
    related_disciplines: List[PydanticObjectId] = []
    
    # Content and media
    icon_url: Optional[str] = None
    banner_image_url: Optional[str] = None
    introduction_video_url: Optional[str] = None
    
    # Status and visibility
    is_active: bool = True
    is_featured: bool = False
    popularity_score: float = Field(default=0.0, ge=0.0)
    
    # SEO and discovery
    tags: List[str] = []
    keywords: List[str] = []
    difficulty_level: str = Field(default="beginner", regex="^(beginner|intermediate|advanced|expert|mixed)$")
    
    # Metadata
    created_by_user_id: Optional[PydanticObjectId] = None
    approved_by_admin: bool = True
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "disciplines"
        indexes = [
            [("slug", 1)],  # Unique slug
            [("category", 1), ("subcategory", 1)],
            [("is_active", 1), ("is_featured", 1)],
            [("popularity_score", -1)],
            [("tags", 1)],
            [("primary_focus", 1)],
            [("difficulty_level", 1)],
            [("is_system_discipline", 1)],
            [("muscle_groups_targeted", 1)],
            [("movement_patterns", 1)],
        ]

    def update_metrics(self, exercise_count: Optional[int] = None, workout_count: Optional[int] = None, practitioner_count: Optional[int] = None):
        """Update discipline metrics"""
        if exercise_count is not None:
            self.metrics.total_exercises = exercise_count
        if workout_count is not None:
            self.metrics.total_workouts = workout_count
        if practitioner_count is not None:
            self.metrics.active_practitioners = practitioner_count

    def calculate_popularity_score(self) -> float:
        """Calculate popularity score based on various factors"""
        score = 0.0
        
        # Base score from metrics
        score += self.metrics.active_practitioners * 0.1
        score += self.metrics.total_exercises * 0.05
        score += self.metrics.total_workouts * 0.02
        
        # Bonus for being featured
        if self.is_featured:
            score += 50.0
        
        # Bonus for having content
        if self.icon_url:
            score += 5.0
        if self.banner_image_url:
            score += 5.0
        if self.introduction_video_url:
            score += 10.0
        
        # Content richness bonus
        score += len(self.principles) * 2.0
        score += len(self.common_progressions) * 2.0
        score += len(self.key_concepts) * 1.5
        
        self.popularity_score = score
        return score

    def get_difficulty_distribution(self) -> Dict[str, float]:
        """Get difficulty distribution as percentages"""
        total = sum(self.metrics.difficulty_distribution.values())
        if total == 0:
            return {}
        
        return {
            level: (count / total) * 100
            for level, count in self.metrics.difficulty_distribution.items()
        }

    def is_suitable_for_beginner(self) -> bool:
        """Check if discipline is suitable for beginners"""
        return (
            self.difficulty_level in ["beginner", "mixed"] or
            self.requirements.skill_level == "beginner"
        )

    def get_equipment_summary(self) -> Dict[str, List[str]]:
        """Get comprehensive equipment summary"""
        return {
            "required": self.requirements.equipment_required,
            "optional": self.requirements.equipment_optional,
            "popular": self.metrics.popular_equipment[:5]  # Top 5 most popular
        }

    def estimate_session_duration(self) -> Optional[Dict[str, int]]:
        """Estimate typical session duration"""
        if not (self.requirements.time_commitment_min and self.requirements.time_commitment_max):
            return None
        
        return {
            "min_minutes": self.requirements.time_commitment_min,
            "max_minutes": self.requirements.time_commitment_max,
            "average_minutes": (self.requirements.time_commitment_min + self.requirements.time_commitment_max) // 2
        }

    def get_related_disciplines_info(self) -> List[str]:
        """Get related disciplines as a simple list (would need to be populated from DB in real usage)"""
        # This would typically involve querying the database for related disciplines
        # For now, return the IDs as strings
        return [str(discipline_id) for discipline_id in self.related_disciplines]

    def can_be_practiced_at_location(self, location: str) -> bool:
        """Check if discipline can be practiced at a given location"""
        location_map = {
            "home": ["home", "minimal_space"],
            "gym": ["gym", "indoor"],
            "outdoor": ["outdoor", "park"],
            "minimal": ["minimal_space", "bodyweight"]
        }
        
        user_requirements = location_map.get(location.lower(), [location.lower()])
        discipline_spaces = [space.lower() for space in self.requirements.space_requirements]
        
        return any(req in discipline_spaces for req in user_requirements)

    def get_progression_overview(self) -> Dict[str, Any]:
        """Get an overview of typical progressions in this discipline"""
        return {
            "beginner_focus": self.common_progressions[:3] if len(self.common_progressions) >= 3 else self.common_progressions,
            "key_skills": self.key_concepts[:5],
            "time_to_proficiency": self.estimate_session_duration(),
            "equipment_progression": {
                "start_with": self.requirements.equipment_required[:3],
                "add_later": self.requirements.equipment_optional[:3]
            }
        }

    def update_difficulty_distribution(self, difficulty_counts: Dict[str, int]):
        """Update the difficulty distribution metrics"""
        self.metrics.difficulty_distribution = difficulty_counts

    def add_related_discipline(self, discipline_id: PydanticObjectId):
        """Add a related discipline"""
        if discipline_id not in self.related_disciplines:
            self.related_disciplines.append(discipline_id)

    def remove_related_discipline(self, discipline_id: PydanticObjectId):
        """Remove a related discipline"""
        if discipline_id in self.related_disciplines:
            self.related_disciplines.remove(discipline_id)

    def get_comprehensive_info(self) -> Dict[str, Any]:
        """Get comprehensive discipline information"""
        return {
            "basic_info": {
                "name": self.name,
                "category": self.category,
                "subcategory": self.subcategory,
                "description": self.description,
                "difficulty_level": self.difficulty_level
            },
            "focus_areas": {
                "primary_focus": self.primary_focus,
                "movement_patterns": self.movement_patterns,
                "energy_systems": self.energy_systems,
                "muscle_groups": self.muscle_groups_targeted
            },
            "requirements": self.requirements.model_dump(),
            "metrics": self.metrics.model_dump(),
            "learning": {
                "principles": self.principles,
                "progressions": self.common_progressions,
                "key_concepts": self.key_concepts
            },
            "popularity": {
                "score": self.popularity_score,
                "is_featured": self.is_featured,
                "active_practitioners": self.metrics.active_practitioners
            }
        }