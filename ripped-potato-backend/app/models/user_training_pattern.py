from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class TrainingSession(BaseModel):
    """Individual training session data"""
    date: datetime
    workout_id: Optional[PydanticObjectId] = None
    duration_minutes: Optional[int] = None
    workout_type: Optional[str] = None
    intensity_rating: Optional[float] = Field(None, ge=1.0, le=10.0)
    exercises_count: Optional[int] = None
    total_volume: Optional[float] = None  # Total weight moved
    calories_burned: Optional[float] = None
    

class UserTrainingPattern(Document):
    """Behavioral analysis of user training patterns"""
    user_id: PydanticObjectId
    
    # Analysis period
    analysis_start_date: datetime
    analysis_end_date: datetime
    total_analysis_days: int
    
    # Basic training statistics
    total_sessions: int = Field(default=0, ge=0)
    average_sessions_per_week: float = Field(default=0.0, ge=0.0)
    longest_streak_days: int = Field(default=0, ge=0)
    current_streak_days: int = Field(default=0, ge=0)
    
    # Timing patterns
    preferred_workout_days: List[str] = []  # ["monday", "wednesday", "friday"]
    preferred_workout_times: List[str] = []  # ["morning", "evening"]
    most_active_hour: Optional[int] = Field(None, ge=0, le=23)
    
    # Workout preferences
    preferred_workout_types: List[str] = []
    average_workout_duration_minutes: Optional[float] = None
    preferred_intensity_level: Optional[str] = None  # "low", "moderate", "high"
    
    # Consistency metrics
    consistency_score: float = Field(default=0.0, ge=0.0, le=1.0)
    adherence_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    dropout_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    
    # Performance trends
    volume_trend: Optional[str] = None  # "increasing", "decreasing", "stable"
    intensity_trend: Optional[str] = None
    duration_trend: Optional[str] = None
    
    # Raw session data for analysis
    sessions: List[TrainingSession] = []
    
    # Last analysis update
    last_analyzed: datetime = Field(default_factory=datetime.utcnow)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_training_patterns"
        indexes = [
            [("user_id", 1)],
            [("analysis_end_date", -1)],
            [("consistency_score", -1)],
            [("dropout_risk_score", -1)],
        ]

    def analyze_patterns(self):
        """Analyze training patterns from session data"""
        if not self.sessions:
            return
        
        # Sort sessions by date
        sorted_sessions = sorted(self.sessions, key=lambda x: x.date)
        
        # Calculate basic stats
        self.total_sessions = len(sorted_sessions)
        
        # Calculate streaks
        self._calculate_streaks(sorted_sessions)
        
        # Analyze timing patterns
        self._analyze_timing_patterns(sorted_sessions)
        
        # Analyze workout preferences
        self._analyze_workout_preferences(sorted_sessions)
        
        # Calculate consistency metrics
        self._calculate_consistency_metrics(sorted_sessions)
        
        # Analyze trends
        self._analyze_trends(sorted_sessions)
        
        self.last_analyzed = datetime.utcnow()
    
    def _calculate_streaks(self, sessions: List[TrainingSession]):
        """Calculate workout streaks"""
        if not sessions:
            return
        
        dates = [session.date.date() for session in sessions]
        unique_dates = sorted(set(dates))
        
        # Calculate longest streak
        longest_streak = 0
        current_streak = 1
        
        for i in range(1, len(unique_dates)):
            if (unique_dates[i] - unique_dates[i-1]).days == 1:
                current_streak += 1
            else:
                longest_streak = max(longest_streak, current_streak)
                current_streak = 1
        
        self.longest_streak_days = max(longest_streak, current_streak)
        
        # Calculate current streak
        today = datetime.now().date()
        current_streak_days = 0
        
        for date in reversed(unique_dates):
            if (today - date).days == current_streak_days:
                current_streak_days += 1
            else:
                break
        
        self.current_streak_days = current_streak_days
    
    def _analyze_timing_patterns(self, sessions: List[TrainingSession]):
        """Analyze when user prefers to work out"""
        if not sessions:
            return
        
        # Analyze days of week
        day_counts = {}
        hour_counts = {}
        
        for session in sessions:
            day_name = session.date.strftime("%A").lower()
            hour = session.date.hour
            
            day_counts[day_name] = day_counts.get(day_name, 0) + 1
            hour_counts[hour] = hour_counts.get(hour, 0) + 1
        
        # Get preferred days (top 50% by frequency)
        total_sessions = len(sessions)
        self.preferred_workout_days = [
            day for day, count in day_counts.items()
            if count >= total_sessions * 0.15  # At least 15% of workouts
        ]
        
        # Determine preferred times
        if hour_counts:
            self.most_active_hour = max(hour_counts, key=hour_counts.get)
            
            # Categorize time preferences
            morning_hours = sum(hour_counts.get(h, 0) for h in range(5, 12))
            afternoon_hours = sum(hour_counts.get(h, 0) for h in range(12, 17))
            evening_hours = sum(hour_counts.get(h, 0) for h in range(17, 22))
            
            time_preferences = []
            if morning_hours >= total_sessions * 0.3:
                time_preferences.append("morning")
            if afternoon_hours >= total_sessions * 0.3:
                time_preferences.append("afternoon")
            if evening_hours >= total_sessions * 0.3:
                time_preferences.append("evening")
            
            self.preferred_workout_times = time_preferences
    
    def _analyze_workout_preferences(self, sessions: List[TrainingSession]):
        """Analyze workout type and duration preferences"""
        if not sessions:
            return
        
        # Workout types
        type_counts = {}
        durations = []
        intensities = []
        
        for session in sessions:
            if session.workout_type:
                type_counts[session.workout_type] = type_counts.get(session.workout_type, 0) + 1
            
            if session.duration_minutes:
                durations.append(session.duration_minutes)
            
            if session.intensity_rating:
                intensities.append(session.intensity_rating)
        
        # Preferred workout types (top 3)
        self.preferred_workout_types = [
            workout_type for workout_type, _ in 
            sorted(type_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        ]
        
        # Average duration
        if durations:
            self.average_workout_duration_minutes = sum(durations) / len(durations)
        
        # Preferred intensity
        if intensities:
            avg_intensity = sum(intensities) / len(intensities)
            if avg_intensity < 4:
                self.preferred_intensity_level = "low"
            elif avg_intensity < 7:
                self.preferred_intensity_level = "moderate"
            else:
                self.preferred_intensity_level = "high"
    
    def _calculate_consistency_metrics(self, sessions: List[TrainingSession]):
        """Calculate consistency and adherence metrics"""
        if not sessions or self.total_analysis_days == 0:
            return
        
        # Sessions per week
        self.average_sessions_per_week = (self.total_sessions / self.total_analysis_days) * 7
        
        # Consistency score based on regularity
        if self.total_sessions >= 4:  # Need minimum data
            dates = [session.date.date() for session in sessions]
            unique_dates = sorted(set(dates))
            
            # Calculate intervals between workouts
            intervals = []
            for i in range(1, len(unique_dates)):
                interval = (unique_dates[i] - unique_dates[i-1]).days
                intervals.append(interval)
            
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
                coefficient_of_variation = (variance ** 0.5) / avg_interval if avg_interval > 0 else 1
                
                # Lower CV = higher consistency
                self.consistency_score = max(0.0, 1.0 - coefficient_of_variation)
        
        # Calculate adherence rate (sessions vs expected)
        expected_sessions = self.total_analysis_days / 2  # Assume 3-4 sessions per week target
        self.adherence_rate = min(100.0, (self.total_sessions / expected_sessions) * 100) if expected_sessions > 0 else 0.0
        
        # Dropout risk score
        days_since_last = (datetime.now() - sessions[-1].date).days if sessions else 30
        recent_activity = len([s for s in sessions if (datetime.now() - s.date).days <= 14])
        
        risk_factors = [
            days_since_last > 7,  # More than a week since last workout
            self.consistency_score < 0.5,  # Low consistency
            recent_activity < 2,  # Less than 2 workouts in last 2 weeks
            self.current_streak_days == 0  # No current streak
        ]
        
        self.dropout_risk_score = sum(risk_factors) / len(risk_factors)
    
    def _analyze_trends(self, sessions: List[TrainingSession]):
        """Analyze performance trends over time"""
        if len(sessions) < 6:  # Need minimum data for trend analysis
            return
        
        # Split sessions into first and second half
        mid_point = len(sessions) // 2
        first_half = sessions[:mid_point]
        second_half = sessions[mid_point:]
        
        # Volume trend
        first_half_volume = [s.total_volume for s in first_half if s.total_volume]
        second_half_volume = [s.total_volume for s in second_half if s.total_volume]
        
        if first_half_volume and second_half_volume:
            avg_first_volume = sum(first_half_volume) / len(first_half_volume)
            avg_second_volume = sum(second_half_volume) / len(second_half_volume)
            
            if avg_second_volume > avg_first_volume * 1.1:
                self.volume_trend = "increasing"
            elif avg_second_volume < avg_first_volume * 0.9:
                self.volume_trend = "decreasing"
            else:
                self.volume_trend = "stable"
        
        # Similar analysis for intensity and duration trends...
    
    def add_session(self, session_data: Dict[str, Any]):
        """Add a new training session"""
        session = TrainingSession(**session_data)
        self.sessions.append(session)
        
        # Re-analyze patterns
        self.analyze_patterns()
        self.updated_at = datetime.utcnow()
    
    def get_insights(self) -> Dict[str, Any]:
        """Get behavioral insights"""
        return {
            "activity_level": "high" if self.average_sessions_per_week > 4 else "moderate" if self.average_sessions_per_week > 2 else "low",
            "consistency": "high" if self.consistency_score > 0.7 else "moderate" if self.consistency_score > 0.4 else "low",
            "dropout_risk": "high" if self.dropout_risk_score > 0.6 else "moderate" if self.dropout_risk_score > 0.3 else "low",
            "preferred_schedule": {
                "days": self.preferred_workout_days,
                "times": self.preferred_workout_times
            },
            "workout_preferences": {
                "types": self.preferred_workout_types,
                "duration": self.average_workout_duration_minutes,
                "intensity": self.preferred_intensity_level
            },
            "streaks": {
                "current": self.current_streak_days,
                "longest": self.longest_streak_days
            }
        }