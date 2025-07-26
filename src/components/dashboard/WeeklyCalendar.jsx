import React from "react";
import { format, addDays, parseISO, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Dumbbell, Mountain, Activity } from "lucide-react";
import StrainMeter from "./StrainMeter";

export default function WeeklyCalendar({ workouts, activities, weekStart, onWeekChange, isLoading }) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getDayData = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayWorkouts = workouts.filter(w => w.date === dateStr);
    const dayActivities = activities.filter(a => a.date === dateStr);
    
    const totalStrain = dayWorkouts.reduce((sum, w) => sum + (w.total_strain || 0), 0) +
                      dayActivities.reduce((sum, a) => sum + (a.strain_rating || 0), 0);
    
    return { workouts: dayWorkouts, activities: dayActivities, totalStrain };
  };

  const navigateWeek = (direction) => {
    onWeekChange(addDays(weekStart, direction * 7));
  };

  return (
    <div className="apple-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>Weekly Overview</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigateWeek(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" style={{color: 'var(--text-secondary)'}} />
          </button>
          <span className="px-4 py-2 text-sm font-medium" style={{color: 'var(--text-primary)'}}>
            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button 
            onClick={() => navigateWeek(1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5" style={{color: 'var(--text-secondary)'}} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, index) => {
          const { workouts: dayWorkouts, activities: dayActivities, totalStrain } = getDayData(day);
          const isCurrentDay = isToday(day);

          return (
            <div 
              key={index} 
              className={`bg-gray-50 rounded-lg p-3 min-h-[140px] transition-all duration-200 border ${
                isCurrentDay ? 'border-blue-500' : 'border-transparent'
              }`}
            >
              <div className="text-center mb-2">
                <div className="text-xs font-medium" style={{color: 'var(--text-secondary)'}}>
                  {format(day, 'EEE')}
                </div>
                <div className={`text-sm font-bold ${isCurrentDay ? 'text-accent' : ''}`} style={{color: isCurrentDay ? 'var(--accent)' : 'var(--text-primary)'}}>
                  {format(day, 'd')}
                </div>
              </div>

              {totalStrain > 0 ? (
                <div className="space-y-2">
                  <StrainMeter value={totalStrain} maxValue={30} size="small" />
                  
                  <div className="space-y-1">
                    {dayWorkouts.map((workout, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-1 bg-white rounded shadow-sm">
                        <Dumbbell className="w-3 h-3" style={{color: 'var(--accent)'}} />
                        <span className="text-xs truncate" style={{color: 'var(--text-secondary)'}}>
                          {workout.title}
                        </span>
                      </div>
                    ))}
                    {dayActivities.map((activity, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-1 bg-white rounded shadow-sm">
                        {activity.type === 'climbing' ? (
                          <Mountain className="w-3 h-3 text-orange-500" />
                        ) : (
                          <Activity className="w-3 h-3 text-green-500" />
                        )}
                        <span className="text-xs truncate" style={{color: 'var(--text-secondary)'}}>
                          {activity.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : isLoading ? (
                <div className="w-full h-24 bg-gray-200 animate-pulse rounded-md"></div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}