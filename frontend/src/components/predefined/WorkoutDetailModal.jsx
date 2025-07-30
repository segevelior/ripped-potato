import React, { useState } from "react";
import { X, Clock, Target, Calendar, Copy, ChevronDown, ChevronUp, Dumbbell, Zap, Users, Timer } from "lucide-react";

const intensityColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800", 
  high: "bg-orange-100 text-orange-800",
  max: "bg-red-100 text-red-800"
};

const disciplineIcons = {
  strength: Dumbbell,
  climbing: Target,
  running: Zap,
  cycling: Users,
  mobility: Timer,
  calisthenics: Users
};

export default function WorkoutDetailModal({ workout, exercises, onClose, onApply, onDuplicate }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedBlocks, setExpandedBlocks] = useState(new Set([0])); // First block expanded by default

  const toggleBlock = (blockIndex) => {
    const newExpanded = new Set(expandedBlocks);
    if (newExpanded.has(blockIndex)) {
      newExpanded.delete(blockIndex);
    } else {
      newExpanded.add(blockIndex);
    }
    setExpandedBlocks(newExpanded);
  };

  const getExerciseDetails = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId);
  };

  const totalExercises = workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3 text-gray-900">
                {workout.name}
              </h2>
              <p className="text-lg text-gray-700 mb-4 leading-relaxed">
                {workout.goal}
              </p>
              
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">{workout.estimated_duration || 60} minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  <span className="font-medium">{workout.blocks.length} blocks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-5 h-5" />
                  <span className="font-medium">{totalExercises} exercises</span>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  workout.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                  workout.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {workout.difficulty_level}
                </div>
              </div>

              {/* Discipline Tags */}
              <div className="flex flex-wrap gap-2 mt-4">
                {(workout.primary_disciplines || []).map((discipline, index) => {
                  const IconComponent = disciplineIcons[discipline] || Dumbbell;
                  return (
                    <span key={index} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 text-sm rounded-full font-medium">
                      <IconComponent className="w-4 h-4" />
                      {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                    </span>
                  );
                })}
              </div>
            </div>
            
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/50 transition-colors">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Workout Blocks */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
          <div className="space-y-4">
            {workout.blocks.map((block, blockIndex) => {
              const isExpanded = expandedBlocks.has(blockIndex);
              
              return (
                <div key={blockIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleBlock(blockIndex)}
                    className="w-full p-5 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-bold text-xl text-gray-900 mb-1">
                        {block.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {block.duration && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {block.duration}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Target className="w-4 h-4" />
                          {block.exercises.length} exercises
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5">
                      {block.instructions && (
                        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-blue-800 text-sm leading-relaxed">
                            <strong>Instructions:</strong> {block.instructions}
                          </p>
                        </div>
                      )}
                      
                      <div className="space-y-3">
                        {block.exercises.map((exercise, exerciseIndex) => {
                          const exerciseDetails = getExerciseDetails(exercise.exercise_id);
                          
                          return (
                            <div key={exerciseIndex} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                              <div className="flex items-start justify-between mb-3">
                                <h4 className="font-bold text-lg text-gray-900">
                                  {exercise.exercise_name}
                                </h4>
                                <div className="text-right">
                                  <div className="font-bold text-blue-600 text-lg">
                                    {exercise.volume || '3x8'}
                                  </div>
                                  {exercise.rest && (
                                    <div className="text-sm text-gray-500">
                                      Rest: {exercise.rest}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Exercise Schema Data */}
                              {exerciseDetails && (
                                <div className="mb-3">
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {/* Disciplines */}
                                    {(exerciseDetails.discipline || []).map((disc, i) => (
                                      <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                        {disc}
                                      </span>
                                    ))}
                                    
                                    {/* Muscles */}
                                    {(exerciseDetails.muscles || []).slice(0, 3).map((muscle, i) => (
                                      <span key={i} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                        {muscle}
                                      </span>
                                    ))}
                                    
                                    {/* Equipment */}
                                    {(exerciseDetails.equipment || []).slice(0, 2).map((eq, i) => (
                                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                                        {eq}
                                      </span>
                                    ))}
                                    
                                    {/* Intensity */}
                                    {exerciseDetails.strain?.intensity && (
                                      <span className={`px-2 py-1 text-xs rounded-full ${intensityColors[exerciseDetails.strain.intensity]}`}>
                                        {exerciseDetails.strain.intensity}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Load and Duration Type */}
                                  <div className="flex gap-4 text-xs text-gray-600">
                                    {exerciseDetails.strain?.load && (
                                      <span>Load: <strong>{exerciseDetails.strain.load}</strong></span>
                                    )}
                                    {exerciseDetails.strain?.duration_type && (
                                      <span>Type: <strong>{exerciseDetails.strain.duration_type}</strong></span>
                                    )}
                                    {exerciseDetails.strain?.typical_volume && (
                                      <span>Typical: <strong>{exerciseDetails.strain.typical_volume}</strong></span>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Exercise Notes */}
                              {exercise.notes && (
                                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                  <p className="text-yellow-800 text-sm">
                                    <strong>Notes:</strong> {exercise.notes}
                                  </p>
                                </div>
                              )}
                              
                              {/* Exercise Description */}
                              {exerciseDetails?.description && (
                                <div className="mt-2 text-sm text-gray-600 italic">
                                  {exerciseDetails.description}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-2 text-gray-700">
                Apply to Calendar Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => onDuplicate(workout)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
              
              <button
                onClick={() => onApply(workout, selectedDate)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Apply to Calendar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}