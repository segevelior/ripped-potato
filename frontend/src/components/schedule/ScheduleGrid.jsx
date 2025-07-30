import React from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Mountain, Activity, Heart } from "lucide-react";

const intensityColors = {
  rest: "bg-gray-100",
  recovery: "bg-green-100",
  moderate: "bg-blue-100", 
  high: "bg-orange-100",
  max: "bg-red-100"
};

const intensityTextColors = {
  rest: "text-gray-600",
  recovery: "text-green-700",
  moderate: "text-blue-700",
  high: "text-orange-700", 
  max: "text-red-700"
};

const getWorkoutIcon = (workoutType, discipline) => {
  if (discipline === 'climbing') return Mountain;
  if (discipline === 'strength') return Dumbbell;
  if (discipline === 'mobility') return Heart;
  return Activity;
};

export default function ScheduleGrid({ 
  schedule, 
  currentWeek, 
  totalWeeks, 
  onPrevWeek, 
  onNextWeek,
  disciplines 
}) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="apple-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold" style={{color: 'var(--text-primary)'}}>
          Week {currentWeek} of {totalWeeks}
        </h3>
        
        {totalWeeks > 1 && (
          <div className="flex items-center gap-2">
            <button 
              onClick={onPrevWeek}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" style={{color: 'var(--text-secondary)'}} />
            </button>
            <button 
              onClick={onNextWeek}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" style={{color: 'var(--text-secondary)'}} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {days.map(day => {
          const daySchedule = schedule.find(item => item.day_of_week === day);
          const Icon = daySchedule ? getWorkoutIcon(daySchedule.workout_type, daySchedule.discipline) : Activity;
          
          return (
            <div key={day} className="text-center">
              <div className="text-xs font-medium mb-2" style={{color: 'var(--text-secondary)'}}>
                {day.slice(0, 3)}
              </div>
              
              <div className={`p-4 rounded-lg min-h-[100px] flex flex-col items-center justify-center ${
                daySchedule ? intensityColors[daySchedule.intensity] : 'bg-gray-50'
              }`}>
                {daySchedule ? (
                  <>
                    <Icon className="w-6 h-6 mb-2" style={{color: 'var(--accent)'}} />
                    <div className="text-center">
                      <div className="text-sm font-semibold mb-1" style={{color: 'var(--text-primary)'}}>
                        {daySchedule.workout_type}
                      </div>
                      <div className={`text-xs font-medium ${intensityTextColors[daySchedule.intensity]}`}>
                        {daySchedule.intensity.charAt(0).toUpperCase() + daySchedule.intensity.slice(1)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                    Rest
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}