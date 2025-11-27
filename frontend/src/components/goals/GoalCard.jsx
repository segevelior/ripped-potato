import React from "react";
import { Target, Trophy, Calendar, ChevronRight, Play, Clock, Eye } from "lucide-react";

const categoryColors = {
  skill: "bg-primary-50 text-primary-500",
  performance: "bg-blue-100 text-blue-800", 
  endurance: "bg-green-100 text-green-800",
  strength: "bg-red-100 text-red-800"
};

const difficultyColors = {
  beginner: "bg-green-100 text-green-800",
  intermediate: "bg-yellow-100 text-yellow-800",
  advanced: "bg-orange-100 text-orange-800",
  elite: "bg-red-100 text-red-800"
};

export default function GoalCard({ goal, userProgress, onView, onStart }) {
  const isStarted = !!userProgress;
  const isCompleted = userProgress?.completed_date;
  
  const getProgressText = () => {
    if (isCompleted) return "Completed! 🎉";
    if (isStarted) return `Level ${userProgress.current_level}`;
    return "Not Started";
  };

  const getDaysSinceStart = () => {
    if (!userProgress?.started_date) return 0;
    return Math.floor((new Date() - new Date(userProgress.started_date)) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {goal.icon && (
            <span className="text-2xl">{goal.icon}</span>
          )}
          <div>
            <h3 className="font-bold text-xl text-gray-900">
              {goal.name}
            </h3>
            <div className="flex gap-2 mt-1">
              <span className={`px-2 py-1 text-xs rounded-full font-medium ${categoryColors[goal.category]}`}>
                {goal.category}
              </span>
              {goal.difficulty_level && (
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${difficultyColors[goal.difficulty_level]}`}>
                  {goal.difficulty_level}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {isCompleted && (
          <Trophy className="w-6 h-6 text-yellow-500" />
        )}
      </div>

      {/* Description */}
      <p className="text-gray-600 text-sm leading-relaxed mb-4">
        {goal.description}
      </p>

      {/* Disciplines */}
      <div className="flex flex-wrap gap-1 mb-4">
        {(goal.discipline || []).map((disc, i) => (
          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
            {disc}
          </span>
        ))}
      </div>

      {/* Progress Info */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">Progress:</span>
          <span className={`font-medium ${isCompleted ? 'text-green-600' : isStarted ? 'text-blue-600' : 'text-gray-500'}`}>
            {getProgressText()}
          </span>
        </div>
        
        {isStarted && !isCompleted && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Training for:</span>
            <span className="font-medium text-gray-700">
              {getDaysSinceStart()} days
            </span>
          </div>
        )}

        {goal.estimated_weeks && !isStarted && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Est. duration:</span>
            <span className="font-medium text-gray-700 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {goal.estimated_weeks} weeks
            </span>
          </div>
        )}
      </div>

      {/* Prerequisites */}
      {goal.prerequisites && goal.prerequisites.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Prerequisites:</p>
          <div className="flex flex-wrap gap-1">
            {goal.prerequisites.map((prereq, i) => (
              <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                {prereq}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        {/* View Details Button (Always Visible) */}
        <button
          onClick={onView}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
        >
          <Eye className="w-4 h-4" />
          View Details
          <ChevronRight className="w-4 h-4" />
        </button>
        
        {/* Conditional Action Button */}
        {isCompleted ? (
          <button
            onClick={onView}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium"
          >
            <Trophy className="w-4 h-4" />
            View Achievement
          </button>
        ) : isStarted ? (
          <button
            onClick={onView}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
          >
            <Target className="w-4 h-4" />
            Continue Training
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
          >
            <Play className="w-4 h-4" />
            Start This Goal
          </button>
        )}
      </div>
    </div>
  );
}