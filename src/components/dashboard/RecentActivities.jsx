
import React from "react";
import { format, parseISO, isValid } from "date-fns";
import { Dumbbell, Mountain, Activity, Clock } from "lucide-react";

export default function RecentActivities({ workouts, activities, isLoading }) {
  const allActivities = [
    ...workouts.map(w => ({ ...w, type: 'workout', icon: Dumbbell })),
    ...activities.map(a => ({ ...a, icon: a.type === 'climbing' ? Mountain : Activity }))
  ]
    .filter(item => item.date && isValid(parseISO(item.date))) // Filter out items without a date or invalid dates
    .sort((a, b) => parseISO(b.date) - parseISO(a.date))
    .slice(0, 8);

  return (
    <div className="apple-card p-6">
      <h2 className="text-xl font-bold mb-6" style={{color: 'var(--text-primary)'}}>
        Recent Activities
      </h2>
      
      {isLoading ? (
        <div className="space-y-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="bg-gray-100 p-4 animate-pulse rounded-lg">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : allActivities.length > 0 ? (
        <div className="space-y-3">
          {allActivities.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <div key={index} className="bg-gray-50 p-3 rounded-lg transition-all duration-200 hover:bg-gray-100">
                <div className="flex items-center gap-4">
                  <div className="bg-white p-2 rounded-md flex-shrink-0 shadow-sm">
                    <IconComponent className="w-5 h-5" style={{color: 'var(--accent)'}} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" style={{color: 'var(--text-primary)'}}>
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs" style={{color: 'var(--text-secondary)'}}>
                      <span>{item.date && isValid(parseISO(item.date)) ? format(parseISO(item.date), 'EEEE, MMM d') : 'No Date'}</span>
                    </div>
                  </div>
                   {(item.total_strain || item.strain_rating) && (
                      <span className="font-bold text-lg" style={{color:'var(--text-primary)'}}>
                        {(item.total_strain || item.strain_rating).toFixed(0)}
                      </span>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-gray-100">
            <Activity className="w-8 h-8" style={{color: 'var(--text-secondary)'}} />
          </div>
          <p style={{color: 'var(--text-secondary)'}}>Log a workout to get started</p>
        </div>
      )}
    </div>
  );
}
