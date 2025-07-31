import React, { useState } from "react";
import { X, Clock, Target, Calendar, Edit, Save } from "lucide-react";

export default function WorkoutDetailModal({ workout, onClose, onSave, onApplyToCalendar }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedWorkout, setEditedWorkout] = useState(workout);

  const handleSave = () => {
    onSave(editedWorkout);
    setIsEditing(false);
  };

  const updateBlock = (blockIndex, field, value) => {
    const newBlocks = [...editedWorkout.blocks];
    newBlocks[blockIndex] = { ...newBlocks[blockIndex], [field]: value };
    setEditedWorkout({ ...editedWorkout, blocks: newBlocks });
  };

  const updateExercise = (blockIndex, exerciseIndex, field, value) => {
    const newBlocks = [...editedWorkout.blocks];
    newBlocks[blockIndex].exercises[exerciseIndex] = {
      ...newBlocks[blockIndex].exercises[exerciseIndex],
      [field]: value
    };
    setEditedWorkout({ ...editedWorkout, blocks: newBlocks });
  };

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'beginner': return 'bg-green-500';
      case 'intermediate': return 'bg-orange-500';
      case 'advanced': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getDisciplineColor = (discipline) => {
    const colors = {
      strength: 'bg-blue-500',
      climbing: 'bg-orange-600',
      running: 'bg-green-500',
      cycling: 'bg-purple-500',
      calisthenics: 'bg-yellow-500',
      mobility: 'bg-cyan-500',
      cardio: 'bg-pink-500',
      hiit: 'bg-red-500'
    };
    return colors[discipline] || 'bg-gray-500';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editedWorkout.name}
                  onChange={(e) => setEditedWorkout({ ...editedWorkout, name: e.target.value })}
                  className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-500 outline-none"
                />
              ) : (
                <h2 className="text-2xl font-bold text-gray-900">{workout.name}</h2>
              )}
              {isEditing ? (
                <textarea
                  value={editedWorkout.goal}
                  onChange={(e) => setEditedWorkout({ ...editedWorkout, goal: e.target.value })}
                  className="mt-2 text-gray-600 w-full border rounded-lg p-2 outline-none"
                  rows="2"
                />
              ) : (
                <p className="mt-2 text-gray-600">{workout.goal}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Meta info */}
          <div className="mt-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">{workout.duration_minutes} minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">{workout.blocks?.length || 0} blocks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {workout.blocks?.reduce((sum, block) => sum + (block.exercises?.length || 0), 0) || 0} exercises
              </span>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${getDifficultyColor(workout.difficulty_level)}`}>
              {workout.difficulty_level}
            </span>
          </div>

          {/* Disciplines */}
          {workout.primary_disciplines && (
            <div className="mt-3 flex flex-wrap gap-2">
              {workout.primary_disciplines.map((discipline, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full text-sm font-medium text-white ${getDisciplineColor(discipline)}`}
                >
                  {discipline}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {workout.blocks?.map((block, blockIndex) => (
            <div key={blockIndex} className="mb-6 bg-gray-50 rounded-lg p-4">
              <div className="mb-3">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={block.name}
                      onChange={(e) => updateBlock(blockIndex, 'name', e.target.value)}
                      className="font-semibold text-lg text-gray-900 border-b border-gray-300 outline-none bg-transparent"
                    />
                    <input
                      type="number"
                      value={block.duration_minutes}
                      onChange={(e) => updateBlock(blockIndex, 'duration_minutes', parseInt(e.target.value) || 0)}
                      className="w-16 text-sm border rounded px-2 py-1 outline-none"
                    />
                    <span className="text-sm text-gray-600">min</span>
                  </div>
                ) : (
                  <h3 className="font-semibold text-lg text-gray-900">
                    {block.name} <span className="text-sm text-gray-500">({block.duration_minutes} min)</span>
                  </h3>
                )}
              </div>
              
              <div className="space-y-2">
                {block.exercises?.map((exercise, exIndex) => (
                  <div key={exIndex} className="bg-white rounded-lg p-3 border border-gray-200">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={exercise.exercise_name}
                            onChange={(e) => updateExercise(blockIndex, exIndex, 'exercise_name', e.target.value)}
                            className="font-medium flex-1 border-b border-gray-300 outline-none"
                          />
                          <input
                            type="text"
                            value={exercise.volume}
                            onChange={(e) => updateExercise(blockIndex, exIndex, 'volume', e.target.value)}
                            className="w-24 text-sm border rounded px-2 py-1 outline-none"
                            placeholder="e.g., 3x10"
                          />
                        </div>
                        <input
                          type="text"
                          value={exercise.notes || ''}
                          onChange={(e) => updateExercise(blockIndex, exIndex, 'notes', e.target.value)}
                          className="w-full text-sm text-gray-600 border rounded px-2 py-1 outline-none"
                          placeholder="Notes..."
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{exercise.exercise_name}</span>
                          <span className="text-sm text-gray-600">{exercise.volume}</span>
                        </div>
                        {exercise.notes && (
                          <p className="text-sm text-gray-500 mt-1">{exercise.notes}</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onApplyToCalendar && (
                <button
                  onClick={() => onApplyToCalendar(new Date().toISOString().split('T')[0])}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Apply to Calendar
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  Edit Workout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}