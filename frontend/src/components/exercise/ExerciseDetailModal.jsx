import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Dumbbell, Target, Zap, Timer, Info, Activity, TrendingUp, AlertCircle, Star, Copy, Repeat, ArrowRight, Weight, Clock } from "lucide-react";
import { getDisciplineClass } from "@/styles/designTokens";

const intensityColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  max: "bg-red-100 text-red-800"
};

const difficultyColors = {
  beginner: "bg-green-500",
  intermediate: "bg-orange-500",
  advanced: "bg-red-500"
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

export default function ExerciseDetailModal({ exercise, onClose, onEdit, onToggleFavorite }) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const scrollContainerRef = useRef(null);
  const [isFavorite, setIsFavorite] = useState(exercise.userMetadata?.isFavorite || false);

  useEffect(() => {
    setIsFavorite(exercise.userMetadata?.isFavorite || false);
  }, [exercise.userMetadata?.isFavorite]);

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

  if (!exercise) return null;

  const hasImage = !!exercise.image;
  const discipline = exercise.discipline?.[0] || 'Fitness';
  // Extract color name from class (e.g., 'bg-blue-600' -> 'text-blue-600')
  const disciplineClass = getDisciplineClass(discipline);
  const disciplineTextColor = disciplineClass.replace('bg-', 'text-');

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end md:items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full h-full md:h-[85vh] md:max-w-md md:rounded-[40px] rounded-none flex flex-col overflow-hidden relative shadow-2xl">

        {/* Top Navigation */}
        <div className="absolute top-0 left-0 right-0 p-2 z-50 flex justify-between items-center pointer-events-none">
          <button
            onClick={onClose}
            className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors pointer-events-auto ${hasImage ? 'bg-black/10 text-white hover:bg-black/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => {
                setIsFavorite(!isFavorite);
                onToggleFavorite(exercise);
              }}
              className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors ${isFavorite
                ? 'bg-white text-yellow-500 shadow-md'
                : hasImage ? 'bg-black/10 text-white hover:bg-black/20' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
            >
              <Star className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => onEdit(exercise)}
              className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors ${hasImage ? 'bg-black/10 text-white hover:bg-black/20' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Container for Hero + Content */}
        <div
          className="flex-1 overflow-y-auto no-scrollbar"
          onScroll={handleScroll}
          ref={scrollContainerRef}
        >
          {/* Hero Image Section - Only if image exists */}
          {hasImage && (
            <div className="h-[280px] relative shrink-0">
              <img
                src={exercise.image}
                alt={exercise.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

              {/* Badge Overlay */}
              <div className="absolute bottom-14 left-6 flex flex-wrap gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${disciplineClass}`}>
                  {discipline}
                </span>
                {exercise.isCommon && !exercise.isModified && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500 text-white">
                    Common
                  </span>
                )}
                {exercise.isModified && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white">
                    Custom
                  </span>
                )}
                {!exercise.isCommon && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white">
                    Private
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Content Card */}
          <div className={`bg-white relative z-10 px-6 pb-32 min-h-full ${hasImage ? 'rounded-t-[40px] -mt-10 pt-8' : 'pt-16'}`}>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-4 leading-tight">
              {exercise.name}
            </h2>

            {/* Badges if no image */}
            {!hasImage && (
              <div className="flex flex-wrap gap-2 mb-6">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${disciplineClass}`}>
                  {discipline}
                </span>
                {exercise.isCommon && !exercise.isModified && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                    Common
                  </span>
                )}
                {exercise.isModified && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800">
                    Custom
                  </span>
                )}
                {!exercise.isCommon && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800">
                    Private
                  </span>
                )}
              </div>
            )}

            {/* Metadata Row */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-600`}>
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Target</p>
                  <span className="text-sm font-bold text-gray-900 capitalize">
                    {exercise.muscles?.[0]?.replace('_', ' ') || 'Full Body'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${exercise.difficulty === 'beginner' ? 'bg-green-100 text-green-600' :
                  exercise.difficulty === 'intermediate' ? 'bg-orange-100 text-orange-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">Difficulty</p>
                  <span className={`text-sm font-bold capitalize ${exercise.difficulty === 'beginner' ? 'text-green-600' :
                    exercise.difficulty === 'intermediate' ? 'text-orange-600' :
                      'text-red-600'
                    }`}>
                    {exercise.difficulty || 'General'}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8 bg-gray-50 rounded-2xl p-4">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 text-blue-500">
                  <Dumbbell className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5 capitalize truncate">
                  {exercise.equipment?.[0] || 'None'}
                </p>
                <p className="text-[10px] text-gray-500">Equipment</p>
              </div>
              <div className="text-center border-l border-gray-200">
                <div className={`w-8 h-8 mx-auto mb-2 ${disciplineTextColor}`}>
                  <Activity className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5 capitalize truncate">
                  {discipline}
                </p>
                <p className="text-[10px] text-gray-500">Type</p>
              </div>
              <div className="text-center border-l border-gray-200">
                <div className="w-8 h-8 mx-auto mb-2 text-orange-500">
                  <Zap className="w-full h-full" />
                </div>
                <p className="text-xs font-bold text-gray-900 mb-0.5 capitalize">
                  {exercise.strain?.intensity || 'N/A'}
                </p>
                <p className="text-[10px] text-gray-500">Intensity</p>
              </div>
            </div>

            {/* About Section */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-2">About</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {exercise.description || "No description available for this exercise."}
              </p>
            </div>

            {/* Instructions */}
            {exercise.instructions && exercise.instructions.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">How to Perform</h3>
                <div className="space-y-4">
                  {exercise.instructions.map((step, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Muscles Tags */}
            {exercise.muscles && exercise.muscles.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Muscles Worked</h3>
                <div className="flex flex-wrap gap-2">
                  {exercise.muscles.map((muscle, i) => (
                    <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold capitalize">
                      {muscle.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Equipment List */}
            {exercise.equipment && exercise.equipment.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Equipment Needed</h3>
                <div className="flex flex-wrap gap-2">
                  {exercise.equipment.map((eq, i) => (
                    <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold capitalize flex items-center gap-1.5">
                      <Dumbbell className="w-3 h-3" />
                      {eq}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Strain Characteristics */}
            {exercise.strain && (exercise.strain.intensity || exercise.strain.load || exercise.strain.typical_volume) && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Strain Profile</h3>
                <div className="grid grid-cols-2 gap-3">
                  {exercise.strain.intensity && (
                    <div className={`p-3 rounded-xl ${intensityColors[exercise.strain.intensity] || 'bg-gray-100 text-gray-700'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-4 h-4" />
                        <span className="text-xs font-medium opacity-80">Intensity</span>
                      </div>
                      <p className="text-sm font-bold capitalize">{exercise.strain.intensity}</p>
                    </div>
                  )}
                  {exercise.strain.load && (
                    <div className="p-3 rounded-xl bg-orange-50 text-orange-700">
                      <div className="flex items-center gap-2 mb-1">
                        <Weight className="w-4 h-4" />
                        <span className="text-xs font-medium opacity-80">Load Type</span>
                      </div>
                      <p className="text-sm font-bold capitalize">{exercise.strain.load}</p>
                    </div>
                  )}
                  {exercise.strain.duration_type && (
                    <div className="p-3 rounded-xl bg-cyan-50 text-cyan-700">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-medium opacity-80">Measured In</span>
                      </div>
                      <p className="text-sm font-bold capitalize">{exercise.strain.duration_type}</p>
                    </div>
                  )}
                  {exercise.strain.typical_volume && (
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
                      <div className="flex items-center gap-2 mb-1">
                        <Repeat className="w-4 h-4" />
                        <span className="text-xs font-medium opacity-80">Typical Volume</span>
                      </div>
                      <p className="text-sm font-bold">{exercise.strain.typical_volume}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Similar Exercises */}
            {exercise.similar_exercises && exercise.similar_exercises.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Similar Exercises</h3>
                <div className="flex flex-wrap gap-2">
                  {exercise.similar_exercises.map((simEx, i) => (
                    <span key={i} className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold capitalize flex items-center gap-1.5">
                      <ArrowRight className="w-3 h-3" />
                      {simEx}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Progression Info */}
            {(exercise.progression_group || exercise.previous_progression || exercise.next_progression) && (
              <div className="mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Progression Path</h3>
                <div className="bg-gradient-to-r from-violet-50 to-orange-50 rounded-2xl p-4">
                  {exercise.progression_group && (
                    <p className="text-xs text-orange-600 font-medium mb-2">
                      Part of: <span className="font-bold">{exercise.progression_group}</span>
                      {exercise.progression_level && <span className="ml-1">(Level {exercise.progression_level})</span>}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {exercise.previous_progression && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="px-2 py-1 bg-white rounded-lg text-xs font-medium">{exercise.previous_progression}</span>
                        <ArrowRight className="w-4 h-4 text-orange-400" />
                      </div>
                    )}
                    <span className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold">
                      {exercise.name}
                    </span>
                    {exercise.next_progression && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ArrowRight className="w-4 h-4 text-orange-400" />
                        <span className="px-2 py-1 bg-white rounded-lg text-xs font-medium">{exercise.next_progression}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tips & Mistakes */}
            {(exercise.tips?.length > 0 || exercise.commonMistakes?.length > 0) && (
              <div className="space-y-4">
                {exercise.tips?.length > 0 && (
                  <div className="bg-yellow-50 rounded-2xl p-4">
                    <h4 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Pro Tips
                    </h4>
                    <ul className="space-y-2">
                      {exercise.tips.map((tip, i) => (
                        <li key={i} className="text-xs text-yellow-900/80 leading-relaxed">• {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {exercise.commonMistakes?.length > 0 && (
                  <div className="bg-red-50 rounded-2xl p-4">
                    <h4 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                      <X className="w-4 h-4" /> Common Mistakes
                    </h4>
                    <ul className="space-y-2">
                      {exercise.commonMistakes.map((mistake, i) => (
                        <li key={i} className="text-xs text-red-900/80 leading-relaxed">• {mistake}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-100 z-50">
          <button
            onClick={() => {
              onEdit(exercise);
              onClose();
            }}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-gray-800 transition-colors shadow-xl shadow-gray-900/10 flex items-center justify-center gap-2"
          >
            {exercise.isCommon && !exercise.isModified ? 'Customize Exercise' : 'Edit Exercise'}
          </button>
        </div>
      </div>
    </div>
  );
}