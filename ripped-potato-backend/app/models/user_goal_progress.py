from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Union
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class ProgressMeasurement(BaseModel):
    """Individual progress measurement"""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    value: float
    unit: str
    measurement_type: str = Field(..., regex="^(actual|estimated|calculated|user_reported)$")
    
    # Context information
    workout_id: Optional[PydanticObjectId] = None
    exercise_id: Optional[PydanticObjectId] = None
    notes: Optional[str] = Field(None, max_length=500)
    
    # Measurement metadata
    confidence_level: float = Field(default=1.0, ge=0.0, le=1.0)  # How confident we are in this measurement
    measurement_method: Optional[str] = None  # "manual_entry", "calculated", "device_measured"
    tags: List[str] = []
    
    # Environmental factors
    conditions: Optional[Dict[str, Any]] = None  # {"fatigue_level": "low", "time_of_day": "morning"}


class ProgressMilestone(BaseModel):
    """Significant milestones in goal progress"""
    milestone_id: str = Field(...)  # Unique identifier for the milestone
    name: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    
    # Achievement criteria
    target_value: float
    target_unit: str
    achieved_value: Optional[float] = None
    achieved_date: Optional[datetime] = None
    
    # Milestone metadata
    is_achieved: bool = False
    achievement_method: Optional[str] = None  # How it was achieved
    celebration_notes: Optional[str] = None
    difficulty_rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    
    # Progress tracking
    progress_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    estimated_achievement_date: Optional[datetime] = None


class ProgressTrend(BaseModel):
    """Calculated trend analysis"""
    period_start: datetime
    period_end: datetime
    
    # Trend metrics
    trend_direction: str = Field(..., regex="^(increasing|decreasing|stable|volatile)$")
    trend_strength: float = Field(..., ge=0.0, le=1.0)  # How strong the trend is
    rate_of_change: float  # Units per day/week
    rate_of_change_unit: str  # "per_day", "per_week", "per_month"
    
    # Statistical analysis
    average_value: float
    min_value: float
    max_value: float
    standard_deviation: float
    correlation_coefficient: Optional[float] = None  # If correlated with time
    
    # Confidence and reliability
    data_points_count: int
    reliability_score: float = Field(..., ge=0.0, le=1.0)
    trend_confidence: float = Field(..., ge=0.0, le=1.0)


