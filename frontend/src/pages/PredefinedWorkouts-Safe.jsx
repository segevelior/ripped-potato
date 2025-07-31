import React, { useState, useEffect } from "react";
import { PredefinedWorkout } from "@/api/entities";
import { Target } from "lucide-react";

export default function PredefinedWorkouts() {
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    console.log("PredefinedWorkouts: Starting to load data");
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("PredefinedWorkouts: Calling PredefinedWorkout.list()");
      const workoutData = await PredefinedWorkout.list();
      console.log("PredefinedWorkouts: Received data:", workoutData);
      
      // Ensure we have an array
      const workouts = Array.isArray(workoutData) ? workoutData : [];
      setPredefinedWorkouts(workouts);
    } catch (error) {
      console.error("Error loading predefined workouts:", error);
      setError(error.message || "Failed to load workouts");
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
        <div className="bg-red-50 p-4 rounded-lg">
          <p className="text-red-800">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
        <p className="text-gray-600">Loading workouts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
        <p className="text-lg text-gray-600 mt-2">
          Found {predefinedWorkouts.length} workout templates.
        </p>
      </div>

      {predefinedWorkouts.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {predefinedWorkouts.map((workout, index) => {
            // Safely access properties
            const workoutId = workout?.id || `workout-${index}`;
            const workoutName = workout?.name || workout?.title || 'Unnamed Workout';
            const workoutGoal = workout?.goal || workout?.description || 'No description';
            const workoutType = workout?.type || 'general';
            const duration = workout?.duration_minutes || 45;
            
            return (
              <div key={workoutId} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="font-bold text-xl text-gray-900 mb-2">
                  {workoutName}
                </h3>
                <p className="text-gray-600 mb-4">
                  {workoutGoal}
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{workoutType}</span>
                  <span>•</span>
                  <span>{duration} min</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
          <Target className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-xl font-semibold mb-2 text-gray-900">No Workouts Found</h3>
          <p className="text-gray-600">
            No predefined workouts are available yet.
          </p>
        </div>
      )}
    </div>
  );
}