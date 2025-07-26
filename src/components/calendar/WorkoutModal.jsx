import React, { useState, useEffect } from "react";
import { X, Clock, Target, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Exercise } from "@/api/entities";

export default function WorkoutModal({ date, workout, onClose, onSave, disciplines }) {
  const [workoutData, setWorkoutData] = useState({
    title: "",
    type: "strength",
    duration_minutes: 60,
    exercises: [],
    notes: "",
    discipline: disciplines[0]?.name || "strength",
    intensity: "moderate"
  });
  const [exercises, setExercises] = useState([]);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);

  useEffect(() => {
    if (workout) {
      setWorkoutData({
        title: workout.title || "",
        type: workout.type || "strength",
        duration_minutes: workout.duration_minutes || 60,
        exercises: workout.exercises || [],
        notes: workout.notes || "",
        discipline: workout.discipline || disciplines[0]?.name || "strength",
        intensity: workout.intensity || "moderate"
      });
    }
    loadExercises();
  }, [workout, disciplines]);

  const loadExercises = async () => {
    try {
      const exerciseList = await Exercise.list();
      setExercises(exerciseList);
    } catch (error) {
      console.error("Error loading exercises:", error);
    }
  };

  const handleSave = () => {
    if (!workoutData.title.trim()) {
      alert("Please enter a workout title");
      return;
    }
    
    onSave({
      ...workoutData,
      total_strain: 0,
      muscle_strain: {}
    });
  };

  const addExercise = (exercise) => {
    const newExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      sets: 3,
      reps: [8, 8, 8],
      weight: [0, 0, 0],
      rpe: [7, 7, 7],
      notes: ""
    };

    setWorkoutData(prev => ({
      ...prev,
      exercises: [...prev.exercises, newExercise]
    }));
    setShowExerciseSelector(false);
  };

  const removeExercise = (index) => {
    setWorkoutData(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index)
    }));
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="apple-card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b" style={{borderColor: 'var(--separator)'}}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>
                  {workout ? 'Edit Workout' : 'Add Workout'}
                </h2>
                <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
                  {format(date, 'EEEE, MMM d, yyyy')}
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" style={{color: 'var(--text-secondary)'}} />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{color: 'var(--text-secondary)'}}>
                  Workout Title
                </label>
                <input
                  type="text"
                  value={workoutData.title}
                  onChange={(e) => setWorkoutData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Morning Run, Evening Strength"
                  className="apple-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: 'var(--text-secondary)'}}>
                    Type
                  </label>
                  <select
                    value={workoutData.type}
                    onChange={(e) => setWorkoutData(prev => ({ ...prev, type: e.target.value }))}
                    className="apple-input w-full"
                  >
                    <option value="strength">Strength</option>
                    <option value="cardio">Cardio</option>
                    <option value="climbing">Climbing</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="recovery">Recovery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{color: 'var(--text-secondary)'}}>
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={workoutData.duration_minutes}
                    onChange={(e) => setWorkoutData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    className="apple-input w-full"
                  />
                </div>
              </div>

              {/* Exercises Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium" style={{color: 'var(--text-secondary)'}}>
                    Exercises ({workoutData.exercises.length})
                  </label>
                  <button
                    onClick={() => setShowExerciseSelector(true)}
                    className="apple-button-secondary flex items-center gap-1 text-xs px-3 py-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>

                {workoutData.exercises.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {workoutData.exercises.map((exercise, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-sm" style={{color: 'var(--text-primary)'}}>
                            {exercise.exercise_name}
                          </div>
                          <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                            {exercise.sets} sets
                          </div>
                        </div>
                        <button
                          onClick={() => removeExercise(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 bg-gray-50 rounded-lg">
                    <p className="text-sm" style={{color: 'var(--text-secondary)'}}>
                      No exercises added yet
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{color: 'var(--text-secondary)'}}>
                  Notes
                </label>
                <textarea
                  value={workoutData.notes}
                  onChange={(e) => setWorkoutData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Workout details, exercises, or any notes..."
                  rows={3}
                  className="apple-input w-full resize-none"
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t flex gap-3" style={{borderColor: 'var(--separator)'}}>
            <button onClick={onClose} className="apple-button-secondary flex-1">
              Cancel
            </button>
            <button onClick={handleSave} className="apple-button-primary flex-1">
              {workout ? 'Update Workout' : 'Add Workout'}
            </button>
          </div>
        </div>
      </div>

      {/* Simple Exercise Selector */}
      {showExerciseSelector && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-60">
          <div className="apple-card w-full max-w-lg max-h-96 overflow-hidden">
            <div className="p-4 border-b" style={{borderColor: 'var(--separator)'}}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{color: 'var(--text-primary)'}}>Select Exercise</h3>
                <button onClick={() => setShowExerciseSelector(false)} className="p-1 rounded hover:bg-gray-100">
                  <X className="w-4 h-4" style={{color: 'var(--text-secondary)'}} />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="space-y-2">
                {exercises.map(exercise => (
                  <button
                    key={exercise.id}
                    onClick={() => addExercise(exercise)}
                    className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <div className="font-medium" style={{color: 'var(--text-primary)'}}>{exercise.name}</div>
                    <div className="text-xs" style={{color: 'var(--text-secondary)'}}>
                      {(exercise.discipline || []).join(', ')} • {exercise.muscles?.join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}