class UserGoalProgress(Document):
    """Detailed goal progress tracking for users"""
    user_id: PydanticObjectId
    goal_id: PydanticObjectId
    
    # Basic progress info
    goal_name: str = Field(..., max_length=200)  # Denormalized for quick access
    goal_type: str
    
    # Current status
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    starting_value: Optional[float] = None
    unit: Optional[str] = None
    
    # Progress calculations
    progress_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    absolute_progress: Optional[float] = None  # current - starting
    remaining_progress: Optional[float] = None  # target - current
    
    # Time tracking
    start_date: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    target_completion_date: Optional[datetime] = None
    estimated_completion_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    
    # Progress measurements history
    measurements: List[ProgressMeasurement] = []
    milestones: List[ProgressMilestone] = []
    
    # Trend analysis
    current_trend: Optional[ProgressTrend] = None
    historical_trends: List[ProgressTrend] = []
    
    # Goal analytics
    total_measurements: int = Field(default=0, ge=0)
    measurement_frequency_days: Optional[float] = None  # Average days between measurements
    consistency_score: float = Field(default=0.0, ge=0.0, le=1.0)  # How consistently user tracks
    
    # Performance metrics
    velocity: Optional[float] = None  # Rate of progress (units per day)
    acceleration: Optional[float] = None  # Change in velocity
    efficiency_score: Optional[float] = Field(None, ge=0.0, le=1.0)  # How efficiently progressing
    
    # Predictive analytics
    predicted_completion_date: Optional[datetime] = None
    confidence_in_prediction: Optional[float] = Field(None, ge=0.0, le=1.0)
    risk_factors: List[str] = []  # Identified risks to goal completion
    
    # Status and flags
    is_active: bool = True
    is_completed: bool = False
    is_on_track: bool = True
    requires_attention: bool = False
    
    # Metadata
    notes: Optional[str] = Field(None, max_length=1000)
    tags: List[str] = []
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_goal_progress"
        indexes = [
            [("user_id", 1), ("goal_id", 1)],  # Unique constraint
            [("user_id", 1), ("is_active", 1), ("last_updated", -1)],
            [("user_id", 1), ("goal_type", 1)],
            [("user_id", 1), ("is_completed", 1)],
            [("user_id", 1), ("requires_attention", 1)],
            [("target_completion_date", 1)],
            [("predicted_completion_date", 1)],
            [("progress_percentage", -1)],
        ]

    def add_measurement(
        self, 
        value: float, 
        unit: str, 
        measurement_type: str = "user_reported",
        workout_id: Optional[PydanticObjectId] = None,
        exercise_id: Optional[PydanticObjectId] = None,
        notes: Optional[str] = None,
        conditions: Optional[Dict[str, Any]] = None
    ) -> ProgressMeasurement:
        """Add a new progress measurement"""
        measurement = ProgressMeasurement(
            value=value,
            unit=unit,
            measurement_type=measurement_type,
            workout_id=workout_id,
            exercise_id=exercise_id,
            notes=notes,
            conditions=conditions
        )
        
        self.measurements.append(measurement)
        self.total_measurements += 1
        self.current_value = value
        self.last_updated = datetime.utcnow()
        
        # Recalculate progress
        self.calculate_progress()
        self.update_trend_analysis()
        self.calculate_velocity()
        
        return measurement

    def calculate_progress(self) -> float:
        """Calculate progress percentage"""
        if not all([self.target_value, self.current_value, self.starting_value]):
            return 0.0
        
        total_distance = abs(self.target_value - self.starting_value)
        if total_distance == 0:
            self.progress_percentage = 100.0 if self.current_value == self.target_value else 0.0
        else:
            current_distance = abs(self.current_value - self.starting_value)
            self.progress_percentage = min(100.0, (current_distance / total_distance) * 100)
        
        # Update derived values
        self.absolute_progress = self.current_value - self.starting_value
        self.remaining_progress = self.target_value - self.current_value
        
        # Check completion
        if self.progress_percentage >= 100.0 and not self.is_completed:
            self.is_completed = True
            self.actual_completion_date = datetime.utcnow()
        
        return self.progress_percentage

    def update_trend_analysis(self, days_back: int = 30):
        """Update trend analysis based on recent measurements"""
        if len(self.measurements) < 2:
            return
        
        # Get recent measurements
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        recent_measurements = [
            m for m in self.measurements 
            if m.timestamp >= cutoff_date
        ]
        
        if len(recent_measurements) < 2:
            return
        
        # Sort by timestamp
        recent_measurements.sort(key=lambda x: x.timestamp)
        
        # Calculate trend metrics
        values = [m.value for m in recent_measurements]
        timestamps = [m.timestamp for m in recent_measurements]
        
        # Basic statistics
        avg_value = sum(values) / len(values)
        min_value = min(values)
        max_value = max(values)
        
        # Standard deviation
        variance = sum((v - avg_value) ** 2 for v in values) / len(values)
        std_dev = variance ** 0.5
        
        # Trend direction and strength
        first_value = values[0]
        last_value = values[-1]
        
        if last_value > first_value * 1.05:  # 5% increase threshold
            trend_direction = "increasing"
        elif last_value < first_value * 0.95:  # 5% decrease threshold
            trend_direction = "decreasing"
        else:
            trend_direction = "stable"
        
        # Rate of change (per day)
        time_diff = (timestamps[-1] - timestamps[0]).days
        if time_diff > 0:
            rate_of_change = (last_value - first_value) / time_diff
        else:
            rate_of_change = 0.0
        
        # Trend strength (simplified)
        if std_dev > 0:
            trend_strength = min(1.0, abs(last_value - first_value) / (2 * std_dev))
        else:
            trend_strength = 1.0 if trend_direction != "stable" else 0.0
        
        # Create trend object
        trend = ProgressTrend(
            period_start=timestamps[0],
            period_end=timestamps[-1],
            trend_direction=trend_direction,
            trend_strength=trend_strength,
            rate_of_change=rate_of_change,
            rate_of_change_unit="per_day",
            average_value=avg_value,
            min_value=min_value,
            max_value=max_value,
            standard_deviation=std_dev,
            data_points_count=len(recent_measurements),
            reliability_score=min(1.0, len(recent_measurements) / 10.0),  # More data = more reliable
            trend_confidence=trend_strength
        )
        
        self.current_trend = trend

    def calculate_velocity(self):
        """Calculate current velocity and acceleration"""
        if len(self.measurements) < 2:
            return
        
        # Sort measurements by timestamp
        sorted_measurements = sorted(self.measurements, key=lambda x: x.timestamp)
        
        # Calculate velocity (recent trend)
        if len(sorted_measurements) >= 2:
            recent = sorted_measurements[-2:]
            time_diff = (recent[1].timestamp - recent[0].timestamp).days
            if time_diff > 0:
                self.velocity = (recent[1].value - recent[0].value) / time_diff
        
        # Calculate acceleration (change in velocity)
        if len(sorted_measurements) >= 3:
            # Compare velocity between first half and second half of recent measurements
            mid_point = len(sorted_measurements) // 2
            first_half = sorted_measurements[:mid_point]
            second_half = sorted_measurements[mid_point:]
            
            if len(first_half) >= 2 and len(second_half) >= 2:
                # Velocity of first half
                time_diff_1 = (first_half[-1].timestamp - first_half[0].timestamp).days
                vel_1 = (first_half[-1].value - first_half[0].value) / time_diff_1 if time_diff_1 > 0 else 0
                
                # Velocity of second half
                time_diff_2 = (second_half[-1].timestamp - second_half[0].timestamp).days
                vel_2 = (second_half[-1].value - second_half[0].value) / time_diff_2 if time_diff_2 > 0 else 0
                
                self.acceleration = vel_2 - vel_1

    def predict_completion_date(self) -> Optional[datetime]:
        """Predict when goal will be completed based on current trend"""
        if not all([self.current_value, self.target_value, self.velocity]) or self.velocity <= 0:
            return None
        
        remaining = abs(self.target_value - self.current_value)
        days_remaining = remaining / self.velocity
        
        # Add some uncertainty based on trend reliability
        if self.current_trend:
            uncertainty_factor = 1.0 + (1.0 - self.current_trend.reliability_score)
            days_remaining *= uncertainty_factor
        
        self.predicted_completion_date = datetime.utcnow() + timedelta(days=int(days_remaining))
        self.confidence_in_prediction = self.current_trend.trend_confidence if self.current_trend else 0.5
        
        return self.predicted_completion_date

    def check_if_on_track(self) -> bool:
        """Check if goal progress is on track"""
        if not self.target_completion_date:
            return True  # No deadline, so always on track
        
        if self.is_completed:
            return True
        
        # Calculate expected progress based on time elapsed
        total_duration = (self.target_completion_date - self.start_date).days
        elapsed_duration = (datetime.utcnow() - self.start_date).days
        
        if total_duration <= 0:
            return False
        
        expected_progress = (elapsed_duration / total_duration) * 100
        tolerance = 10.0  # 10% tolerance
        
        self.is_on_track = (self.progress_percentage + tolerance) >= expected_progress
        return self.is_on_track

    def calculate_consistency_score(self) -> float:
        """Calculate how consistently the user tracks progress"""
        if len(self.measurements) < 2:
            self.consistency_score = 0.0
            return 0.0
        
        # Calculate average time between measurements
        sorted_measurements = sorted(self.measurements, key=lambda x: x.timestamp)
        intervals = []
        
        for i in range(1, len(sorted_measurements)):
            interval = (sorted_measurements[i].timestamp - sorted_measurements[i-1].timestamp).days
            intervals.append(interval)
        
        if intervals:
            avg_interval = sum(intervals) / len(intervals)
            self.measurement_frequency_days = avg_interval
            
            # Consistency score based on regularity (lower variance = higher consistency)
            if len(intervals) > 1:
                variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
                std_dev = variance ** 0.5
                
                # Normalize: perfect consistency = 1.0, high variance = lower score
                if avg_interval > 0:
                    coefficient_of_variation = std_dev / avg_interval
                    self.consistency_score = max(0.0, 1.0 - coefficient_of_variation)
                else:
                    self.consistency_score = 1.0
            else:
                self.consistency_score = 1.0
        
        return self.consistency_score

    def add_milestone(
        self, 
        milestone_id: str, 
        name: str, 
        target_value: float, 
        target_unit: str,
        description: Optional[str] = None
    ) -> ProgressMilestone:
        """Add a new milestone"""
        milestone = ProgressMilestone(
            milestone_id=milestone_id,
            name=name,
            description=description,
            target_value=target_value,
            target_unit=target_unit
        )
        
        self.milestones.append(milestone)
        return milestone

    def check_milestone_achievements(self):
        """Check if any milestones have been achieved"""
        if not self.current_value:
            return
        
        for milestone in self.milestones:
            if not milestone.is_achieved and self.current_value >= milestone.target_value:
                milestone.is_achieved = True
                milestone.achieved_value = self.current_value
                milestone.achieved_date = datetime.utcnow()
                milestone.progress_percentage = 100.0

    def get_recent_measurements(self, days: int = 30) -> List[ProgressMeasurement]:
        """Get measurements from the last N days"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        return [m for m in self.measurements if m.timestamp >= cutoff_date]

    def get_progress_summary(self) -> Dict[str, Any]:
        """Get a comprehensive progress summary"""
        return {
            "current_progress": {
                "percentage": self.progress_percentage,
                "current_value": self.current_value,
                "target_value": self.target_value,
                "remaining": self.remaining_progress
            },
            "timeline": {
                "start_date": self.start_date,
                "target_completion": self.target_completion_date,
                "predicted_completion": self.predicted_completion_date,
                "is_on_track": self.is_on_track
            },
            "measurements": {
                "total_count": self.total_measurements,
                "frequency_days": self.measurement_frequency_days,
                "consistency_score": self.consistency_score
            },
            "performance": {
                "velocity": self.velocity,
                "acceleration": self.acceleration,
                "efficiency_score": self.efficiency_score
            },
            "milestones": {
                "total": len(self.milestones),
                "achieved": len([m for m in self.milestones if m.is_achieved])
            },
            "trend": self.current_trend.model_dump() if self.current_trend else None
        }