import React, { useState, useEffect } from "react";
import { PredefinedWorkout } from "@/api/entities";

export default function PredefinedWorkouts() {
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const workoutData = await PredefinedWorkout.list();
      setPredefinedWorkouts(workoutData || []);
    } catch (error) {
      console.error("Error loading predefined workouts:", error);
      setPredefinedWorkouts([]);
    }
    setIsLoading(false);
  };
  
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
        <p className="text-lg text-gray-600">
          Found {predefinedWorkouts.length} workouts
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {predefinedWorkouts.map((workout) => (
          <div key={workout.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h3 className="font-bold text-xl text-gray-900 mb-2">
              {workout.name || 'Unnamed Workout'}
            </h3>
            
            {workout.type && (
              <div className="flex gap-2 mb-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  {workout.type}
                </span>
                {workout.difficulty_level && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    {workout.difficulty_level}
                  </span>
                )}
                {workout.duration_minutes && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                    {workout.duration_minutes} min
                  </span>
                )}
              </div>
            )}
            
            {workout.goal && (
              <p className="text-gray-600 text-sm mb-2">
                {workout.goal}
              </p>
            )}
            
            {workout.description && (
              <p className="text-gray-500 text-xs">
                {workout.description}
              </p>
            )}
            
            <div className="border-t mt-4 pt-4">
              <div className="text-sm text-gray-600">
                {workout.exercises?.length || 0} exercises
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}