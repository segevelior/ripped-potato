import React from "react";
import { Clock, Target, Calendar, Copy, Eye, ChevronRight, Edit, Trash2 } from "lucide-react";

export default function WorkoutCard({ workout, onView, onDuplicate, onApply, onEdit, onDelete }) {
  const totalExercises = workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  
  const disciplineColors = {
    strength: "#3b82f6",
    climbing: "#f97316", 
    running: "#10b981",
    cycling: "#8b5cf6",
    calisthenics: "#f59e0b",
    mobility: "#06b6d4"
  };

  const difficultyColors = {
    beginner: "#22c55e",
    intermediate: "#f59e0b",
    advanced: "#ef4444"
  };

  return (
    <div className="apple-card overflow-hidden hover:shadow-lg transition-all duration-200">
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-lg leading-tight" style={{color: 'var(--text-primary)'}}>
            {workout.name}
          </h3>
          <div 
            className="px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: difficultyColors[workout.difficulty_level] || '#6b7280' }}
          >
            {workout.difficulty_level}
          </div>
        </div>

        <p className="text-sm mb-4 line-clamp-3" style={{color: 'var(--text-secondary)'}}>
          {workout.goal}
        </p>

        {/* Disciplines */}
        <div className="flex flex-wrap gap-1 mb-4">
          {(workout.primary_disciplines || []).map((discipline, index) => (
            <span
              key={index}
              className="px-2 py-1 rounded text-xs font-medium text-white"
              style={{ backgroundColor: disciplineColors[discipline] || '#6b7280' }}
            >
              {discipline}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4 text-sm" style={{color: 'var(--text-secondary)'}}>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{workout.estimated_duration || 60}min</span>
          </div>
          <div className="flex items-center gap-1">
            <Target className="w-4 h-4" />
            <span>{workout.blocks.length} blocks</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{totalExercises} exercises</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onView}
            className="apple-button-secondary flex-1 flex items-center justify-center gap-2 text-sm"
          >
            <Eye className="w-4 h-4" />
            View
          </button>
          <button
            onClick={() => onEdit(workout)}
            className="apple-button-secondary flex items-center justify-center gap-2 px-3"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDuplicate}
            className="apple-button-secondary flex items-center justify-center gap-2 px-3"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(workout)}
            className="apple-button-secondary flex items-center justify-center gap-2 px-3 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onApply(new Date().toISOString().split('T')[0])}
            className="apple-button-primary flex items-center justify-center gap-2 px-3"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}