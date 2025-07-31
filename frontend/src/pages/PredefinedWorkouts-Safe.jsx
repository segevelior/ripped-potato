import React from "react";

export default function PredefinedWorkouts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
        <p className="text-lg text-gray-600 mt-2">
          This page is temporarily disabled due to data structure issues.
        </p>
        <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h2 className="text-lg font-semibold text-yellow-800">Under Maintenance</h2>
          <p className="mt-2 text-yellow-700">
            We're fixing the workout templates. Please check back later.
          </p>
        </div>
      </div>
    </div>
  );
}