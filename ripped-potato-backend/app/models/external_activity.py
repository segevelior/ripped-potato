from datetime import datetime
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class ActivityMetrics(BaseModel):
    """Metrics from external activity"""
    duration_minutes: Optional[int] = None
    distance_km: Optional[float] = None
    calories_burned: Optional[float] = None
    average_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    steps: Optional[int] = None
    elevation_gain_m: Optional[float] = None
    pace_per_km: Optional[str] = None  # "5:30" format
    power_watts: Optional[float] = None
    

class ExternalActivity(Document):
    """Third-party integrations and external activities"""
    user_id: PydanticObjectId
    
    # Activity identification
    external_id: str = Field(..., max_length=200)  # ID from external service
    external_platform: str = Field(..., max_length=100)  # "strava", "garmin", "fitbit", etc.
    
    # Basic activity info
    activity_type: str = Field(..., max_length=100)  # "running", "cycling", "swimming", etc.
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    
    # Timing
    start_time: datetime
    end_time: Optional[datetime] = None
    
    # Metrics
    metrics: ActivityMetrics = Field(default_factory=ActivityMetrics)
    
    # Location data
    location: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None  # {"lat": 40.7128, "lng": -74.0060}
    
    # Equipment and conditions
    equipment_used: List[str] = []  # "bike", "shoes", "watch", etc.
    weather_conditions: Optional[Dict[str, Any]] = None
    
    # Integration data
    raw_data: Optional[Dict[str, Any]] = None  # Store raw data from external API
    last_synced: datetime = Field(default_factory=datetime.utcnow)
    sync_status: str = Field(default="synced", regex="^(synced|failed|pending)$")
    
    # Mapping to internal system
    mapped_workout_id: Optional[PydanticObjectId] = None  # If converted to internal workout
    mapped_exercise_ids: List[PydanticObjectId] = []  # Mapped exercises
    
    # User preferences
    include_in_stats: bool = True
    include_in_goals: bool = True
    is_private: bool = False
    
    # Metadata
    tags: List[str] = []
    notes: Optional[str] = Field(None, max_length=500)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "external_activities"
        indexes = [
            [("user_id", 1), ("start_time", -1)],
            [("external_platform", 1), ("external_id", 1)],  # Unique external activity
            [("user_id", 1), ("activity_type", 1)],
            [("sync_status", 1)],
            [("include_in_stats", 1)],
        ]

    def estimate_internal_workout_equivalent(self) -> Optional[str]:
        """Estimate what internal workout type this would be"""
        activity_mapping = {
            "running": "cardio",
            "cycling": "cardio", 
            "swimming": "cardio",
            "weight_training": "strength",
            "yoga": "flexibility",
            "hiking": "cardio",
            "walking": "cardio"
        }
        
        return activity_mapping.get(self.activity_type.lower())
    
    def calculate_intensity_level(self) -> Optional[str]:
        """Calculate intensity level based on heart rate or duration"""
        if self.metrics.average_heart_rate:
            # Rough estimation based on HR zones
            hr = self.metrics.average_heart_rate
            if hr < 120:
                return "low"
            elif hr < 150:
                return "moderate"
            else:
                return "high"
        
        # Fallback to duration-based estimation
        if self.metrics.duration_minutes:
            if self.metrics.duration_minutes < 30:
                return "moderate"  # Short sessions tend to be higher intensity
            elif self.metrics.duration_minutes < 60:
                return "moderate"
            else:
                return "low"  # Very long sessions tend to be lower intensity
        
        return None
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get performance summary for this activity"""
        summary = {
            "activity_type": self.activity_type,
            "duration": self.metrics.duration_minutes,
            "intensity": self.calculate_intensity_level()
        }
        
        # Add relevant metrics based on activity type
        if self.activity_type.lower() in ["running", "cycling", "walking"]:
            if self.metrics.distance_km:
                summary["distance_km"] = self.metrics.distance_km
            if self.metrics.pace_per_km:
                summary["pace"] = self.metrics.pace_per_km
        
        if self.metrics.calories_burned:
            summary["calories_burned"] = self.metrics.calories_burned
        
        return summary
    
    def should_sync_to_goals(self) -> bool:
        """Determine if this activity should contribute to goal progress"""
        return (
            self.include_in_goals and 
            self.sync_status == "synced" and
            self.metrics.duration_minutes and 
            self.metrics.duration_minutes >= 10  # Minimum 10 minutes
        )
    
    def convert_to_internal_format(self) -> Dict[str, Any]:
        """Convert external activity to internal workout format"""
        workout_data = {
            "name": self.name or f"{self.activity_type} - {self.start_time.strftime('%Y-%m-%d')}",
            "date": self.start_time,
            "workout_type": self.estimate_internal_workout_equivalent(),
            "duration_minutes": self.metrics.duration_minutes,
            "notes": f"Imported from {self.external_platform}. {self.description or ''}",
            "is_external": True,
            "external_activity_id": str(self.id)
        }
        
        # Add exercises based on activity type
        exercises = []
        if self.activity_type.lower() == "running":
            exercises.append({
                "name": "Running",
                "sets": [{
                    "duration_minutes": self.metrics.duration_minutes,
                    "distance_km": self.metrics.distance_km,
                    "calories": self.metrics.calories_burned
                }]
            })
        elif self.activity_type.lower() == "cycling":
            exercises.append({
                "name": "Cycling",
                "sets": [{
                    "duration_minutes": self.metrics.duration_minutes,
                    "distance_km": self.metrics.distance_km,
                    "calories": self.metrics.calories_burned
                }]
            })
        
        workout_data["exercises"] = exercises
        return workout_data