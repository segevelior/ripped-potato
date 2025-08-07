import React, { useState } from "react";
import { X, Plus, Trash2, GripVertical, Search, Clock, Target, Dumbbell } from "lucide-react";

export default function CreateWorkoutModal({ exercises, onClose, onSave }) {
  const [workout, setWorkout] = useState({
    name: "",
    goal: "",
    difficulty_level: "intermediate",
    duration_minutes: 45,
    primary_disciplines: [],
    blocks: [
      {
        name: "Main Block",
        exercises: []
      }
    ]
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);

  const disciplines = ["strength", "cardio", "hiit", "flexibility", "calisthenics", "climbing", "running", "cycling", "mobility"];
  const difficulties = ["beginner", "intermediate", "advanced"];

  const filteredExercises = exercises.filter(ex => 
    ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ex.muscles || []).some(m => m.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAddExercise = (exercise) => {
    const newBlocks = [...workout.blocks];
    newBlocks[selectedBlockIndex].exercises.push({
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      volume: "3x10",
      rest: "60s",
      notes: ""
    });
    setWorkout({ ...workout, blocks: newBlocks });
    setSearchTerm("");
  };

  const handleRemoveExercise = (blockIndex, exerciseIndex) => {
    const newBlocks = [...workout.blocks];
    newBlocks[blockIndex].exercises.splice(exerciseIndex, 1);
    setWorkout({ ...workout, blocks: newBlocks });
  };

  const handleAddBlock = () => {
    setWorkout({
      ...workout,
      blocks: [...workout.blocks, {
        name: `Block ${workout.blocks.length + 1}`,
        exercises: []
      }]
    });
  };

  const handleRemoveBlock = (index) => {
    if (workout.blocks.length > 1) {
      const newBlocks = workout.blocks.filter((_, i) => i !== index);
      setWorkout({ ...workout, blocks: newBlocks });
      if (selectedBlockIndex >= newBlocks.length) {
        setSelectedBlockIndex(newBlocks.length - 1);
      }
    }
  };

  const updateBlock = (index, field, value) => {
    const newBlocks = [...workout.blocks];
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    setWorkout({ ...workout, blocks: newBlocks });
  };

  const updateExercise = (blockIndex, exerciseIndex, field, value) => {
    const newBlocks = [...workout.blocks];
    newBlocks[blockIndex].exercises[exerciseIndex] = {
      ...newBlocks[blockIndex].exercises[exerciseIndex],
      [field]: value
    };
    setWorkout({ ...workout, blocks: newBlocks });
  };

  const toggleDiscipline = (discipline) => {
    const disciplines = workout.primary_disciplines || [];
    if (disciplines.includes(discipline)) {
      setWorkout({
        ...workout,
        primary_disciplines: disciplines.filter(d => d !== discipline)
      });
    } else {
      setWorkout({
        ...workout,
        primary_disciplines: [...disciplines, discipline]
      });
    }
  };

  const handleSave = () => {
    if (!workout.name || workout.blocks.every(b => b.exercises.length === 0)) {
      alert("Please provide a workout name and add at least one exercise");
      return;
    }
    onSave(workout);
  };

  const getTotalExercises = () => {
    return workout.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex overflow-hidden">
        {/* Left Panel - Workout Details */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Create New Workout</h2>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/50 transition-colors">
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Workout Info */}
          <div className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700">Workout Name</label>
              <input
                type="text"
                value={workout.name}
                onChange={(e) => setWorkout({ ...workout, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Upper Body Strength"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700">Description / Goal</label>
              <textarea
                value={workout.goal}
                onChange={(e) => setWorkout({ ...workout, goal: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="2"
                placeholder="e.g., Build upper body strength with compound movements"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Difficulty</label>
                <select
                  value={workout.difficulty_level}
                  onChange={(e) => setWorkout({ ...workout, difficulty_level: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {difficulties.map(diff => (
                    <option key={diff} value={diff}>
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Duration (minutes)</label>
                <input
                  type="number"
                  value={workout.duration_minutes}
                  onChange={(e) => setWorkout({ ...workout, duration_minutes: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="5"
                  max="180"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700">Primary Disciplines</label>
              <div className="flex flex-wrap gap-2">
                {disciplines.map(discipline => (
                  <button
                    key={discipline}
                    onClick={() => toggleDiscipline(discipline)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      (workout.primary_disciplines || []).includes(discipline)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {discipline}
                  </button>
                ))}
              </div>
            </div>

            {/* Workout Blocks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-700">Workout Blocks</label>
                <button
                  onClick={handleAddBlock}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Block
                </button>
              </div>

              <div className="space-y-3">
                {workout.blocks.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                      selectedBlockIndex === blockIndex
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedBlockIndex(blockIndex)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <input
                        type="text"
                        value={block.name}
                        onChange={(e) => updateBlock(blockIndex, 'name', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">
                          {block.exercises.length} exercises
                        </span>
                        {workout.blocks.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveBlock(blockIndex);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Block Exercises */}
                    <div className="space-y-2 mt-3">
                      {block.exercises.map((exercise, exerciseIndex) => (
                        <div key={exerciseIndex} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{exercise.exercise_name}</div>
                              <div className="flex gap-3 mt-2">
                                <input
                                  type="text"
                                  value={exercise.volume}
                                  onChange={(e) => updateExercise(blockIndex, exerciseIndex, 'volume', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded w-20"
                                  placeholder="3x10"
                                />
                                <input
                                  type="text"
                                  value={exercise.rest}
                                  onChange={(e) => updateExercise(blockIndex, exerciseIndex, 'rest', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded w-16"
                                  placeholder="60s"
                                />
                                <input
                                  type="text"
                                  value={exercise.notes}
                                  onChange={(e) => updateExercise(blockIndex, exerciseIndex, 'notes', e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded flex-1"
                                  placeholder="Notes..."
                                />
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveExercise(blockIndex, exerciseIndex);
                              }}
                              className="text-red-500 hover:text-red-700 ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{getTotalExercises()}</span> total exercises in{" "}
                <span className="font-medium">{workout.blocks.length}</span> blocks
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Create Workout
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Exercise Selector */}
        <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-white">
            <h3 className="font-semibold text-gray-900 mb-3">Add Exercises</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Adding to: <span className="font-medium">{workout.blocks[selectedBlockIndex]?.name}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {filteredExercises.slice(0, 50).map(exercise => (
                <div
                  key={exercise.id}
                  className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => handleAddExercise(exercise)}
                >
                  <div className="font-medium text-gray-900">{exercise.name}</div>
                  {exercise.muscles && exercise.muscles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {exercise.muscles.slice(0, 3).map((muscle, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                          {muscle}
                        </span>
                      ))}
                    </div>
                  )}
                  {exercise.equipment && exercise.equipment.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {exercise.equipment.slice(0, 2).map((eq, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                          {eq}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}