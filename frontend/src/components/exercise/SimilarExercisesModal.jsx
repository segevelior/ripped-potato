import React, { useState, useEffect } from "react";
import { X, Search, Filter, ArrowRight, Target, Dumbbell, Clock } from "lucide-react";
import { Exercise } from "@/api/entities";

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

export default function SimilarExercisesModal({ currentExercise, onClose, onReplace }) {
  const [exercises, setExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [intensityFilter, setIntensityFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSimilarExercises();
  }, [currentExercise]);

  const loadSimilarExercises = async () => {
    setIsLoading(true);
    try {
      const allExercises = await Exercise.list();
      
      // Find similar exercises based on multiple criteria
      const similarExercises = allExercises.filter(exercise => {
        if (exercise.id === currentExercise.exercise_id) return false; // Don't include current exercise
        
        // Direct similar exercises list
        const directlySimilar = (currentExercise.similar_exercises || []).includes(exercise.name) ||
                               (exercise.similar_exercises || []).includes(currentExercise.exercise_name);
        
        // Same muscle groups
        const currentMuscles = new Set(currentExercise.muscles || []);
        const exerciseMuscles = new Set(exercise.muscles || []);
        const muscleOverlap = [...currentMuscles].some(muscle => exerciseMuscles.has(muscle));
        
        // Same equipment needs
        const currentEquipment = new Set(currentExercise.equipment || []);
        const exerciseEquipment = new Set(exercise.equipment || []);
        const equipmentMatch = currentEquipment.size === 0 || exerciseEquipment.size === 0 ||
                              [...currentEquipment].some(eq => exerciseEquipment.has(eq));
        
        // Same discipline
        const currentDisciplines = new Set(currentExercise.discipline || []);
        const exerciseDisciplines = new Set(exercise.discipline || []);
        const disciplineMatch = [...currentDisciplines].some(disc => exerciseDisciplines.has(disc));
        
        return directlySimilar || (muscleOverlap && disciplineMatch && equipmentMatch);
      });
      
      setExercises(similarExercises);
    } catch (error) {
      console.error("Error loading similar exercises:", error);
    }
    setIsLoading(false);
  };

  const getSimilarityReason = (exercise) => {
    const reasons = [];
    
    // Check muscle overlap
    const currentMuscles = new Set(currentExercise.muscles || []);
    const exerciseMuscles = new Set(exercise.muscles || []);
    const sharedMuscles = [...currentMuscles].filter(muscle => exerciseMuscles.has(muscle));
    if (sharedMuscles.length > 0) {
      reasons.push(`Same muscles: ${sharedMuscles.join(', ')}`);
    }
    
    // Check equipment
    const currentEquipment = new Set(currentExercise.equipment || []);
    const exerciseEquipment = new Set(exercise.equipment || []);
    const sharedEquipment = [...currentEquipment].filter(eq => exerciseEquipment.has(eq));
    if (sharedEquipment.length > 0) {
      reasons.push(`Same equipment: ${sharedEquipment.join(', ')}`);
    } else if (currentEquipment.size === 0 && exerciseEquipment.size === 0) {
      reasons.push("Both bodyweight");
    }
    
    // Check discipline
    const currentDisciplines = new Set(currentExercise.discipline || []);
    const exerciseDisciplines = new Set(exercise.discipline || []);
    const sharedDisciplines = [...currentDisciplines].filter(disc => exerciseDisciplines.has(disc));
    if (sharedDisciplines.length > 0) {
      reasons.push(`Same discipline: ${sharedDisciplines.join(', ')}`);
    }
    
    return reasons.length > 0 ? reasons[0] : "Similar movement pattern";
  };

  const filteredExercises = exercises.filter(exercise => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEquipment = equipmentFilter === "all" || 
                            (exercise.equipment || []).includes(equipmentFilter) ||
                            (equipmentFilter === "bodyweight" && (exercise.equipment || []).length === 0);
    const matchesIntensity = intensityFilter === "all" || exercise.strain?.intensity === intensityFilter;
    
    return matchesSearch && matchesEquipment && matchesIntensity;
  });

  const allEquipment = [...new Set(exercises.flatMap(ex => ex.equipment || []))];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Replace "{currentExercise.exercise_name}"
              </h2>
              <p className="text-gray-600">
                Find exercises with similar muscle groups, equipment, or movement patterns
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search exercises..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <select
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Equipment</option>
              <option value="bodyweight">Bodyweight Only</option>
              {allEquipment.map(equipment => (
                <option key={equipment} value={equipment}>
                  {equipment.charAt(0).toUpperCase() + equipment.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={intensityFilter}
              onChange={(e) => setIntensityFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Intensities</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>
              ))}
            </div>
          ) : filteredExercises.length > 0 ? (
            <div className="space-y-3">
              {filteredExercises.map(exercise => (
                <div key={exercise.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-gray-900">
                          {exercise.name}
                        </h3>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                      
                      <p className="text-sm text-blue-600 mb-2">
                        {getSimilarityReason(exercise)}
                      </p>
                      
                      <div className="flex flex-wrap gap-2 mb-2">
                        {/* Muscle groups */}
                        {(exercise.muscles || []).slice(0, 3).map(muscle => (
                          <span key={muscle} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {muscle}
                          </span>
                        ))}
                        
                        {/* Equipment */}
                        {(exercise.equipment || []).slice(0, 2).map(equipment => (
                          <span key={equipment} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {equipment}
                          </span>
                        ))}
                        
                        {/* Intensity */}
                        {exercise.strain?.intensity && (
                          <span className={`px-2 py-1 text-xs rounded-full ${intensityColors[exercise.strain.intensity]}`}>
                            {exercise.strain.intensity}
                          </span>
                        )}
                        
                        {/* Load */}
                        {exercise.strain?.load && (
                          <span className={`px-2 py-1 text-xs rounded-full ${loadColors[exercise.strain.load]}`}>
                            {exercise.strain.load}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {exercise.strain?.typical_volume && (
                          <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            {exercise.strain.typical_volume}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Dumbbell className="w-3 h-3" />
                          {(exercise.discipline || []).join(', ')}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => onReplace(exercise)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Target className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Similar Exercises Found</h3>
              <p className="text-gray-600">
                Try adjusting your filters or search terms to find alternatives.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}