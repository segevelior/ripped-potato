
import React, { useState, useEffect } from "react";
import { Workout, PredefinedWorkout, Exercise } from "@/api/entities";
import { format } from "date-fns";
import { Zap, Bot, ArrowRight, Clock, Target, Play, Sparkles, Eye, Stars } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { InvokeLLM } from "@/api/integrations";
import WorkoutDetailModal from "../components/predefined/WorkoutDetailModal";

const SuggestionCard = ({ suggestion, onStart, onView, isCustom = false }) => (
  <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-lg transition-all duration-200 relative group">
    {isCustom && (
      <div className="absolute -top-2 -right-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 shadow-md">
        <Stars className="w-3 h-3" />
        AI Generated
      </div>
    )}
    <div className="flex items-start justify-between mb-3">
      <h3 className="text-lg font-semibold text-gray-900 pr-4">{suggestion.title}</h3>
      {!isCustom && (
        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap">
          Template
        </span>
      )}
    </div>
    <p className="text-sm text-gray-600 mb-4 leading-relaxed">{suggestion.description}</p>
    {suggestion.workout && (
      <div className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Clock className="w-4 h-4"/>{suggestion.workout.estimated_duration || 60}min</span>
          <span className="flex items-center gap-1"><Target className="w-4 h-4"/>{suggestion.workout.blocks?.length || 0} blocks</span>
        </div>
        <div className="flex gap-2 pt-2">
          <button 
            onClick={() => onView(suggestion.workout)} 
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button 
            onClick={() => onStart(suggestion.workout)} 
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all text-sm shadow-md transform hover:scale-105"
          >
            <Play className="w-4 h-4" />
            Start Now
          </button>
        </div>
      </div>
    )}
  </div>
);

const GenerateWorkoutCard = ({ onGenerate, isGenerating, userPrompt, hasResults }) => {
  if (!hasResults) return null; // Only show after search results
  
  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-sm p-6 border-2 border-dashed border-purple-200 hover:border-purple-300 transition-colors">
      <div className="text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-purple-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Need something different?</h3>
        <p className="text-sm text-gray-600 mb-4">
          Let AI create a completely custom workout based on your request.
        </p>
        {userPrompt && (
          <p className="text-xs text-purple-700 bg-purple-100 px-3 py-1 rounded-full mb-4 inline-block">
            For: "{userPrompt}"
          </p>
        )}
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" />
          {isGenerating ? 'Creating your workout...' : 'Generate Custom Workout'}
        </button>
      </div>
    </div>
  );
};

