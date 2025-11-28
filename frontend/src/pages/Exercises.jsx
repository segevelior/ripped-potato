
import React, { useState, useEffect } from "react";
import { Exercise } from "@/api/entities";
import { Plus, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import CustomizeExerciseModal from "@/components/exercise/CustomizeExerciseModal";
import ExerciseDetailModal from "@/components/exercise/ExerciseDetailModal";
import ExerciseCard from "@/components/exercise/ExerciseCard";
import { getDisciplineClass } from "@/styles/designTokens";

export default function Exercises() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [customizeExercise, setCustomizeExercise] = useState(null);
  const [viewExercise, setViewExercise] = useState(null);

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
      setCustomizeExercise(exercise);
    } else {
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

      // Optimistic update for viewExercise if open
      if (viewExercise && viewExercise.id === exercise.id) {
        setViewExercise(prev => ({
          ...prev,
          userMetadata: {
            ...prev.userMetadata,
            isFavorite: newFavoriteStatus
          }
        }));
      }

      await Exercise.toggleFavorite(exercise.id, newFavoriteStatus);
      loadExercises();
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const handleDeleteExercise = async (exercise) => {
    try {
      await Exercise.delete(exercise.id);
      await loadExercises();
    } catch (error) {
      console.error("Error deleting exercise:", error);
    }
  };

  // Get unique disciplines for filter
  const disciplines = ["all", ...new Set(exercises.flatMap(ex => ex.discipline || []))];

  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exercise.description || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDiscipline = selectedDiscipline === "all" ||
      (exercise.discipline || []).includes(selectedDiscipline);

    let matchesType = true;
    if (selectedType === "favorites") {
      matchesType = exercise.userMetadata?.isFavorite;
    } else if (selectedType === "personal") {
      matchesType = !exercise.isCommon || exercise.isModified;
    } else if (selectedType === "common") {
      matchesType = exercise.isCommon && !exercise.isModified;
    }

    return matchesSearch && matchesDiscipline && matchesType;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Exercise Library</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-[#FE755D] rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading exercises...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Exercise Library</h1>
          <p className="text-base text-gray-600 mt-1">
            {filteredExercises.length} exercise{filteredExercises.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <Link to={createPageUrl("CreateExercise")}>
          <button className="hidden md:flex bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold items-center gap-2 transition-colors shadow-lg shadow-gray-900/10">
            <Plus className="w-5 h-5" />
            Add Exercise
          </button>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search exercises..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#FE755D] focus:border-transparent transition-all text-base"
        />
      </div>

      {/* Type Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'all', label: 'All' },
          { id: 'favorites', label: 'Favorites' },
          { id: 'personal', label: 'Personal' },
          { id: 'common', label: 'Common' }
        ].map((type) => (
          <button
            key={type.id}
            onClick={() => setSelectedType(type.id)}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${selectedType === type.id
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Horizontal Discipline Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {disciplines.map((discipline) => (
          <button
            key={discipline}
            onClick={() => setSelectedDiscipline(discipline)}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${selectedDiscipline === discipline
              ? `${getDisciplineClass(discipline)} text-white shadow-md`
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
          >
            {discipline === 'all' ? 'All Disciplines' : discipline.charAt(0).toUpperCase() + discipline.slice(1)}
          </button>
        ))}
      </div>

      {/* Exercise Grid */}
      {filteredExercises.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExercises.map(exercise => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              onClick={setViewExercise}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDeleteExercise}
              onEdit={handleEditExercise}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No exercises found</h3>
          <p className="text-gray-600 mb-6">
            Try adjusting your search or filters to find exercises.
          </p>
          <Link to={createPageUrl("CreateExercise")}>
            <button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-colors">
              <Plus className="w-5 h-5" />
              Add Your First Exercise
            </button>
          </Link>
        </div>
      )}

      {/* Floating Action Button (Mobile) */}
      <Link to={createPageUrl("CreateExercise")}>
        <button
          className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      </Link>

      {/* Customize Exercise Modal */}
      {customizeExercise && (
        <CustomizeExerciseModal
          exercise={customizeExercise}
          isOpen={!!customizeExercise}
          onClose={() => setCustomizeExercise(null)}
          onSave={handleCustomizeSave}
        />
      )}

      {/* Exercise Detail Modal */}
      {viewExercise && (
        <ExerciseDetailModal
          exercise={viewExercise}
          onClose={() => setViewExercise(null)}
          onEdit={handleEditExercise}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteExercise}
        />
      )}
    </div>
  );
}
