import React, { useState, useRef, useEffect } from "react";
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
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const scrollContainerRef = useRef(null);

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

  const handleScroll = (e) => {
    const scrollTop = e.target.scrollTop;
    setIsHeaderCollapsed(scrollTop > 50);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center md:p-4 z-[100]">
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-5xl h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div
          className={`
            bg-white border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0 transition-all duration-300 ease-in-out z-10
            ${isHeaderCollapsed ? 'py-2 px-4' : 'p-4 md:p-6'}
          `}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2
                className={`
                  font-bold text-gray-900 leading-tight transition-all duration-300
                  ${isHeaderCollapsed ? 'text-lg mb-0' : 'text-xl md:text-3xl mb-2'}
                `}
              >
                {workout.name}
              </h2>

              <div
                className={`
                  transition-all duration-300 overflow-hidden
                  ${isHeaderCollapsed ? 'h-0 opacity-0' : 'h-auto opacity-100'}
                `}
              >
                <p className="text-sm md:text-lg text-gray-700 mb-3 leading-relaxed line-clamp-3 md:line-clamp-none">
                  {workout.goal}
                </p>

                <div className="flex flex-wrap items-center gap-3 md:gap-6 text-xs md:text-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">{workout.estimated_duration || 60}m</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Target className="w-4 h-4" />
                    <span className="font-medium">{workout.blocks.length} blocks</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Dumbbell className="w-4 h-4" />
                    <span className="font-medium">{totalExercises} exercises</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${workout.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                    workout.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                    {workout.difficulty_level}
                  </div>
                </div>

                {/* Discipline Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(workout.primary_disciplines || []).map((discipline, index) => {
                    const IconComponent = disciplineIcons[discipline] || Dumbbell;
                    return (
                      <span key={index} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                        <IconComponent className="w-3 h-3" />
                        {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="p-2 -mr-2 rounded-xl hover:bg-white/50 transition-colors shrink-0">
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Workout Blocks */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50 scroll-smooth"
        >
          <div className="space-y-3 md:space-y-4 pb-4">
            {workout.blocks.map((block, blockIndex) => {
              const isExpanded = expandedBlocks.has(blockIndex);

              return (
                <div key={blockIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleBlock(blockIndex)}
                    className="w-full p-4 md:p-5 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <h3 className="font-bold text-lg md:text-xl text-gray-900 mb-1 truncate">
                        {block.name}
                      </h3>
                      <div className="flex items-center gap-3 text-xs md:text-sm text-gray-600">
                        {block.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 md:w-4 md:h-4" />
                            {block.duration}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3 md:w-4 md:h-4" />
                          {block.exercises.length} exercises
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden md:inline px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
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
                    <div className="px-4 pb-4 md:px-5 md:pb-5">
                      {block.instructions && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-blue-800 text-xs md:text-sm leading-relaxed">
                            <strong>Instructions:</strong> {block.instructions}
                          </p>
                        </div>
                      )}

                      <div className="space-y-2 md:space-y-3">
                        {block.exercises.map((exercise, exerciseIndex) => {
                          const exerciseDetails = getExerciseDetails(exercise.exercise_id);

                          return (
                            <div key={exerciseIndex} className="bg-gray-50 rounded-lg p-3 md:p-4 hover:bg-gray-100 transition-colors">
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-bold text-sm md:text-lg text-gray-900 leading-tight pr-2">
                                  {exercise.exercise_name}
                                </h4>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-blue-600 text-sm md:text-lg">
                                    {exercise.volume || '3x8'}
                                  </div>
                                  {exercise.rest && (
                                    <div className="text-xs text-gray-500">
                                      Rest: {exercise.rest}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Exercise Schema Data */}
                              {exerciseDetails && (
                                <div className="mb-2">
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {/* Disciplines */}
                                    {(exerciseDetails.discipline || []).map((disc, i) => (
                                      <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] md:text-xs rounded-full">
                                        {disc}
                                      </span>
                                    ))}

                                    {/* Muscles */}
                                    {(exerciseDetails.muscles || []).slice(0, 3).map((muscle, i) => (
                                      <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] md:text-xs rounded-full">
                                        {muscle}
                                      </span>
                                    ))}

                                    {/* Equipment */}
                                    {(exerciseDetails.equipment || []).slice(0, 2).map((eq, i) => (
                                      <span key={i} className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] md:text-xs rounded-full">
                                        {eq}
                                      </span>
                                    ))}

                                    {/* Intensity */}
                                    {exerciseDetails.strain?.intensity && (
                                      <span className={`px-1.5 py-0.5 text-[10px] md:text-xs rounded-full ${intensityColors[exerciseDetails.strain.intensity]}`}>
                                        {exerciseDetails.strain.intensity}
                                      </span>
                                    )}
                                  </div>

                                  {/* Load and Duration Type */}
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] md:text-xs text-gray-600">
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
                                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                                  <p className="text-yellow-800 text-xs md:text-sm">
                                    <strong>Notes:</strong> {exercise.notes}
                                  </p>
                                </div>
                              )}

                              {/* Exercise Description */}
                              {exerciseDetails?.description && (
                                <div className="mt-1.5 text-xs md:text-sm text-gray-600 italic line-clamp-2">
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

        {/* Sticky Footer Actions */}
        <div className="p-4 md:p-6 border-t border-gray-100 bg-white shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
            <div className="flex-1">
              <label className="block text-xs md:text-sm font-semibold mb-1.5 text-gray-700">
                Apply to Calendar Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 md:px-4 md:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div className="flex gap-2 md:gap-3">
              <button
                onClick={() => onDuplicate(workout)}
                className="flex-1 md:flex-none px-4 py-2.5 md:px-6 md:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <Copy className="w-4 h-4" />
                <span className="md:inline">Duplicate</span>
              </button>

              <button
                onClick={() => onApply(workout, selectedDate)}
                className="flex-[2] md:flex-none px-4 py-2.5 md:px-6 md:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 text-sm md:text-base"
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