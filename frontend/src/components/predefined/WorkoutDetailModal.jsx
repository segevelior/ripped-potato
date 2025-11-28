import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Clock, Target, Calendar, MoreVertical, ChevronDown, ChevronUp, Dumbbell, Zap, Users, Timer, Star, Bookmark, Pencil, Trash2 } from "lucide-react";

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

// Placeholder images based on workout type (same as WorkoutCard)
const getWorkoutImage = (workout) => {
  const discipline = workout.primary_disciplines?.[0]?.toLowerCase() || 'strength';

  const imageMap = {
    running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=500&fit=crop',
    cycling: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&h=500&fit=crop',
    strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=500&fit=crop',
    climbing: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=500&fit=crop',
    hiit: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=500&fit=crop',
    cardio: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=500&fit=crop',
    mobility: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=500&fit=crop',
    calisthenics: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800&h=500&fit=crop',
  };

  return workout.image || imageMap[discipline] || imageMap.strength;
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

export default function WorkoutDetailModal({ workout, exercises, onClose, onApply, onEdit, onDelete }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedBlocks, setExpandedBlocks] = useState(new Set([0])); // First block expanded by default
  const [expandedExercises, setExpandedExercises] = useState(new Set());
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const scrollContainerRef = useRef(null);
  const dateInputRef = useRef(null);
  const optionsMenuRef = useRef(null);

  const workoutImage = getWorkoutImage(workout);
  const hasImage = true; // Always show image now

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

  const totalExercises = (workout.blocks || []).reduce((sum, block) => sum + block.exercises.length, 0);

  // Throttled scroll handler
  const handleScroll = useCallback(throttle((e) => {
    const scrollTop = e.target.scrollTop;
    setIsHeaderCollapsed(scrollTop > 50);
  }, 100), []);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (showOptionsMenu) {
          setShowOptionsMenu(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, showOptionsMenu, showDeleteConfirm]);

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target)) {
        setShowOptionsMenu(false);
      }
    };
    if (showOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOptionsMenu]);

  const getDifficultyColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'beginner': return 'bg-green-500 text-white';
      case 'intermediate': return 'bg-orange-500 text-white';
      case 'advanced': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const handleCalendarClick = () => {
    // Open native date picker
    dateInputRef.current?.showPicker();
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSelectedDate(newDate);
    // Auto-apply when date is selected
    onApply(workout, newDate);
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
    return colors[discipline?.toLowerCase()] || 'bg-gray-500';
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end md:items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full h-full md:h-[85vh] md:max-w-md md:rounded-[40px] rounded-none flex flex-col overflow-hidden relative shadow-2xl">

        {/* Top Navigation */}
        <div className={`flex justify-between items-center p-2 z-50 ${hasImage
          ? 'absolute top-0 left-0 right-0 pointer-events-none'
          : 'relative bg-white border-b border-gray-50'
          }`}>
          <button
            onClick={onClose}
            className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors pointer-events-auto ${hasImage
              ? 'bg-black/10 text-white hover:bg-black/20'
              : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
          >
            <X className="w-5 h-5" />
          </button>
{(onEdit || onDelete) && (
            <div className="relative pointer-events-auto" ref={optionsMenuRef}>
              <button
                onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                title="Options"
                className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors ${hasImage
                  ? 'bg-black/10 text-white hover:bg-black/20'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* Dropdown Menu */}
              {showOptionsMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden min-w-[140px] z-50">
                  {onEdit && (
                    <button
                      onClick={() => {
                        setShowOptionsMenu(false);
                        onEdit(workout);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => {
                        setShowOptionsMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Container for Hero + Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Hero Image Section - Always show */}
          <div className="h-[280px] relative shrink-0">
            <img
              src={workoutImage}
              alt={workout.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
          </div>

          {/* Content Card */}
          <div className="bg-white relative z-10 px-6 pb-8 min-h-full rounded-t-[40px] -mt-10 pt-8">

            {/* Tag / Discipline */}
            <div className="flex items-center gap-2 mb-2">
              {workout.primary_disciplines?.[0] && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${getDisciplineColor(workout.primary_disciplines[0])}`}>
                  {workout.primary_disciplines[0]}
                </span>
              )}
              {!workout.primary_disciplines?.[0] && (
                <>
                  <span className="w-2 h-2 rounded-full bg-coral-brand" />
                  <span className="text-coral-brand font-bold text-xs uppercase tracking-wider">WORKOUT TEMPLATE</span>
                </>
              )}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-4 leading-tight">
              {workout.name}
            </h2>

            {/* Metadata Row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getDifficultyColor(workout.difficulty_level).replace('text-white', 'bg-opacity-10 text-current')}`}>
                  {/* Using the background color of the difficulty but with low opacity for the icon container */}
                  <Target className={`w-5 h-5 ${getDifficultyColor(workout.difficulty_level).split(' ')[0].replace('bg-', 'text-')}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Difficulty</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${getDifficultyColor(workout.difficulty_level)}`}>
                    {workout.difficulty_level || 'General'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Coached by Sensei */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center">
                    <img src="/logo.png" alt="Sensei" className="w-9 h-9 object-contain" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Coached by</p>
                    <p className="text-sm font-bold text-gray-900">Sensei</p>
                  </div>
                </div>

                {/* Calendar Icon Button */}
                <button
                  onClick={handleCalendarClick}
                  className="w-10 h-10 rounded-full bg-coral-brand/10 hover:bg-coral-brand/20 flex items-center justify-center transition-colors ml-2"
                  title="Add to Calendar"
                >
                  <Calendar className="w-5 h-5 text-coral-brand" />
                </button>
                {/* Hidden date input */}
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="sr-only"
                />
              </div>
            </div>

            {/* About Section */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-2">About</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {workout.goal || "A comprehensive workout designed to improve your fitness levels through structured exercises."}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8 bg-coral-50 rounded-2xl p-4">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 text-coral-brand">
                  <Dumbbell className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5">
                  {workout.primary_disciplines?.[0] || 'Strength'}
                </p>
                <p className="text-[10px] text-gray-500">Activity</p>
              </div>
              <div className="text-center border-l border-coral-100">
                <div className="w-8 h-8 mx-auto mb-2 text-coral-brand">
                  <Clock className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5">
                  {workout.estimated_duration || 60}m
                </p>
                <p className="text-[10px] text-gray-500">Duration</p>
              </div>
              <div className="text-center border-l border-coral-100">
                <div className="w-8 h-8 mx-auto mb-2 text-coral-brand">
                  <Zap className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5">
                  {totalExercises}
                </p>
                <p className="text-[10px] text-gray-500">Exercises</p>
              </div>
            </div>

            {/* How to Prepare / Blocks Preview */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Workout Blocks</h3>
              <div className="space-y-4">
                {(workout.blocks || []).map((block, idx) => {
                  const isExpanded = expandedBlocks.has(idx);
                  return (
                    <div key={idx} className="border border-gray-100 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => toggleBlock(idx)}
                        className="w-full flex items-center gap-3 p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-white border border-coral-100 flex items-center justify-center shrink-0 text-coral-brand font-bold text-xs shadow-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">{block.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{block.exercises.length} exercises</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="p-4 bg-white space-y-3">
                          {block.instructions && (
                            <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-xl mb-3 leading-relaxed">
                              <span className="font-bold">Instructions:</span> {block.instructions}
                            </div>
                          )}

                          {block.exercises.map((exercise, exIdx) => {
                            const exerciseDetails = getExerciseDetails(exercise.exercise_id);
                            const uniqueExId = `${idx}-${exIdx}`;
                            const isExExpanded = expandedExercises.has(uniqueExId);

                            const intensityBorderColors = {
                              low: "border-green-500",
                              moderate: "border-yellow-500",
                              high: "border-orange-500",
                              max: "border-red-500"
                            };

                            return (
                              <div key={exIdx} className={`border-b border-gray-50 last:border-0 border-l-4 ${exerciseDetails?.strain?.intensity
                                ? intensityBorderColors[exerciseDetails.strain.intensity] || 'border-transparent'
                                : 'border-transparent'
                                }`}>
                                <div
                                  onClick={() => toggleExercise(uniqueExId)}
                                  className="flex items-start justify-between py-2 cursor-pointer hover:bg-gray-50 transition-colors rounded-r-lg px-2 pl-3"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-gray-900">{exercise.exercise_name}</p>
                                      {isExExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {exerciseDetails?.muscles && (
                                        <p className="text-[10px] text-gray-500 capitalize">
                                          {exerciseDetails.muscles.slice(0, 2).join(', ')}
                                        </p>
                                      )}
                                      {exerciseDetails?.strain?.intensity && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${intensityColors[exerciseDetails.strain.intensity]}`}>
                                          {exerciseDetails.strain.intensity}
                                        </span>
                                      )}
                                    </div>
                                    {exercise.notes && (
                                      <p className="text-[10px] text-yellow-600 mt-1 bg-yellow-50 inline-block px-1.5 py-0.5 rounded">
                                        {exercise.notes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 ml-4">
                                    <div className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded-lg">
                                      {exercise.volume || '3x8'}
                                    </div>
                                    {exercise.rest && (
                                      <p className="text-[10px] text-gray-400 mt-1 flex items-center justify-end gap-1">
                                        <Timer className="w-3 h-3" />
                                        {exercise.rest}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {isExExpanded && exerciseDetails && (
                                  <div className="px-2 pb-3 pt-1 pl-4">
                                    <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-2">
                                      {exerciseDetails.muscles && (
                                        <div>
                                          <span className="font-bold text-gray-700">Muscles:</span>
                                          <p className="text-gray-600 capitalize">{exerciseDetails.muscles.join(', ')}</p>
                                        </div>
                                      )}
                                      {exerciseDetails.equipment && (
                                        <div>
                                          <span className="font-bold text-gray-700">Equipment:</span>
                                          <p className="text-gray-600 capitalize">{exerciseDetails.equipment.join(', ')}</p>
                                        </div>
                                      )}
                                      {exerciseDetails.description && (
                                        <div>
                                          <span className="font-bold text-gray-700">Description:</span>
                                          <p className="text-gray-600 leading-relaxed">{exerciseDetails.description}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[110] rounded-[40px]">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Workout?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete "{workout.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete(workout);
                  onClose();
                }}
                className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}