import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, ChevronRight, Clock, Target, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { PredefinedWorkout } from "@/api/entities";
import { createPageUrl } from "@/utils";

export default function WorkoutSelectionModal({ date, onClose, onApplyWorkout }) {
  const navigate = useNavigate();
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [coachPrompt, setCoachPrompt] = useState("");
  const [filteredWorkouts, setFilteredWorkouts] = useState([]);

  useEffect(() => {
    loadPredefinedWorkouts();
  }, []);

  useEffect(() => {
    filterWorkouts();
  }, [predefinedWorkouts, searchTerm]);

  const loadPredefinedWorkouts = async () => {
    try {
      const workouts = await PredefinedWorkout.list();
      setPredefinedWorkouts(workouts);
      setFilteredWorkouts(workouts);
    } catch (error) {
      console.error("Error loading predefined workouts:", error);
    }
  };

  const filterWorkouts = () => {
    if (!searchTerm.trim()) {
      setFilteredWorkouts(predefinedWorkouts);
      return;
    }

    const filtered = predefinedWorkouts.filter(workout => {
      const searchLower = searchTerm.toLowerCase();
      return workout.name?.toLowerCase().includes(searchLower) ||
             workout.goal?.toLowerCase().includes(searchLower) ||
             (workout.primary_disciplines || []).some(d => d.toLowerCase().includes(searchLower)) ||
             (workout.tags || []).some(tag => tag.toLowerCase().includes(searchLower));
    });

    setFilteredWorkouts(filtered);
  };

  const handleAskSensei = () => {
    console.log('🔥 handleAskSensei called!');

    // Build context message for Sensei with rich context
    const dateStr = format(date, 'EEEE, MMMM d, yyyy');
    const isToday = format(new Date(), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
    const isoDate = format(date, 'yyyy-MM-dd');

    let prompt;
    if (coachPrompt.trim()) {
      prompt = `[WORKOUT REQUEST for ${dateStr} (${isoDate})${isToday ? ' - TODAY' : ''}]

I want to add a workout to my calendar for ${dateStr}. Here's what I'm looking for: ${coachPrompt}

Please suggest exercises that fit this request, estimate the duration, and create a workout for me. After I approve, add it to my calendar for this date.${isToday ? ' Since this is for today, ask me if I want to start training now after adding it.' : ''}`;
    } else {
      prompt = `[WORKOUT REQUEST for ${dateStr} (${isoDate})${isToday ? ' - TODAY' : ''}]

I want to add a workout to my calendar for ${dateStr}. Please help me decide what to train. Ask me a quick question about what I'm in the mood for, or suggest a few options based on my training history and goals.${isToday ? ' Since this is for today, if I confirm a workout, ask me if I want to start training now.' : ''}`;
    }

    // Store prompt in localStorage for the Chat page to pick up
    localStorage.setItem('pendingChatPrompt', prompt);

    // Also store timestamp to verify freshness
    localStorage.setItem('pendingChatPromptTime', Date.now().toString());

    // Close modal and navigate to Chat page
    console.log('📦 Stored in localStorage:', localStorage.getItem('pendingChatPrompt')?.substring(0, 50));
    console.log('🚀 Navigating to /Chat...');
    onClose();
    navigate("/Chat");
  };

  const handleApply = () => {
    if (!selectedWorkout) return;

    // Convert predefined workout to actual workout format
    const workoutExercises = [];

    if (selectedWorkout.blocks && Array.isArray(selectedWorkout.blocks)) {
      selectedWorkout.blocks.forEach(block => {
        if (block.exercises && Array.isArray(block.exercises)) {
          block.exercises.forEach(ex => {
            const volume = ex.volume || "3x8";
            let sets = 3;
            let reps = [8, 8, 8];

            if (volume.includes('x')) {
              const [setsStr, repsStr] = volume.split('x');
              sets = parseInt(setsStr) || 3;
              const repCount = parseInt(repsStr) || 8;
              reps = Array(sets).fill(repCount);
            }

            const setsArray = [];
            for (let i = 0; i < sets; i++) {
              setsArray.push({
                targetReps: reps[i],
                weight: 0,
                rpe: 7,
                restSeconds: 60,
                isCompleted: false
              });
            }

            workoutExercises.push({
              // Only include exerciseId if it's a valid MongoDB ObjectId
              ...(ex.exercise_id && /^[0-9a-fA-F]{24}$/.test(ex.exercise_id) ? { exerciseId: ex.exercise_id } : {}),
              exerciseName: ex.exercise_name || "Unknown Exercise",
              order: workoutExercises.length,
              notes: ex.notes || "",
              sets: setsArray
            });
          });
        }
      });
    }

    // Map discipline to valid workout type
    const disciplineToType = {
      'calisthenics': 'calisthenics',
      'strength': 'strength',
      'cardio': 'cardio',
      'hiit': 'hiit',
      'yoga': 'flexibility',
      'stretching': 'flexibility',
      'flexibility': 'flexibility',
      'mobility': 'mobility',
      'recovery': 'recovery',
      'hybrid': 'hybrid'
    };

    const rawType = (selectedWorkout.primary_disciplines?.[0] || selectedWorkout.type || "strength").toLowerCase();
    const workoutType = disciplineToType[rawType] || 'strength';

    const workoutData = {
      title: selectedWorkout.name || "Unnamed Workout",
      type: workoutType,
      durationMinutes: selectedWorkout.estimated_duration || selectedWorkout.duration_minutes || 60,
      exercises: workoutExercises,
      notes: `Applied from: ${selectedWorkout.name}\n\nGoal: ${selectedWorkout.goal || "No goal specified"}`,
      totalStrain: 0,
      muscleStrain: {}
    };

    onApplyWorkout(workoutData);
  };

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'beginner': return 'bg-green-100 text-green-700';
      case 'intermediate': return 'bg-yellow-100 text-yellow-700';
      case 'advanced': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:w-[480px] sm:max-w-lg max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        {/* Header - Compact */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Add Workout</h2>
              <p className="text-xs text-gray-500">
                {format(date, 'EEE, MMM d')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!showPreview ? (
            <div className="p-3 space-y-3">
              {/* Ask Sensei Section - Compact */}
              <div className="bg-gradient-to-br from-primary-50 to-red-50 rounded-xl p-3 border border-primary-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#FE5334] rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">Ask Sensei</h3>
                </div>
                <p className="text-xs text-gray-600 mb-2">
                  Need help deciding? Tell Sensei what you're in the mood for.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g., 'full body strength'"
                    value={coachPrompt}
                    onChange={(e) => setCoachPrompt(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAskSensei()}
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-primary-100 rounded-lg text-sm focus:ring-2 focus:ring-[#FE5334] focus:border-transparent placeholder:text-gray-400"
                  />
                  <button
                    onClick={handleAskSensei}
                    className="px-3 py-2 bg-[#FE5334] text-white rounded-lg hover:bg-[#E84A2D] transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0"
                  >
                    Ask
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-[10px] text-gray-400 font-medium">OR PICK FROM LIBRARY</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search workouts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#FE5334] focus:border-transparent focus:bg-white"
                />
              </div>

              {/* Workout List - Compact */}
              <div className="space-y-2 -mx-1 px-1">
                {filteredWorkouts.length > 0 ? (
                  filteredWorkouts.map(workout => (
                    <button
                      key={workout.id}
                      onClick={() => {
                        setSelectedWorkout(workout);
                        setShowPreview(true);
                      }}
                      className="w-full p-3 bg-white border border-gray-200 rounded-xl hover:border-primary-400 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 text-sm truncate">
                            {workout.name}
                          </h4>
                          <p className="text-xs text-gray-500 truncate mb-1.5">
                            {workout.goal}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(workout.primary_disciplines || []).slice(0, 2).map(discipline => (
                              <span key={discipline} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-medium">
                                {discipline}
                              </span>
                            ))}
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded">
                              {workout.estimated_duration || 60}min
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] rounded ${getDifficultyColor(workout.difficulty_level)}`}>
                              {workout.difficulty_level}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#FE5334] transition-colors flex-shrink-0" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <p className="text-sm">No workouts found</p>
                    <p className="text-xs mt-1">Try a different search or ask Sensei</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Preview Mode - Compact */
            <div className="p-3">
              <div className="mb-3">
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  {selectedWorkout.name}
                </h3>
                <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                  {selectedWorkout.goal}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Clock className="w-3.5 h-3.5" />
                    {selectedWorkout.estimated_duration || 60}min
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Target className="w-3.5 h-3.5" />
                    {selectedWorkout.blocks?.length || 0} blocks
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${getDifficultyColor(selectedWorkout.difficulty_level)}`}>
                    {selectedWorkout.difficulty_level}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {(selectedWorkout.blocks || []).map((block, blockIndex) => (
                  <div key={blockIndex} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-gray-900 text-xs">
                        {block.name}
                      </h4>
                      {block.duration && (
                        <span className="text-[10px] text-gray-500">
                          {block.duration}
                        </span>
                      )}
                    </div>
                    {block.instructions && (
                      <p className="text-[10px] text-orange-700 bg-orange-50 p-2 rounded mb-2">
                        {block.instructions}
                      </p>
                    )}
                    <div className="space-y-1">
                      {(block.exercises || []).map((exercise, exerciseIndex) => (
                        <div key={exerciseIndex} className="flex justify-between items-center bg-white p-2 rounded text-xs">
                          <span className="font-medium text-gray-800 truncate flex-1">{exercise.exercise_name}</span>
                          <span className="text-gray-500 text-[10px] ml-2 flex-shrink-0">
                            {exercise.volume}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Compact */}
        <div className="px-3 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          {!showPreview ? (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Back
              </button>
              <button
                onClick={handleApply}
                className="flex-1 px-4 py-2.5 bg-[#FE5334] text-white rounded-xl hover:bg-[#E84A2D] transition-colors font-medium text-sm"
              >
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
