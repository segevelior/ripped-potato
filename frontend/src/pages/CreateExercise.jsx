import React, { useState, useEffect, useCallback, useRef } from "react";
import { Exercise } from "@/api/entities";
import { ArrowLeft, Save, Plus, X, Sparkles, Check, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { aiService } from "@/services/aiService";

const disciplines = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"];
const muscles = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "hip_flexors", "glutes", "quads", "hamstrings", "calves", "full_body"];
const intensityLevels = ["low", "moderate", "high", "max"];
const loadTypes = ["bodyweight", "light", "moderate", "heavy"];
const durationTypes = ["reps", "time", "distance"];

// Convert string to title case: "dragon flag" -> "Dragon Flag"
const toTitleCase = (str) => {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Inline AI suggestion button component
function AISuggestionButton({ hasSuggestion, applied, onApply, loading, preview }) {
  // Priority: Applied > Has Suggestion > Loading > Nothing
  // This ensures buttons appear as soon as their field arrives during streaming
  if (applied) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium">
        <Check className="w-3.5 h-3.5" />
        Sensei Applied
      </div>
    );
  }

  if (hasSuggestion) {
    return (
      <button
        onClick={onApply}
        title={preview ? `Preview: ${preview}` : undefined}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg text-xs font-medium transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Apply Sensei Suggestion
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Thinking...</span>
      </div>
    );
  }

  return null;
}

// Preview text component for showing AI suggestion as grey placeholder
function AIPreviewText({ suggestion, currentValue, applied }) {
  if (applied || currentValue || !suggestion) return null;

  return (
    <div className="mt-1.5 text-xs text-gray-400 italic flex items-center gap-1.5">
      <Sparkles className="w-3 h-3" />
      <span className="line-clamp-2">{suggestion}</span>
    </div>
  );
}

