import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Clock, Target, Calendar, Copy, ChevronDown, ChevronUp, Dumbbell, Zap, Users, Timer, CalendarPlus, Repeat } from "lucide-react";

const intensityColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  max: "bg-red-100 text-red-800"
};

const intensityBorderColors = {
  low: "border-l-green-500",
  moderate: "border-l-yellow-500",
  high: "border-l-orange-500",
  max: "border-l-red-500"
};

const disciplineIcons = {
  strength: Dumbbell,
  climbing: Target,
  running: Zap,
  cycling: Users,
  mobility: Timer,
  calisthenics: Users
};

// Simple throttle utility
const throttle = (func, limit) => {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};

export default function WorkoutDetailModal({ workout, exercises, onClose, onApply, onDuplicate }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDateModal, setShowDateModal] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState(new Set([0])); // First block expanded by default
  const [expandedExercises, setExpandedExercises] = useState(new Set());
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

  const toggleExercise = (exerciseId) => {
    const newExpanded = new Set(expandedExercises);
    if (newExpanded.has(exerciseId)) {
      newExpanded.delete(exerciseId);
    } else {
      newExpanded.add(exerciseId);
    }
    setExpandedExercises(newExpanded);
  };

  const getExerciseDetails = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId);
  };

  const totalExercises = workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);

  // Throttled scroll handler
  const handleScroll = useCallback(throttle((e) => {
    const scrollTop = e.target.scrollTop;
    setIsHeaderCollapsed(scrollTop > 50);
  }, 100), []);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center md:p-4 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-5xl h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div
          className={`
            bg-white border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0 transition-all duration-300 ease-in-out z-10
            ${isHeaderCollapsed ? 'py-3 px-4' : 'p-4 md:p-6'}
          `}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2
                id="modal-title"
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

            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-xl hover:bg-white/50 transition-colors shrink-0"
              aria-label="Close modal"
            >
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
                    aria-expanded={isExpanded}
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
                          const uniqueExerciseId = `${blockIndex}-${exerciseIndex}`;
                          const isExerciseExpanded = expandedExercises.has(uniqueExerciseId);

                          const intensityBorder = exerciseDetails?.strain?.intensity
                            ? intensityBorderColors[exerciseDetails.strain.intensity]
                            : "border-l-blue-500";

                          return (
                            <div
                              key={exerciseIndex}
                              onClick={() => toggleExercise(uniqueExerciseId)}
                              className={`
                                bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer
                                border border-gray-100 border-l-4 ${intensityBorder} group
                              `}
                            >
                              <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-start gap-4">
                                  <h4 className="font-bold text-gray-900 text-base md:text-lg leading-tight group-hover:text-blue-700 transition-colors">
                                    {exercise.exercise_name}
                                  </h4>
                                  <div className="shrink-0">
                                    {isExerciseExpanded ? (
                                      <ChevronUp className="w-5 h-5 text-gray-400" />
                                    ) : (
                                      <ChevronDown className="w-5 h-5 text-gray-400" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                    <Repeat className="w-4 h-4 text-blue-500" />
                                    <span className="font-bold text-gray-700 text-sm">
                                      {exercise.volume || '3x8'}
                                    </span>
                                  </div>

                                  {exercise.rest && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                                      <Timer className="w-4 h-4 text-orange-500" />
                                      <span className="font-medium text-gray-600 text-sm">
                                        {exercise.rest}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Always visible notes if present */}
                                {exercise.notes && (
                                  <div className="text-sm text-gray-600 bg-yellow-50/50 px-3 py-2 rounded-lg border border-yellow-100/50 italic">
                                    <span className="font-semibold not-italic text-yellow-700">Note:</span> {exercise.notes}
                                  </div>
                                )}
                              </div>

                              {/* Expanded Content */}
                              <div className={`grid transition-all duration-300 ease-in-out ${isExerciseExpanded ? 'grid-rows-[1fr] opacity-100 mt-4 pt-4 border-t border-gray-200' : 'grid-rows-[0fr] opacity-0'}`}>
                                <div className="overflow-hidden">
                                  {/* Exercise Schema Data */}
                                  {exerciseDetails && (
                                    <div className="space-y-3">
                                      <div className="flex flex-wrap gap-2">
                                        {/* Disciplines */}
                                        {(exerciseDetails.discipline || []).map((disc, i) => (
                                          <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium border border-blue-100">
                                            {disc}
                                          </span>
                                        ))}

                                        {/* Muscles */}
                                        {(exerciseDetails.muscles || []).slice(0, 3).map((muscle, i) => (
                                          <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-md font-medium border border-emerald-100">
                                            {muscle}
                                          </span>
                                        ))}

                                        {/* Intensity */}
                                        {exerciseDetails.strain?.intensity && (
                                          <span className={`px-2 py-1 text-xs rounded-md font-medium border ${exerciseDetails.strain.intensity === 'low' ? 'bg-green-50 text-green-700 border-green-100' :
                                            exerciseDetails.strain.intensity === 'moderate' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                                              'bg-red-50 text-red-700 border-red-100'
                                            }`}>
                                            {exerciseDetails.strain.intensity} intensity
                                          </span>
                                        )}
                                      </div>

                                      {/* Load and Duration Type */}
                                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-100">
                                        {exerciseDetails.strain?.load && (
                                          <span className="flex items-center gap-1.5">
                                            <Dumbbell className="w-3.5 h-3.5 text-gray-400" />
                                            Load: <strong className="text-gray-900">{exerciseDetails.strain.load}</strong>
                                          </span>
                                        )}
                                        {exerciseDetails.strain?.duration_type && (
                                          <span className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                                            Type: <strong className="text-gray-900">{exerciseDetails.strain.duration_type}</strong>
                                          </span>
                                        )}
                                      </div>

                                      {/* Exercise Description */}
                                      {exerciseDetails?.description && (
                                        <div className="text-sm text-gray-600 leading-relaxed">
                                          {exerciseDetails.description}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* No separate Expand/Collapse Indicator needed as it's in the header now */}
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
        <div className="p-4 md:p-6 border-t border-gray-100 bg-white/90 backdrop-blur-md shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => onDuplicate(workout)}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Copy className="w-5 h-5" />
              <span>Duplicate</span>
            </button>

            <button
              onClick={() => setShowDateModal(true)}
              className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center justify-center shadow-lg shadow-blue-200"
              aria-label="Add to Calendar"
            >
              <CalendarPlus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Date Selection Modal */}
        {showDateModal && (
          <div className="absolute inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-10 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4">Select Date</h3>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  When do you want to do this workout?
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDateModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onApply(workout, selectedDate);
                    setShowDateModal(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium shadow-lg shadow-blue-200 transition-colors"
                >
                  Add to Calendar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}