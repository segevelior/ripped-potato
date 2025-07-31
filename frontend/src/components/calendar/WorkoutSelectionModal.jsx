import React, { useState, useEffect } from "react";
import { X, Bot, Library, Calendar, ChevronRight, Clock, Target, Search, Filter } from "lucide-react";
import { format } from "date-fns";
import { PredefinedWorkout } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";

export default function WorkoutSelectionModal({ date, onClose, onApplyWorkout }) {
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [coachPrompt, setCoachPrompt] = useState("");
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);
  const [filteredWorkouts, setFilteredWorkouts] = useState([]);
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");

  useEffect(() => {
    loadPredefinedWorkouts();
  }, []);

  useEffect(() => {
    filterWorkouts();
  }, [predefinedWorkouts, searchTerm, disciplineFilter, durationFilter]);

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
    let filtered = predefinedWorkouts.filter(workout => {
      const matchesSearch = workout.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           workout.goal.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (workout.tags || []).some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesDiscipline = disciplineFilter === "all" || 
                               (workout.primary_disciplines || []).includes(disciplineFilter);
      
      const matchesDuration = durationFilter === "all" ||
                             (durationFilter === "short" && (workout.estimated_duration || 60) <= 30) ||
                             (durationFilter === "medium" && (workout.estimated_duration || 60) > 30 && (workout.estimated_duration || 60) <= 60) ||
                             (durationFilter === "long" && (workout.estimated_duration || 60) > 60);
      
      return matchesSearch && matchesDiscipline && matchesDuration;
    });

    setFilteredWorkouts(filtered);
  };

  const handleCoachPrompt = async () => {
    if (!coachPrompt.trim()) return;
    
    setIsProcessingPrompt(true);
    try {
      const availableWorkouts = predefinedWorkouts.map(w => ({
        name: w.name,
        goal: w.goal,
        disciplines: w.primary_disciplines,
        duration: w.estimated_duration,
        difficulty: w.difficulty_level,
        tags: w.tags
      }));

      const prompt = `The user wants: "${coachPrompt}"
      
      Available predefined workouts: ${JSON.stringify(availableWorkouts, null, 2)}
      
      Based on the user's request, either:
      1. Recommend 1-3 existing workouts that match (return workout names in "recommended_workouts" array)
      2. If no good match exists, create a new custom workout
      
      Consider:
      - Energy levels (tired = shorter/easier, energetic = longer/harder)
      - Specific muscle groups or disciplines mentioned
      - Duration preferences
      - Intensity preferences
      
      Return response in this format:
      {
        "response_type": "recommend_existing" or "create_custom",
        "message": "Explanation of recommendation",
        "recommended_workouts": ["workout1", "workout2"] (if recommending existing),
        "custom_workout": {...} (if creating custom, use same format as predefined workouts)
      }`;

      const result = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            response_type: { type: "string", enum: ["recommend_existing", "create_custom"] },
            message: { type: "string" },
            recommended_workouts: { type: "array", items: { type: "string" } },
            custom_workout: { 
              type: "object",
              properties: {
                name: { type: "string" },
                goal: { type: "string" },
                primary_disciplines: { type: "array", items: { type: "string" } },
                estimated_duration: { type: "number" },
                difficulty_level: { type: "string" },
                blocks: { type: "array" }
              }
            }
          },
          required: ["response_type", "message"]
        }
      });

      if (result.response_type === "recommend_existing" && result.recommended_workouts) {
        // Highlight recommended workouts
        const recommended = predefinedWorkouts.filter(w => 
          result.recommended_workouts.some(rec => 
            w.name.toLowerCase().includes(rec.toLowerCase()) || rec.toLowerCase().includes(w.name.toLowerCase())
          )
        );
        setFilteredWorkouts([...recommended, ...predefinedWorkouts.filter(w => !recommended.includes(w))]);
      } else if (result.response_type === "create_custom" && result.custom_workout) {
        // Show custom workout
        setSelectedWorkout(result.custom_workout);
        setShowPreview(true);
      }

      // You could also show the AI's message to the user
      console.log("AI Coach says:", result.message);
      
    } catch (error) {
      console.error("Error processing coach prompt:", error);
    } finally {
      setIsProcessingPrompt(false);
    }
  };

  const handleApply = () => {
    if (!selectedWorkout) return;
    
    console.log("WorkoutSelectionModal: Applying workout:", selectedWorkout);
    
    // Convert predefined workout to actual workout format
    const workoutExercises = [];
    
    // Check if blocks exist and has exercises
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
            
            // Create sets array with proper structure
            const setsArray = [];
            for (let i = 0; i < sets; i++) {
              setsArray.push({
                reps: reps[i],
                weight: 0,
                rpe: 7,
                rest_seconds: 60,
                is_completed: false
              });
            }
            
            workoutExercises.push({
              exercise_id: ex.exercise_id || `temp-${Date.now()}`,
              exercise_name: ex.exercise_name || "Unknown Exercise",
              duration_seconds: null,
              notes: ex.notes || "",
              sets: setsArray
            });
          });
        }
      });
    } else {
      console.warn("WorkoutSelectionModal: No blocks found in workout, creating empty workout");
    }

    const workoutData = {
      title: selectedWorkout.name || "Unnamed Workout",
      type: selectedWorkout.primary_disciplines?.[0] || selectedWorkout.type || "strength",
      duration_minutes: selectedWorkout.estimated_duration || selectedWorkout.duration_minutes || 60,
      exercises: workoutExercises,
      notes: `Applied from: ${selectedWorkout.name}\n\nGoal: ${selectedWorkout.goal || "No goal specified"}`,
      total_strain: 0,
      muscle_strain: {}
    };

    console.log("WorkoutSelectionModal: Sending workout data:", workoutData);
    onApplyWorkout(workoutData);
  };

  const disciplines = [...new Set(predefinedWorkouts.flatMap(w => w.primary_disciplines || []))];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {showPreview ? 'Preview Workout' : 'Add Workout'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {format(date, 'EEEE, MMM d, yyyy')}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {!showPreview ? (
            <div className="p-6 space-y-6">
              {/* AI Coach Prompt */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-600" />
                  Tell the coach what you want to do today...
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="e.g., 'I want a core workout with climbing and mobility' or 'I'm feeling low energy, 30 min max'"
                    value={coachPrompt}
                    onChange={(e) => setCoachPrompt(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && handleCoachPrompt()}
                  />
                  <button
                    onClick={handleCoachPrompt}
                    disabled={isProcessingPrompt}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessingPrompt ? 'Thinking...' : 'Ask Coach'}
                  </button>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search workouts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <select
                    value={disciplineFilter}
                    onChange={(e) => setDisciplineFilter(e.target.value)}
                    className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Disciplines</option>
                    {disciplines.map(discipline => (
                      <option key={discipline} value={discipline}>
                        {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={durationFilter}
                    onChange={(e) => setDurationFilter(e.target.value)}
                    className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">Any Duration</option>
                    <option value="short">Short (≤30 min)</option>
                    <option value="medium">Medium (30-60 min)</option>
                    <option value="long">Long (60+ min)</option>
                  </select>
                </div>

                {/* Workout List */}
                <div className="grid md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {filteredWorkouts.map(workout => (
                    <div
                      key={workout.id}
                      onClick={() => {
                        setSelectedWorkout(workout);
                        setShowPreview(true);
                      }}
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md cursor-pointer transition-all bg-white"
                    >
                      <h4 className="font-semibold mb-2 text-gray-900">
                        {workout.name}
                      </h4>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {workout.goal}
                      </p>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(workout.primary_disciplines || []).map(discipline => (
                          <span key={discipline} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {discipline}
                          </span>
                        ))}
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                          {workout.estimated_duration || 60}min
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          workout.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                          workout.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {workout.difficulty_level}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {workout.blocks?.length || 0} blocks
                        </div>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>

                {filteredWorkouts.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No workouts match your criteria. Try adjusting your filters or asking the AI coach for help.
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Preview Mode
            <div className="p-6">
              <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                <h3 className="text-2xl font-bold mb-2 text-gray-900">
                  {selectedWorkout.name}
                </h3>
                <p className="text-gray-600 mb-4">
                  {selectedWorkout.goal}
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {selectedWorkout.estimated_duration || 60} minutes
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    {selectedWorkout.blocks?.length || 0} blocks
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedWorkout.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                    selectedWorkout.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedWorkout.difficulty_level}
                  </span>
                </div>
              </div>

              <div className="space-y-4 max-h-64 overflow-y-auto">
                {(selectedWorkout.blocks || []).map((block, blockIndex) => (
                  <div key={blockIndex} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-gray-900">
                        {block.name}
                      </h4>
                      {block.duration && (
                        <span className="text-sm text-gray-500">
                          {block.duration}
                        </span>
                      )}
                    </div>
                    {block.instructions && (
                      <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg mb-3">
                        {block.instructions}
                      </p>
                    )}
                    <div className="space-y-2">
                      {(block.exercises || []).map((exercise, exerciseIndex) => (
                        <div key={exerciseIndex} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                          <span className="font-medium text-gray-900">{exercise.exercise_name}</span>
                          <div className="text-sm text-gray-600">
                            {exercise.volume} {exercise.rest && `• Rest: ${exercise.rest}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-white flex gap-3">
          <button 
            onClick={() => {
              if (showPreview) {
                setShowPreview(false);
              } else {
                onClose();
              }
            }}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            {showPreview ? 'Back' : 'Cancel'}
          </button>
          {showPreview && (
            <button 
              onClick={handleApply} 
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Apply to Calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}