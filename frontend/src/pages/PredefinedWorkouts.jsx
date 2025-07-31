import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";

export default function PredefinedWorkouts() {
  console.log("PredefinedWorkouts page loaded");
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    console.log("useEffect triggered");
    loadData();
  }, []);

  const loadData = async () => {
    console.log("loadData called");
    setIsLoading(true);
    try {
      console.log("About to call PredefinedWorkout.list()");
      const workoutData = await PredefinedWorkout.list();
      console.log("Workout data received:", workoutData);
      setPredefinedWorkouts(workoutData || []);
    } catch (error) {
      console.error("Error loading predefined workouts:", error);
    }
    setIsLoading(false);
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
      <p className="text-lg text-gray-600">
        {isLoading ? "Loading..." : `Found ${predefinedWorkouts.length} workouts`}
      </p>
      
      {!isLoading && (
        <div className="space-y-4">
          {predefinedWorkouts.map((workout, index) => (
            <div key={workout.id || index} className="p-4 bg-white rounded-lg shadow">
              <h3 className="font-bold">{workout.name || workout.title || 'Unnamed'}</h3>
              <p className="text-gray-600">{workout.description || 'No description'}</p>
              <p className="text-sm text-gray-500">Type: {workout.type || 'Unknown'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}