export default function CreateExercise() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // AI suggestion state
  const [suggestions, setSuggestions] = useState(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [appliedFields, setAppliedFields] = useState({});
  const [suggestionsStale, setSuggestionsStale] = useState(false); // True when name changed after fetch
  const debounceTimeoutRef = useRef(null);
  const lastFetchedNameRef = useRef("");
  const abortStreamRef = useRef(null);

  // Existing exercises search state
  const [existingExercises, setExistingExercises] = useState([]);
  const [matchingExercises, setMatchingExercises] = useState([]);
  const [selectedExistingExercise, setSelectedExistingExercise] = useState(null);

  // Load existing exercises on mount
  useEffect(() => {
    const loadExercises = async () => {
      try {
        const exercises = await Exercise.list();
        setExistingExercises(exercises || []);
      } catch (error) {
        console.error('Failed to load existing exercises:', error);
      }
    };
    loadExercises();
  }, []);

  const [exercise, setExercise] = useState({
    name: "",
    discipline: [],
    muscles: [],
    equipment: [],
    strain: {
      intensity: "",
      load: "",
      duration_type: "",
      typical_volume: ""
    },
    similar_exercises: [],
    progression_group: "",
    progression_level: null,
    next_progression: "",
    previous_progression: "",
    description: ""
  });
  const [newEquipment, setNewEquipment] = useState("");
  const [newSimilarExercise, setNewSimilarExercise] = useState("");

  // Fetch AI suggestions when name changes (debounced) - using streaming
  const fetchSuggestions = useCallback((name) => {
    if (!name || name.length < 3) {
      setSuggestions(null);
      setSuggestionsStale(false);
      lastFetchedNameRef.current = "";
      return;
    }

    // Abort any existing stream
    if (abortStreamRef.current) {
      abortStreamRef.current();
    }

    setIsLoadingSuggestions(true);
    setSuggestionsStale(false);
    setSuggestions({}); // Start with empty object for progressive updates
    setAppliedFields({}); // Reset applied fields when new suggestions arrive

    // Start streaming
    abortStreamRef.current = aiService.streamSuggestExercise(
      name,
      // onField - called for each field as it arrives
      (field, value) => {
        setSuggestions(prev => ({ ...prev, [field]: value }));
      },
      // onComplete
      () => {
        setIsLoadingSuggestions(false);
        lastFetchedNameRef.current = name;
      },
      // onError
      (error) => {
        console.error('Failed to fetch suggestions:', error);
        setSuggestions(null);
        setIsLoadingSuggestions(false);
      }
    );
  }, []);

  // Debounced name change handler
  const handleNameChange = useCallback((value) => {
    setExercise(prev => ({ ...prev, name: value }));

    // Search for matching existing exercises
    if (value && value.length >= 2) {
      const searchTerm = value.toLowerCase();
      const matches = existingExercises.filter(ex =>
        ex.name?.toLowerCase().includes(searchTerm) ||
        ex.similar_exercises?.some(s => s.toLowerCase().includes(searchTerm))
      ).slice(0, 5); // Limit to 5 matches
      setMatchingExercises(matches);
    } else {
      setMatchingExercises([]);
    }

    // Mark suggestions as stale if name changed significantly
    if (lastFetchedNameRef.current && value !== lastFetchedNameRef.current) {
      setSuggestionsStale(true);
    }

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new debounced fetch (800ms to give more time for typing)
    debounceTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 800);
  }, [fetchSuggestions, existingExercises]);

  // Cleanup timeout and stream on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortStreamRef.current) {
        abortStreamRef.current();
      }
    };
  }, []);

  // Apply a single suggestion field
  const applySuggestion = (field, value) => {
    if (field === 'strain' && value) {
      setExercise(prev => ({
        ...prev,
        strain: {
          intensity: value.intensity || prev.strain.intensity || "",
          load: value.load || prev.strain.load || "",
          duration_type: value.duration_type || prev.strain.duration_type || "",
          typical_volume: value.typical_volume || prev.strain.typical_volume || ""
        }
      }));
    } else {
      setExercise(prev => ({ ...prev, [field]: value }));
    }
    setAppliedFields(prev => ({ ...prev, [field]: true }));
  };

  // Apply all suggestions at once
  const applyAllSuggestions = () => {
    if (!suggestions) return;

    const newExercise = { ...exercise };
    const newApplied = {};

    if (suggestions.description) {
      newExercise.description = suggestions.description;
      newApplied.description = true;
    }
    if (suggestions.muscles?.length > 0) {
      newExercise.muscles = suggestions.muscles;
      newApplied.muscles = true;
    }
    if (suggestions.discipline?.length > 0) {
      newExercise.discipline = suggestions.discipline;
      newApplied.discipline = true;
    }
    if (suggestions.equipment?.length > 0) {
      newExercise.equipment = suggestions.equipment;
      newApplied.equipment = true;
    }
    if (suggestions.similar_exercises?.length > 0) {
      newExercise.similar_exercises = suggestions.similar_exercises;
      newApplied.similar_exercises = true;
    }
    if (suggestions.strain) {
      newExercise.strain = {
        intensity: suggestions.strain.intensity || exercise.strain.intensity || "",
        load: suggestions.strain.load || exercise.strain.load || "",
        duration_type: suggestions.strain.duration_type || exercise.strain.duration_type || "",
        typical_volume: suggestions.strain.typical_volume || exercise.strain.typical_volume || ""
      };
      newApplied.strain = true;
    }

    setExercise(newExercise);
    setAppliedFields(newApplied);
  };

  useEffect(() => {
    // Check if we're editing an existing exercise
    const urlParams = new URLSearchParams(location.search);
    const editId = urlParams.get('edit');
    if (editId) {
      setIsEditing(true);
      setEditingId(editId);
      loadExerciseForEditing(editId);
    }
  }, [location.search]);

  const loadExerciseForEditing = async (id) => {
    try {
      const exerciseToEdit = await Exercise.get(id);
      setExercise({
        ...exerciseToEdit,
        discipline: exerciseToEdit.discipline || [],
        muscles: exerciseToEdit.muscles || [],
        equipment: exerciseToEdit.equipment || [],
        similar_exercises: exerciseToEdit.similar_exercises || [],
        strain: {
          intensity: exerciseToEdit.strain?.intensity || "",
          load: exerciseToEdit.strain?.load || "",
          duration_type: exerciseToEdit.strain?.duration_type || "",
          typical_volume: exerciseToEdit.strain?.typical_volume || ""
        }
      });
    } catch (error) {
      console.error("Error loading exercise for editing:", error);
      alert("Error loading exercise. Redirecting to create new exercise.");
      navigate(createPageUrl("CreateExercise"));
    }
  };

  const handleChange = (field, value) => {
    setExercise(prev => ({ ...prev, [field]: value }));
  };

  const handleStrainChange = (field, value) => {
    setExercise(prev => ({
      ...prev,
      strain: { ...prev.strain, [field]: value }
    }));
  };

  const addEquipment = () => {
    if (newEquipment.trim() && !exercise.equipment.includes(newEquipment.trim())) {
      setExercise(prev => ({
        ...prev,
        equipment: [...prev.equipment, newEquipment.trim()]
      }));
      setNewEquipment("");
    }
  };

  const removeEquipment = (equipment) => {
    setExercise(prev => ({
      ...prev,
      equipment: prev.equipment.filter(eq => eq !== equipment)
    }));
  };

  const addSimilarExercise = () => {
    if (newSimilarExercise.trim() && !exercise.similar_exercises.includes(newSimilarExercise.trim())) {
      setExercise(prev => ({
        ...prev,
        similar_exercises: [...prev.similar_exercises, newSimilarExercise.trim()]
      }));
      setNewSimilarExercise("");
    }
  };

  const removeSimilarExercise = (exerciseName) => {
    setExercise(prev => ({
      ...prev,
      similar_exercises: prev.similar_exercises.filter(ex => ex !== exerciseName)
    }));
  };

  const handleSave = async () => {
    if (!exercise.name.trim()) {
      alert("Exercise name is required.");
      return;
    }

    setIsSaving(true);
    try {
      // Apply title case to the exercise name before saving
      const exerciseToSave = {
        ...exercise,
        name: toTitleCase(exercise.name.trim())
      };

      if (isEditing && editingId) {
        await Exercise.update(editingId, exerciseToSave);
        alert("Exercise updated successfully!");
      } else {
        await Exercise.create(exerciseToSave);
        alert("Exercise created successfully!");
      }
      navigate(createPageUrl("Exercises"));
    } catch (error) {
      console.error("Failed to save exercise:", error);
      alert("Failed to save exercise. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const hasSuggestions = suggestions && Object.keys(suggestions).length > 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditing ? 'Edit Exercise' : 'Create Exercise'}
          </h1>
          <p className="text-base text-gray-600 mt-1">
            {isEditing ? 'Modify the exercise details.' : 'Add a new exercise to your library.'}
          </p>
        </div>
        {hasSuggestions && !suggestionsStale && (
          <button
            onClick={applyAllSuggestions}
            className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-orange-500/20"
          >
            <Sparkles className="w-4 h-4" />
            Apply All Sensei Suggestions
          </button>
        )}
        {suggestionsStale && (
          <div className="hidden md:flex items-center gap-2 px-4 py-2.5 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Updating...
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h2>
            <div className="space-y-4">
              {/* Exercise Name */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Exercise Name</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g., Pull-ups, Squats, Deadlifts"
                    value={exercise.name}
                    onChange={e => handleNameChange(e.target.value)}
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-base"
                  />
                  {isLoadingSuggestions && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                    </div>
                  )}
                </div>
                {/* Suggested proper name */}
                {suggestions?.suggested_name &&
                 suggestions.suggested_name.toLowerCase() !== exercise.name.toLowerCase() &&
                 !suggestionsStale && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-gray-500">Did you mean:</span>
                    <button
                      onClick={() => setExercise(prev => ({ ...prev, name: suggestions.suggested_name }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium rounded-lg border border-orange-200 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {suggestions.suggested_name}
                    </button>
                  </div>
                )}
                {/* Matching existing exercises */}
                {matchingExercises.length > 0 && !isEditing && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
                      <AlertCircle className="w-4 h-4" />
                      Similar exercises already exist:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {matchingExercises.map((ex) => (
                        <button
                          key={ex.id}
                          onClick={() => setSelectedExistingExercise(selectedExistingExercise?.id === ex.id ? null : ex)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all ${
                            selectedExistingExercise?.id === ex.id
                              ? 'bg-amber-200 text-amber-900 border border-amber-400'
                              : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {ex.name}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                    {/* Show details of selected existing exercise */}
                    {selectedExistingExercise && (
                      <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-gray-900">{selectedExistingExercise.name}</h4>
                          <button
                            onClick={() => navigate(createPageUrl("CreateExercise") + `?edit=${selectedExistingExercise.id}`)}
                            className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg transition-colors"
                          >
                            Edit this instead
                          </button>
                        </div>
                        {selectedExistingExercise.description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{selectedExistingExercise.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {selectedExistingExercise.discipline?.map((d, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{d}</span>
                          ))}
                          {selectedExistingExercise.muscles?.slice(0, 3).map((m, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{m.replace('_', ' ')}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <AISuggestionButton
                    hasSuggestion={suggestions?.description && !suggestionsStale}
                    applied={appliedFields.description}
                    onApply={() => applySuggestion('description', suggestions.description)}
                    loading={isLoadingSuggestions}
                    preview={suggestions?.description?.slice(0, 50) + '...'}
                  />
                </div>
                <textarea
                  placeholder={!exercise.description && suggestions?.description && !suggestionsStale && !appliedFields.description
                    ? suggestions.description
                    : "Describe the exercise, technique tips, or variations..."}
                  value={exercise.description}
                  onChange={e => handleChange('description', e.target.value)}
                  className={`w-full px-4 py-3.5 bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all text-base h-28 resize-none ${
                    appliedFields.description ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200'
                  } ${!exercise.description && suggestions?.description && !suggestionsStale && !appliedFields.description ? 'placeholder:text-orange-400 placeholder:italic' : ''}`}
                />
                <AIPreviewText
                  suggestion={suggestions?.description}
                  currentValue={exercise.description}
                  applied={appliedFields.description || suggestionsStale}
                />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Classification</h2>
            <div className="space-y-5">
              {/* Disciplines */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Disciplines</label>
                  <AISuggestionButton
                    hasSuggestion={suggestions?.discipline?.length > 0 && !suggestionsStale}
                    applied={appliedFields.discipline}
                    onApply={() => applySuggestion('discipline', suggestions.discipline)}
                    loading={isLoadingSuggestions}
                    preview={suggestions?.discipline?.join(', ')}
                  />
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl transition-colors ${
                  appliedFields.discipline ? 'bg-emerald-50/50 border border-emerald-200' : 'bg-gray-50'
                }`}>
                  {disciplines.map(discipline => {
                    const isSelected = exercise.discipline.includes(discipline);
                    const isSuggested = suggestions?.discipline?.includes(discipline) && !suggestionsStale && !appliedFields.discipline;
                    const isAIApplied = appliedFields.discipline && isSelected;

                    return (
                    <label
                      key={discipline}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? isAIApplied
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-gray-900 text-white shadow-md'
                          : isSuggested
                            ? 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-2 border-orange-300'
                            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={exercise.discipline.includes(discipline)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleChange('discipline', [...exercise.discipline, discipline]);
                          } else {
                            handleChange('discipline', exercise.discipline.filter(d => d !== discipline));
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium capitalize">{discipline}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 ml-auto" />
                      )}
                      {isSuggested && !isSelected && (
                        <Sparkles className="w-3.5 h-3.5 ml-auto text-orange-400" />
                      )}
                    </label>
                    );
                  })}
                </div>
              </div>

              {/* Target Muscles */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Target Muscles</label>
                  <AISuggestionButton
                    hasSuggestion={suggestions?.muscles?.length > 0 && !suggestionsStale}
                    applied={appliedFields.muscles}
                    onApply={() => applySuggestion('muscles', suggestions.muscles)}
                    loading={isLoadingSuggestions}
                    preview={suggestions?.muscles?.map(m => m.replace('_', ' ')).join(', ')}
                  />
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl transition-colors ${
                  appliedFields.muscles ? 'bg-emerald-50/50 border border-emerald-200' : 'bg-gray-50'
                }`}>
                  {muscles.map(muscle => {
                    const isSelected = exercise.muscles.includes(muscle);
                    const isSuggested = suggestions?.muscles?.includes(muscle) && !suggestionsStale && !appliedFields.muscles;
                    const isAIApplied = appliedFields.muscles && isSelected;

                    return (
                    <label
                      key={muscle}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? isAIApplied
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-gray-900 text-white shadow-md'
                          : isSuggested
                            ? 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-2 border-orange-300'
                            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={exercise.muscles.includes(muscle)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleChange('muscles', [...exercise.muscles, muscle]);
                          } else {
                            handleChange('muscles', exercise.muscles.filter(m => m !== muscle));
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{muscle.replace('_', ' ')}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 ml-auto" />
                      )}
                      {isSuggested && !isSelected && (
                        <Sparkles className="w-3.5 h-3.5 ml-auto text-orange-400" />
                      )}
                    </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Equipment</h2>
              <AISuggestionButton
                hasSuggestion={suggestions?.equipment?.length > 0 && !suggestionsStale}
                applied={appliedFields.equipment}
                onApply={() => applySuggestion('equipment', suggestions.equipment)}
                preview={suggestions?.equipment?.join(', ')}
                loading={isLoadingSuggestions}
              />
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add equipment (e.g., barbell, dumbbells)"
                  value={newEquipment}
                  onChange={(e) => setNewEquipment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addEquipment()}
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                />
                <button
                  onClick={addEquipment}
                  className="px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className={`flex flex-wrap gap-2 min-h-[44px] p-3 rounded-xl transition-colors ${
                appliedFields.equipment ? 'bg-emerald-50/50 border border-emerald-200' : 'bg-gray-50'
              }`}>
                {/* Added equipment tags */}
                {exercise.equipment.map((eq, index) => (
                  <span
                    key={index}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg shadow-sm ${
                      appliedFields.equipment ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white text-gray-700 border border-gray-200'
                    }`}
                  >
                    {eq}
                    <button
                      onClick={() => removeEquipment(eq)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                {/* Suggested equipment tags (clickable to add) */}
                {suggestions?.equipment?.length > 0 && !suggestionsStale && !appliedFields.equipment && (
                  suggestions.equipment
                    .filter(eq => !exercise.equipment.includes(eq))
                    .map((eq, index) => (
                      <button
                        key={`suggestion-${index}`}
                        onClick={() => setExercise(prev => ({ ...prev, equipment: [...prev.equipment, eq] }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm rounded-lg border-2 border-orange-300 border-dashed transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        {eq}
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    ))
                )}
                {/* Empty state */}
                {exercise.equipment.length === 0 && (!suggestions?.equipment?.length || suggestionsStale || appliedFields.equipment) && (
                  <span className="text-sm text-gray-400">No equipment added</span>
                )}
              </div>
            </div>
          </div>

          {/* Similar Exercises & Progressions */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Similar Exercises & Progressions</h2>
            <div className="space-y-5">
              {/* Similar Exercises */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Similar Exercises</label>
                  <AISuggestionButton
                    hasSuggestion={suggestions?.similar_exercises?.length > 0 && !suggestionsStale}
                    applied={appliedFields.similar_exercises}
                    onApply={() => applySuggestion('similar_exercises', suggestions.similar_exercises)}
                    loading={isLoadingSuggestions}
                    preview={suggestions?.similar_exercises?.join(', ')}
                  />
                </div>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Add similar exercise name"
                    value={newSimilarExercise}
                    onChange={(e) => setNewSimilarExercise(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSimilarExercise()}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                  <button
                    onClick={addSimilarExercise}
                    className="px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className={`flex flex-wrap gap-2 min-h-[44px] p-3 rounded-xl transition-colors ${
                  appliedFields.similar_exercises ? 'bg-emerald-50/50 border border-emerald-200' : 'bg-gray-50'
                }`}>
                  {/* Added similar exercise tags */}
                  {exercise.similar_exercises.map((simEx, index) => (
                    <span
                      key={index}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg shadow-sm ${
                        appliedFields.similar_exercises ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white text-gray-700 border border-gray-200'
                      }`}
                    >
                      {simEx}
                      <button
                        onClick={() => removeSimilarExercise(simEx)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                  {/* Suggested similar exercise tags (clickable to add) */}
                  {suggestions?.similar_exercises?.length > 0 && !suggestionsStale && !appliedFields.similar_exercises && (
                    suggestions.similar_exercises
                      .filter(simEx => !exercise.similar_exercises.includes(simEx))
                      .map((simEx, index) => (
                        <button
                          key={`suggestion-${index}`}
                          onClick={() => setExercise(prev => ({ ...prev, similar_exercises: [...prev.similar_exercises, simEx] }))}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm rounded-lg border-2 border-orange-300 border-dashed transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />
                          {simEx}
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      ))
                  )}
                  {/* Empty state */}
                  {exercise.similar_exercises.length === 0 && (!suggestions?.similar_exercises?.length || suggestionsStale || appliedFields.similar_exercises) && (
                    <span className="text-sm text-gray-400">No similar exercises added</span>
                  )}
                </div>
              </div>

              {/* Progression Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Progression Group</label>
                  <input
                    type="text"
                    value={exercise.progression_group || ''}
                    onChange={e => handleChange('progression_group', e.target.value)}
                    placeholder="e.g., planche_progression"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Progression Level</label>
                  <input
                    type="number"
                    value={exercise.progression_level || ''}
                    onChange={e => handleChange('progression_level', parseInt(e.target.value) || null)}
                    placeholder="1, 2, 3..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Previous Exercise (Easier)</label>
                  <input
                    type="text"
                    value={exercise.previous_progression || ''}
                    onChange={e => handleChange('previous_progression', e.target.value)}
                    placeholder="Name of easier exercise"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Next Exercise (Harder)</label>
                  <input
                    type="text"
                    value={exercise.next_progression || ''}
                    onChange={e => handleChange('next_progression', e.target.value)}
                    placeholder="Name of harder exercise"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Strain Characteristics */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Strain Characteristics</h3>
              <AISuggestionButton
                hasSuggestion={suggestions?.strain && !suggestionsStale}
                applied={appliedFields.strain}
                onApply={() => applySuggestion('strain', suggestions.strain)}
                loading={isLoadingSuggestions}
                preview={suggestions?.strain ? `${suggestions.strain.intensity}, ${suggestions.strain.load}, ${suggestions.strain.typical_volume}` : undefined}
              />
            </div>
            {/* Preview hint for strain */}
            {suggestions?.strain && !appliedFields.strain && !suggestionsStale && !exercise.strain.intensity && (
              <div className="mb-3 text-xs text-orange-500 italic flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                <span>Sensei suggests: {suggestions.strain.intensity} intensity, {suggestions.strain.load} load, {suggestions.strain.typical_volume}</span>
              </div>
            )}
            <div className={`space-y-4 p-3 rounded-xl transition-colors ${
              appliedFields.strain ? 'bg-emerald-50/50 border border-emerald-200' : 'bg-gray-50'
            }`}>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Intensity</label>
                <select
                  value={exercise.strain.intensity}
                  onChange={e => handleStrainChange('intensity', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                >
                  <option value="">Select intensity...</option>
                  {intensityLevels.map(level => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Load Type</label>
                <select
                  value={exercise.strain.load}
                  onChange={e => handleStrainChange('load', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                >
                  <option value="">Select load type...</option>
                  {loadTypes.map(load => (
                    <option key={load} value={load}>
                      {load.charAt(0).toUpperCase() + load.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Duration Type</label>
                <select
                  value={exercise.strain.duration_type}
                  onChange={e => handleStrainChange('duration_type', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                >
                  <option value="">Select duration type...</option>
                  {durationTypes.map(type => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Typical Volume</label>
                <input
                  type="text"
                  value={exercise.strain.typical_volume}
                  onChange={e => handleStrainChange('typical_volume', e.target.value)}
                  placeholder="e.g., 3x8, 30 seconds, 1 mile"
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-gray-900/10"
          >
            <Save className="w-5 h-5" />
            {isSaving ? "Saving..." : (isEditing ? "Update Exercise" : "Save Exercise")}
          </button>

          {/* Mobile Apply All Button */}
          {hasSuggestions && !suggestionsStale && (
            <button
              onClick={applyAllSuggestions}
              className="md:hidden w-full flex items-center justify-center gap-2 px-4 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-orange-500/20"
            >
              <Sparkles className="w-5 h-5" />
              Apply All Sensei Suggestions
            </button>
          )}
          {suggestionsStale && (
            <div className="md:hidden w-full flex items-center justify-center gap-2 px-4 py-4 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating suggestions...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
