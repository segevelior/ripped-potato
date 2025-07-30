import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, Target, TrendingUp } from "lucide-react";
import { Exercise } from "@/api/entities";

const difficultyColors = {
  1: "bg-green-100 text-green-800",
  2: "bg-green-200 text-green-800",
  3: "bg-yellow-100 text-yellow-800",
  4: "bg-yellow-200 text-yellow-800",
  5: "bg-orange-100 text-orange-800",
  6: "bg-orange-200 text-orange-800",
  7: "bg-red-100 text-red-800",
  8: "bg-red-200 text-red-800",
  9: "bg-purple-100 text-purple-800",
  10: "bg-purple-200 text-purple-800"
};

export default function ProgressionNavigator({ currentExercise, onNavigate }) {
  const [progressionChain, setProgressionChain] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProgressionChain();
  }, [currentExercise]);

  const loadProgressionChain = async () => {
    if (!currentExercise.progression_group) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const allExercises = await Exercise.list();
      
      // Find all exercises in the same progression group
      const chainExercises = allExercises
        .filter(ex => ex.progression_group === currentExercise.progression_group)
        .sort((a, b) => (a.progression_level || 0) - (b.progression_level || 0));
      
      setProgressionChain(chainExercises);
      
      // Find current exercise index
      const index = chainExercises.findIndex(ex => ex.name === currentExercise.exercise_name);
      setCurrentIndex(index);
    } catch (error) {
      console.error("Error loading progression chain:", error);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
          <div className="h-4 bg-gray-200 rounded flex-1"></div>
          <div className="h-4 bg-gray-200 rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (!currentExercise.progression_group || progressionChain.length === 0) {
    return null;
  }

  const previousExercise = currentIndex > 0 ? progressionChain[currentIndex - 1] : null;
  const nextExercise = currentIndex < progressionChain.length - 1 ? progressionChain[currentIndex + 1] : null;
  const currentInChain = progressionChain[currentIndex];

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          {currentExercise.progression_group.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Progression
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Level</span>
          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
            difficultyColors[currentInChain?.progression_level || 1] || 'bg-gray-100 text-gray-800'
          }`}>
            {currentInChain?.progression_level || 1}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Previous Exercise */}
        <div className="text-left">
          {previousExercise ? (
            <button
              onClick={() => onNavigate(previousExercise)}
              className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-2 mb-2">
                <ChevronLeft className="w-4 h-4 text-green-600 group-hover:text-green-700" />
                <span className="text-xs font-medium text-green-600 group-hover:text-green-700">Easier</span>
              </div>
              <div className="font-medium text-sm text-gray-900 truncate">
                {previousExercise.name}
              </div>
              <div className="text-xs text-gray-500">
                Level {previousExercise.progression_level || 1}
              </div>
            </button>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg opacity-50">
              <div className="flex items-center gap-2 mb-2">
                <ChevronLeft className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-400">Easier</span>
              </div>
              <div className="text-sm text-gray-400">
                Starting level
              </div>
            </div>
          )}
        </div>

        {/* Current Exercise */}
        <div className="text-center">
          <div className="p-3 bg-blue-100 border-2 border-blue-300 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ArrowUp className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-medium text-blue-700">Current</span>
            </div>
            <div className="font-bold text-sm text-blue-900 truncate">
              {currentInChain?.name || currentExercise.exercise_name}
            </div>
            <div className="text-xs text-blue-600">
              Level {currentInChain?.progression_level || 1}
            </div>
          </div>
        </div>

        {/* Next Exercise */}
        <div className="text-right">
          {nextExercise ? (
            <button
              onClick={() => onNavigate(nextExercise)}
              className="w-full p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-all text-right group"
            >
              <div className="flex items-center justify-end gap-2 mb-2">
                <span className="text-xs font-medium text-orange-600 group-hover:text-orange-700">Harder</span>
                <ChevronRight className="w-4 h-4 text-orange-600 group-hover:text-orange-700" />
              </div>
              <div className="font-medium text-sm text-gray-900 truncate">
                {nextExercise.name}
              </div>
              <div className="text-xs text-gray-500">
                Level {nextExercise.progression_level || 1}
              </div>
            </button>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg opacity-50">
              <div className="flex items-center justify-end gap-2 mb-2">
                <span className="text-xs font-medium text-gray-400">Harder</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-sm text-gray-400">
                Max level
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Progression Chain</span>
          <span>{currentIndex + 1} of {progressionChain.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / progressionChain.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}