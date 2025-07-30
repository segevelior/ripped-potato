import React, { useState, useEffect } from "react";
import { Exercise } from "@/api/entities";
import { ArrowLeft, Save, Plus, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

const disciplines = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"];
const muscles = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "abs", "hip_flexors", "glutes", "quads", "hamstrings", "calves", "full_body"];
const intensityLevels = ["low", "moderate", "high", "max"];
const loadTypes = ["bodyweight", "light", "moderate", "heavy"];
const durationTypes = ["reps", "time", "distance"];

export default function CreateExercise() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [exercise, setExercise] = useState({
    name: "",
    discipline: ["strength"],
    muscles: ["full_body"], 
    equipment: [],
    strain: {
      intensity: "moderate",
      load: "moderate",
      duration_type: "reps",
      typical_volume: "3x8"
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
        // Ensure arrays are properly initialized
        discipline: exerciseToEdit.discipline || ["strength"],
        muscles: exerciseToEdit.muscles || ["full_body"],
        equipment: exerciseToEdit.equipment || [],
        similar_exercises: exerciseToEdit.similar_exercises || [],
        strain: {
          intensity: exerciseToEdit.strain?.intensity || "moderate",
          load: exerciseToEdit.strain?.load || "moderate",
          duration_type: exerciseToEdit.strain?.duration_type || "reps",
          typical_volume: exerciseToEdit.strain?.typical_volume || "3x8"
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
      if (isEditing && editingId) {
        await Exercise.update(editingId, exercise);
        alert("Exercise updated successfully!");
      } else {
        await Exercise.create(exercise);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? 'Edit Exercise' : 'Create Exercise'}
          </h1>
          <p className="text-lg text-gray-500">
            {isEditing ? 'Modify the exercise details.' : 'Add a new exercise to your library.'}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Exercise Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Pull-ups, Squats, Deadlifts" 
                  value={exercise.name} 
                  onChange={e => handleChange('name', e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Description</label>
                <textarea 
                  placeholder="Describe the exercise, technique tips, or variations..." 
                  value={exercise.description} 
                  onChange={e => handleChange('description', e.target.value)} 
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Classification</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Disciplines</label>
                <div className="grid grid-cols-3 gap-2">
                  {disciplines.map(discipline => (
                    <label key={discipline} className="flex items-center">
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
                        className="mr-2"
                      />
                      <span className="text-sm capitalize">{discipline}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Target Muscles</label>
                <div className="grid grid-cols-3 gap-2">
                  {muscles.map(muscle => (
                    <label key={muscle} className="flex items-center">
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
                        className="mr-2"
                      />
                      <span className="text-sm">{muscle.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Equipment</h2>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add equipment (e.g., barbell, dumbbells)"
                  value={newEquipment}
                  onChange={(e) => setNewEquipment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addEquipment()}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={addEquipment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {exercise.equipment.map((equipment, index) => (
                  <span key={index} className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">
                    {equipment}
                    <button onClick={() => removeEquipment(equipment)} className="text-purple-600 hover:text-purple-800">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Similar Exercises & Progressions */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Similar Exercises & Progressions</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Similar Exercises</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Add similar exercise name"
                    value={newSimilarExercise}
                    onChange={(e) => setNewSimilarExercise(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSimilarExercise()}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={addSimilarExercise}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {exercise.similar_exercises.map((simEx, index) => (
                    <span key={index} className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      {simEx}
                      <button onClick={() => removeSimilarExercise(simEx)} className="text-green-600 hover:text-green-800">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Progression Group</label>
                  <input 
                    type="text" 
                    value={exercise.progression_group || ''} 
                    onChange={e => handleChange('progression_group', e.target.value)} 
                    placeholder="e.g., planche_progression"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Progression Level</label>
                  <input 
                    type="number" 
                    value={exercise.progression_level || ''} 
                    onChange={e => handleChange('progression_level', parseInt(e.target.value) || null)} 
                    placeholder="1, 2, 3..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Previous Exercise (Easier)</label>
                  <input 
                    type="text" 
                    value={exercise.previous_progression || ''} 
                    onChange={e => handleChange('previous_progression', e.target.value)} 
                    placeholder="Name of easier exercise"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-600">Next Exercise (Harder)</label>
                  <input 
                    type="text" 
                    value={exercise.next_progression || ''} 
                    onChange={e => handleChange('next_progression', e.target.value)} 
                    placeholder="Name of harder exercise"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="font-bold mb-4">Strain Characteristics</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Intensity</label>
                <select 
                  value={exercise.strain.intensity} 
                  onChange={e => handleStrainChange('intensity', e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {intensityLevels.map(level => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Load Type</label>
                <select 
                  value={exercise.strain.load} 
                  onChange={e => handleStrainChange('load', e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {loadTypes.map(load => (
                    <option key={load} value={load}>
                      {load.charAt(0).toUpperCase() + load.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Duration Type</label>
                <select 
                  value={exercise.strain.duration_type} 
                  onChange={e => handleStrainChange('duration_type', e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {durationTypes.map(type => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Typical Volume</label>
                <input 
                  type="text" 
                  value={exercise.strain.typical_volume} 
                  onChange={e => handleStrainChange('typical_volume', e.target.value)} 
                  placeholder="e.g., 3x8, 30 seconds, 1 mile"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-5 h-5"/>
            {isSaving ? "Saving..." : (isEditing ? "Update Exercise" : "Save Exercise")}
          </button>
        </div>
      </div>
    </div>
  );
}