export default function TrainNow() {
  const [todaysWorkouts, setTodaysWorkouts] = useState([]);
  const [suggestedWorkouts, setSuggestedWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [allExercises, setAllExercises] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [workoutToView, setWorkoutToView] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    setErrorMessage(""); // Clear any previous error messages
    const today = format(new Date(), "yyyy-MM-dd");
    try {
      const [workouts, predefined, exercises] = await Promise.all([
        Workout.filter({ date: today }),
        PredefinedWorkout.list(),
        Exercise.list()
      ]);
      setTodaysWorkouts(workouts);
      setPredefinedWorkouts(predefined);
      setAllExercises(exercises);
      setIsLoading(false);

      // Generate initial suggestions in the background with error handling
      try {
        generateSuggestions("", predefined, workouts);
      } catch (error) {
        console.log("Failed to generate initial suggestions, continuing without them");
        // No need to set errorMessage here, generateSuggestions already handles it.
        // This catch is just to prevent initial suggestion failure from breaking loadInitialData.
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
      setErrorMessage("Failed to load workout data. Please refresh the page.");
      setIsLoading(false);
    }
  };

  const generateSuggestions = async (promptText, predefined, scheduled) => {
    setIsGeneratingSuggestions(true);
    setErrorMessage(""); // Clear any previous error messages
    
    try {
      const context = {
        userRequest: promptText || "general readiness for a workout",
        day: format(new Date(), 'EEEE'),
        hasScheduledWorkout: scheduled.length > 0,
        availableWorkouts: predefined.slice(0, 10).map(w => ({
          name: w.name,
          goal: w.goal,
          duration: w.estimated_duration,
          disciplines: w.primary_disciplines
        }))
      };

      const prompt = `Based on this context: ${JSON.stringify(context)}
      
      Suggest 2 relevant, existing predefined workouts from the available list that best match the user's request.
      Prioritize variety. If the user request is generic, suggest a balanced mix.
      
      Return suggestions in this format:
      {
        "suggestions": [
          {
            "title": "Workout Name from List",
            "description": "A brief, compelling reason why this workout is a good suggestion for today."
          }
        ]
      }`;

      const result = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                }
              }
            }
          }
        }
      });

      const processedSuggestions = result.suggestions.map(suggestion => {
        const workout = predefined.find(w => w.name.toLowerCase() === suggestion.title.toLowerCase());
        return { ...suggestion, workout: workout };
      }).filter(s => s.workout);

      setSuggestedWorkouts(processedSuggestions);
    } catch (error) {
      console.error("Error generating suggestions:", error);
      
      if (error.response?.status === 429) {
        setErrorMessage("AI service is busy. Using fallback recommendations.");
      } else {
        setErrorMessage("Unable to generate AI suggestions. Showing popular workouts instead.");
      }
      
      // Fallback to simple suggestions
      const fallbackSuggestions = predefined.slice(0, 3).map(workout => ({
        title: workout.name,
        description: `${workout.goal} - Perfect for a ${format(new Date(), 'EEEE')}.`,
        workout: workout
      }));
      setSuggestedWorkouts(fallbackSuggestions);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleSearchWorkouts = async () => {
    if (!userPrompt.trim()) {
      setSuggestedWorkouts([]);
      setHasSearched(false);
      setErrorMessage(""); // Clear any previous error messages
      return;
    }
    
    setIsGeneratingSuggestions(true);
    setHasSearched(true);
    setErrorMessage(""); // Clear any previous error messages
    
    const matchingWorkouts = predefinedWorkouts
      .map(workout => {
        let score = 0;
        const searchLower = userPrompt.toLowerCase();
        if (workout.name.toLowerCase().includes(searchLower)) score += 3;
        if (workout.goal.toLowerCase().includes(searchLower)) score += 2;
        if ((workout.primary_disciplines || []).some(d => searchLower.includes(d.toLowerCase()))) score += 2;
        if ((workout.tags || []).some(tag => searchLower.includes(tag.toLowerCase()))) score += 1;
        return { ...workout, score };
      })
      .filter(workout => workout.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    const suggestions = matchingWorkouts.map(workout => ({
      title: workout.name,
      description: `${workout.goal}`,
      workout: workout
    }));
    
    setSuggestedWorkouts(suggestions);
    setIsGeneratingSuggestions(false);
  };

  const handleGenerateCustomWorkout = async () => {
    if (!userPrompt.trim()) return;
    setIsGeneratingCustom(true);
    setErrorMessage(""); // Clear any previous error messages
    
    try {
      const prompt = `Generate a complete, structured workout based on the user request: "${userPrompt}". The workout should have a suitable name, goal, duration, difficulty, and 2-4 blocks (like Warmup, Main Set, Cooldown) with specific exercises, volumes, and rest periods.`;
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          goal: { type: "string" },
          primary_disciplines: { type: "array", items: { type: "string" } },
          estimated_duration: { type: "number" },
          difficulty_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          blocks: {
            type: "array",
            items: {
              type: "object", properties: {
                name: { type: "string" },
                exercises: { type: "array", items: {
                    type: "object", properties: {
                      exercise_name: { type: "string" },
                      volume: { type: "string" },
                      rest: { type: "string" },
                      notes: { type: "string" }
                    }
                }}
              }
            }
          }
        },
        required: ["name", "goal", "estimated_duration", "difficulty_level", "blocks"]
      };

      const customWorkout = await InvokeLLM({ prompt, response_json_schema: schema });
      const newSuggestion = {
        title: customWorkout.name,
        description: `Custom workout generated for: "${userPrompt}"`,
        workout: customWorkout,
        isCustom: true
      };
      setSuggestedWorkouts(prev => [newSuggestion, ...prev]);
    } catch (error) {
      console.error("Error generating workout:", error);
      
      if (error.response?.status === 429) {
        setErrorMessage("AI service is busy. Please wait a moment and try again.");
      } else {
        setErrorMessage("Failed to generate custom workout. Please try again or browse existing workouts.");
      }
    } finally {
      setIsGeneratingCustom(false);
    }
  };

  const startWorkout = (workout) => {
    const sessionData = {
      title: workout.name,
      type: workout.primary_disciplines?.[0] || "strength",
      duration_minutes: workout.estimated_duration || 60,
      exercises: []
    };

    workout.blocks?.forEach(block => {
      block.exercises?.forEach(ex => {
        const newExercise = {
          exercise_id: ex.exercise_name.toLowerCase().replace(/\s/g, '_'),
          exercise_name: ex.exercise_name,
          notes: ex.notes || "",
          sets: []
        };
        
        const volume = ex.volume || "3x8";
        let numSets = 3;
        if (volume.includes('x')) {
          const [setsStr] = volume.split('x');
          numSets = parseInt(setsStr) || 3;
        }

        let restSeconds = 60;
        if (ex.rest && ex.rest.includes('s')) {
            restSeconds = parseInt(ex.rest) || 60;
        }

        for (let i = 0; i < numSets; i++) {
            newExercise.sets.push({
                reps: 0,
                weight: 0,
                rpe: 7,
                rest_seconds: restSeconds,
                is_completed: false
            });
        }
        
        sessionData.exercises.push(newExercise);
      });
    });

    const tempId = `temp_${Date.now()}`;
    sessionStorage.setItem(tempId, JSON.stringify(sessionData));
    window.location.href = createPageUrl(`LiveWorkout?id=${tempId}`);
  };

  const viewWorkout = (workout) => setWorkoutToView(workout);

  const applyToCalendar = async (workout, selectedDate) => {
    try {
      setErrorMessage(""); // Clear any previous error messages
      const workoutExercises = [];
      
      workout.blocks.forEach(block => {
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
          
          workoutExercises.push({
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            sets: sets,
            reps: reps,
            weight: Array(sets).fill(0),
            rpe: Array(sets).fill(7),
            notes: ex.notes || ""
          });
        });
      });

      const newWorkout = {
        title: workout.name,
        date: selectedDate,
        type: workout.primary_disciplines?.[0] || "strength",
        duration_minutes: workout.estimated_duration || 60,
        exercises: workoutExercises,
        total_strain: 0,
        muscle_strain: {},
        notes: `Applied from: ${workout.name}\n\nGoal: ${workout.goal}`
      };

      await Workout.create(newWorkout);
      setWorkoutToView(null);
      alert(`"${workout.name}" has been added to your calendar for ${selectedDate}!`);
    } catch (error) {
      console.error("Error applying workout to calendar:", error);
      setErrorMessage("Error adding workout to calendar. Please try again.");
    }
  };
  
  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div></div>;
  }

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl text-white shadow-lg">
          <Zap className="w-8 h-8"/>
        </div>
        <div>
          <h1 className="text-3xl font-bold">Train Now</h1>
          <p className="text-lg text-gray-500">Find or generate the perfect workout for today.</p>
        </div>
      </div>
      
      {/* Error Message */}
      {errorMessage && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm text-yellow-800">
            ⚠️ {errorMessage}
          </div>
        </div>
      )}

      {todaysWorkouts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Today's Scheduled Workout
          </h2>
          {todaysWorkouts.map(workout => (
            <div key={workout.id} className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-l-blue-500">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold mb-2">{workout.title}</h3>
                  <div className="flex items-center gap-4 text-gray-500 mb-4">
                    <span className="flex items-center gap-1"><Target className="w-4 h-4"/>{workout.exercises?.length || 0} exercises</span>
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4"/>{workout.duration_minutes} min</span>
                  </div>
                </div>
                <Link to={createPageUrl(`LiveWorkout?id=${workout.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg">
                  Start Workout <ArrowRight className="w-4 h-4"/>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Bot className="w-6 h-6 text-purple-600" />
          What do you want to train today?
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="e.g., '30min upper body', 'tired but want to climb', 'quick HIIT session'"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearchWorkouts()}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 transition-all"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSearchWorkouts}
              disabled={isGeneratingSuggestions || !userPrompt.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {isGeneratingSuggestions ? 'Searching...' : 'Find Workouts'}
            </button>
            {userPrompt.trim() && (
              <button
                onClick={handleGenerateCustomWorkout}
                disabled={isGeneratingCustom}
                className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isGeneratingCustom ? 'Creating...' : 'Generate'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">
          {hasSearched ? 'Suggestions' : 'Recommended For You'}
        </h2>
        
        {isGeneratingSuggestions ? (
          <div className="text-center py-8 text-gray-500">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            Searching for the perfect workout...
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suggestedWorkouts.map((suggestion, index) => (
              <SuggestionCard 
                key={index} 
                suggestion={suggestion} 
                onStart={startWorkout} 
                onView={viewWorkout} 
                isCustom={suggestion.isCustom} 
              />
            ))}
            
            <GenerateWorkoutCard 
              onGenerate={handleGenerateCustomWorkout} 
              isGenerating={isGeneratingCustom} 
              userPrompt={userPrompt}
              hasResults={hasSearched && suggestedWorkouts.length > 0}
            />

            {!hasSearched && predefinedWorkouts.length > 0 && suggestedWorkouts.length === 0 && (
                 predefinedWorkouts.slice(0,3).map((p, index) => (
                     <SuggestionCard key={index} suggestion={{title: p.name, description: p.goal, workout: p}} onStart={startWorkout} onView={viewWorkout} />
                 ))
            )}
          </div>
        )}

        {hasSearched && suggestedWorkouts.length === 0 && !isGeneratingSuggestions && (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            <div className="text-4xl mb-4">🤔</div>
            <p className="mb-4">No existing workouts match "{userPrompt}"</p>
            <button
              onClick={handleGenerateCustomWorkout}
              disabled={isGeneratingCustom}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 mx-auto"
            >
              <Sparkles className="w-4 h-4" />
              Generate Custom Workout
            </button>
          </div>
        )}
      </div>
    </div>

    {workoutToView && (
        <WorkoutDetailModal
          workout={workoutToView}
          exercises={allExercises}
          onClose={() => setWorkoutToView(null)}
          onApply={applyToCalendar}
          onDuplicate={() => {}}
        />
    )}
    </>
  );
}
