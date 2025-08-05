
import React, { useState, useEffect } from "react";
import { Exercise } from "@/api/entities";
import { Plus, Search, Filter, Edit, Trash2, Dumbbell, Target, Zap, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ExerciseBadges from "@/components/exercise/ExerciseBadges";
import ExerciseFilters from "@/components/exercise/ExerciseFilters";
import CustomizeExerciseModal from "@/components/exercise/CustomizeExerciseModal";

const intensityColors = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  max: "bg-red-100 text-red-800"
};

const loadColors = {
  bodyweight: "bg-blue-100 text-blue-800",
  light: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  heavy: "bg-red-100 text-red-800"
};

export default function Exercises() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [intensityFilter, setIntensityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [customizeExercise, setCustomizeExercise] = useState(null);

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    setIsLoading(true);
    try {
      const exerciseData = await Exercise.list();
      setExercises(exerciseData);
    } catch (error) {
      console.error("Error loading exercises:", error);
    }
    setIsLoading(false);
  };

  const handleEditExercise = (exercise) => {
    if (exercise.isCommon) {
      // For ALL common exercises (modified or not), use customize modal
      setCustomizeExercise(exercise);
    } else {
      // For private exercises only, go to direct edit page
      navigate(createPageUrl(`CreateExercise?edit=${exercise.id}`));
    }
  };

  const handleCustomizeSave = async (data) => {
    try {
      await Exercise.customize(customizeExercise.id, data);
      setCustomizeExercise(null);
      loadExercises();
    } catch (error) {
      console.error("Error customizing exercise:", error);
      alert("Error customizing exercise. Please try again.");
    }
  };

  const handleToggleFavorite = async (exercise) => {
    try {
      const currentlyFavorited = exercise.userMetadata?.isFavorite || false;
      const newFavoriteStatus = !currentlyFavorited;
      
      await Exercise.toggleFavorite(exercise.id, newFavoriteStatus);
      loadExercises();
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const handleRemoveCustomization = async (exercise) => {
    if (!confirm("Remove all customizations and revert to the original exercise?")) {
      return;
    }
    
    try {
      await Exercise.removeCustomization(exercise.id);
      loadExercises();
    } catch (error) {
      console.error("Error removing customization:", error);
      alert("Error removing customization. Please try again.");
    }
  };

  const handleDeleteExercise = async (exercise) => {
    // Can only delete private exercises
    if (exercise.isCommon) {
      alert("Common exercises cannot be deleted. You can customize them instead.");
      return;
    }
    
    if (!confirm(`Are you sure you want to delete "${exercise.name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await Exercise.delete(exercise.id);
      loadExercises();
      alert("Exercise deleted successfully!");
    } catch (error) {
      console.error("Error deleting exercise:", error);
      alert("Error deleting exercise. Please try again.");
    }
  };

  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (exercise.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDiscipline = disciplineFilter === "all" || 
                             (exercise.discipline || []).includes(disciplineFilter);
    
    const matchesMuscle = muscleFilter === "all" || 
                         (exercise.muscles || []).includes(muscleFilter);
    
    const matchesIntensity = intensityFilter === "all" || 
                            exercise.strain?.intensity === intensityFilter;
    
    // Type filter logic
    let matchesType = true;
    if (typeFilter === "common") {
      matchesType = exercise.isCommon && !exercise.isModified;
    } else if (typeFilter === "private") {
      matchesType = !exercise.isCommon;
    } else if (typeFilter === "modified") {
      matchesType = exercise.isModified;
    } else if (typeFilter === "favorites") {
      matchesType = exercise.userMetadata?.isFavorite;
    }
    
    return matchesSearch && matchesDiscipline && matchesMuscle && matchesIntensity && matchesType;
  });

  // Calculate counts for filters
  const filterCounts = {
    all: exercises.length,
    common: exercises.filter(e => e.isCommon && !e.isModified).length,
    private: exercises.filter(e => !e.isCommon).length,
    modified: exercises.filter(e => e.isModified).length,
    favorites: exercises.filter(e => e.userMetadata?.isFavorite).length
  };

  const disciplines = [...new Set(exercises.flatMap(ex => ex.discipline || []))];
  const muscles = [...new Set(exercises.flatMap(ex => ex.muscles || []))];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-64"></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-200 h-64 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Exercise Library</h1>
          <p className="text-lg text-gray-600">
            Browse, manage, and create exercises for your workouts.
          </p>
        </div>
        <Link to={createPageUrl("CreateExercise")}>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Plus className="w-5 h-5" />
            Add Exercise
          </button>
        </Link>
      </div>

      {/* Type Filters */}
      <div className="flex justify-center">
        <ExerciseFilters 
          activeFilter={typeFilter}
          onFilterChange={setTypeFilter}
          counts={filterCounts}
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
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
              value={muscleFilter}
              onChange={(e) => setMuscleFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Muscles</option>
              {muscles.map(muscle => (
                <option key={muscle} value={muscle}>
                  {muscle.charAt(0).toUpperCase() + muscle.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>

            <select
              value={intensityFilter}
              onChange={(e) => setIntensityFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Intensities</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredExercises.length} of {exercises.length} exercises
        </div>
      </div>

      {/* Exercise Grid */}
      {filteredExercises.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map(exercise => (
            <div key={exercise.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-xl text-gray-900 leading-tight">
                      {exercise.name}
                    </h3>
                    <button
                      onClick={() => handleToggleFavorite(exercise)}
                      className={`p-2 rounded-lg transition-colors ${
                        exercise.userMetadata?.isFavorite 
                          ? 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50' 
                          : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50'
                      }`}
                      title="Toggle favorite"
                    >
                      <Star className="w-4 h-4" fill={exercise.userMetadata?.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <ExerciseBadges exercise={exercise} />
                </div>
              </div>
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => handleEditExercise(exercise)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title={exercise.isCommon && !exercise.isModified ? "Customize exercise" : "Edit exercise"}
                >
                  <Edit className="w-4 h-4" />
                </button>
                {exercise.isModified && (
                  <button
                    onClick={() => handleRemoveCustomization(exercise)}
                    className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                    title="Remove customization"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
                {!exercise.isCommon && (
                  <button
                    onClick={() => handleDeleteExercise(exercise)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete exercise"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Exercise Tags */}
              <div className="space-y-3 mb-4">
                {/* Disciplines */}
                <div className="flex flex-wrap gap-1">
                  {(exercise.discipline || []).map((disc, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                      {disc}
                    </span>
                  ))}
                </div>

                {/* Muscles */}
                <div className="flex flex-wrap gap-1">
                  {(exercise.muscles || []).slice(0, 4).map((muscle, i) => (
                    <span key={i} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      {muscle.replace('_', ' ')}
                    </span>
                  ))}
                  {exercise.muscles?.length > 4 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      +{exercise.muscles.length - 4} more
                    </span>
                  )}
                </div>

                {/* Equipment */}
                {exercise.equipment && exercise.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {exercise.equipment.slice(0, 3).map((eq, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                        {eq}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Strain Information */}
              {exercise.strain && (
                <div className="space-y-2 mb-4">
                  <div className="flex gap-2">
                    {exercise.strain.intensity && (
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${intensityColors[exercise.strain.intensity]}`}>
                        {exercise.strain.intensity} intensity
                      </span>
                    )}
                    {exercise.strain.load && (
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${loadColors[exercise.strain.load]}`}>
                        {exercise.strain.load}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-600 space-y-1">
                    {exercise.strain.duration_type && (
                      <div>Measured by: <strong>{exercise.strain.duration_type}</strong></div>
                    )}
                    {exercise.strain.typical_volume && (
                      <div>Typical volume: <strong>{exercise.strain.typical_volume}</strong></div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {exercise.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {exercise.description}
                </p>
              )}

              {/* Progression info if available */}
              {exercise.progression_group && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-indigo-600 font-medium">
                    Part of {exercise.progression_group} (Level {exercise.progression_level || 'N/A'})
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Dumbbell className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-900">No Exercises Found</h3>
          <p className="text-gray-600 mb-6">
            Try adjusting your search or filters to find exercises.
          </p>
          <Link to={createPageUrl("CreateExercise")}>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium">
              Add Your First Exercise
            </button>
          </Link>
        </div>
      )}

      {/* Customize Exercise Modal */}
      {customizeExercise && (
        <CustomizeExerciseModal
          exercise={customizeExercise}
          isOpen={!!customizeExercise}
          onClose={() => setCustomizeExercise(null)}
          onSave={handleCustomizeSave}
        />
      )}
    </div>
  );
}
