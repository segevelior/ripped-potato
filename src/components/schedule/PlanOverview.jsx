import React from "react";
import { Target, Calendar, RotateCcw } from "lucide-react";

export default function PlanOverview({ plan }) {
  const totalSessions = plan.weekly_schedule.filter(item => 
    !['Rest', 'rest'].includes(item.workout_type)
  ).length / plan.cycle_weeks;

  return (
    <div className="apple-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5" style={{color: 'var(--accent)'}} />
            <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>
              {plan.name}
            </h2>
          </div>
          <p className="text-base" style={{color: 'var(--text-secondary)'}}>
            {plan.goal}
          </p>
        </div>
        
        <div className="text-right">
          <div className="flex items-center gap-2 text-sm" style={{color: 'var(--text-secondary)'}}>
            <RotateCcw className="w-4 h-4" />
            {plan.cycle_weeks}-week cycle
          </div>
          <div className="flex items-center gap-2 text-sm mt-1" style={{color: 'var(--text-secondary)'}}>
            <Calendar className="w-4 h-4" />
            {totalSessions} sessions/week
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(plan.discipline_priorities || {})
          .filter(([,priority]) => priority > 0)
          .sort(([,a], [,b]) => b - a)
          .map(([discipline, priority]) => (
            <span 
              key={discipline}
              className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full font-medium"
            >
              {discipline.charAt(0).toUpperCase() + discipline.slice(1)} {priority}%
            </span>
          ))}
      </div>
    </div>
  );
}