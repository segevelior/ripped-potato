import React, { useState, useEffect, useRef } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";
import { Plus, Save, Trash2, ArrowLeft, GripVertical, Search, X, Clock, Activity, Dumbbell, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// Inline Search Component for "Spotlight" feel
const BlockSearch = ({ allExercises, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredExercises = searchTerm
    ? allExercises.filter(ex => ex.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : [];

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#FE755D] transition-colors" />
        <input
          type="text"
          placeholder="Type to add exercise..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#FE755D]/20 focus:bg-white transition-all font-medium"
        />
      </div>

      {isOpen && searchTerm && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20">
          {filteredExercises.length > 0 ? (
            filteredExercises.map(ex => (
              <button
                key={ex.id}
                onClick={() => {
                  onSelect(ex);
                  setSearchTerm("");
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-[#FE755D]/5 flex items-center justify-between group transition-colors"
              >
                <span className="font-bold text-gray-900 group-hover:text-[#FE755D]">{ex.name}</span>
                <span className="text-xs text-gray-400 capitalize bg-gray-50 px-2 py-1 rounded-md group-hover:bg-white">
                  {(ex.discipline || []).join(', ')}
                </span>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-gray-400 text-sm">No exercises found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default function CreatePredefinedWorkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allExercises, setAllExercises] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Track expanded exercise for "Compact Row" logic
  // Format: `${blockIndex}-${exerciseIndex}` or null
  const [expandedExercise, setExpandedExercise] = useState(null);

  const [workout, setWorkout] = useState({
    name: "",
    goal: "",
    primary_disciplines: [],
    estimated_duration: 60,
    difficulty_level: "intermediate",
    blocks: [{ name: "Main Block", exercises: [] }],
    tags: []
  });

  useEffect(() => {
    Exercise.list().then(setAllExercises);

    const urlParams = new URLSearchParams(location.search);
    const editId = urlParams.get('edit');
    if (editId) {
      setIsEditing(true);
      setEditingId(editId);
      loadWorkoutForEditing(editId);
    }
  }, [location.search]);

  const loadWorkoutForEditing = async (id) => {
    try {
      const workoutToEdit = await PredefinedWorkout.get(id);
      setWorkout(workoutToEdit);
    } catch (error) {
      console.error("Error loading workout for editing:", error);
      alert("Error loading workout. Redirecting to create new workout.");
      navigate(createPageUrl("CreatePredefinedWorkout"));
    }
  };

  const handleWorkoutChange = (field, value) => {
    setWorkout(prev => ({ ...prev, [field]: value }));
  };

  const handleBlockChange = (index, field, value) => {
    const newBlocks = [...workout.blocks];
    newBlocks[index][field] = value;
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const addBlock = () => {
    const newBlocks = [...workout.blocks, { name: `Block ${workout.blocks.length + 1}`, exercises: [] }];
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const removeBlock = (index) => {
    if (workout.blocks.length <= 1) {
      alert("You must have at least one block.");
      return;
    }
    const newBlocks = workout.blocks.filter((_, i) => i !== index);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const handleSelectExercise = (blockIndex, exercise) => {
    const newBlocks = [...workout.blocks];
    const newExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      volume: "3x8",
      rest: "60s",
      notes: ""
    };
    newBlocks[blockIndex].exercises.push(newExercise);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));

    // Auto-expand the new exercise
    setExpandedExercise(`${blockIndex}-${newBlocks[blockIndex].exercises.length - 1}`);
  };

  const removeExercise = (blockIndex, exerciseIndex) => {
    const newBlocks = [...workout.blocks];
    newBlocks[blockIndex].exercises.splice(exerciseIndex, 1);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
    if (expandedExercise === `${blockIndex}-${exerciseIndex}`) {
      setExpandedExercise(null);
    }
  };

  const updateExercise = (blockIndex, exerciseIndex, field, value) => {
    const newBlocks = [...workout.blocks];
    newBlocks[blockIndex].exercises[exerciseIndex][field] = value;
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;

    const newBlocks = [...workout.blocks];
    const [reorderedItem] = newBlocks.splice(source.index, 1);
    newBlocks.splice(destination.index, 0, reorderedItem);

    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const handleSave = async () => {
    if (!workout.name.trim()) {
      alert("Workout name is required.");
      return;
    }

    if (workout.blocks.length === 0 || workout.blocks.every(block => block.exercises.length === 0)) {
      alert("Please add at least one exercise to your workout.");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && editingId) {
        await PredefinedWorkout.update(editingId, workout);
        alert("Workout updated successfully!");
      } else {
        await PredefinedWorkout.create(workout);
        alert("Workout created successfully!");
      }
      navigate(createPageUrl("PredefinedWorkouts"));
    } catch (error) {
      console.error("Failed to save workout:", error);
      alert("Failed to save workout. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExpand = (blockIndex, exerciseIndex) => {
    const id = `${blockIndex}-${exerciseIndex}`;
    setExpandedExercise(expandedExercise === id ? null : id);
  };

  const disciplines = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"];

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header Navigation */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors px-4 py-2 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#FE755D] hover:bg-[#E56A54] text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-[#FE755D]/20 flex items-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            {isSaving ? "Saving..." : (isEditing ? "Update Workout" : "Save Workout")}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content - Card Style */}
        <div className="lg:col-span-2 space-y-8">

          {/* Workout Header Card */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Cover Image Placeholder */}
            <div className="h-48 bg-gradient-to-r from-gray-100 to-gray-50 flex items-center justify-center relative group cursor-pointer">
              <div className="text-center">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm text-gray-400 group-hover:text-[#FE755D] transition-colors">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-gray-500">Add Cover Image</span>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {/* Title Input */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Workout Name</label>
                <input
                  type="text"
                  placeholder="e.g., Full Body Power"
                  value={workout.name}
                  onChange={e => handleWorkoutChange('name', e.target.value)}
                  className="w-full text-3xl font-bold text-gray-900 placeholder-gray-300 border-none p-0 focus:ring-0 bg-transparent"
                />
              </div>

              {/* Metadata Row */}
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[140px]">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                    <Clock className="w-4 h-4" /> Duration
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={workout.estimated_duration}
                      onChange={e => handleWorkoutChange('estimated_duration', parseInt(e.target.value))}
                      className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 font-semibold text-gray-900 focus:ring-2 focus:ring-[#FE755D]/20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">min</span>
                  </div>
                </div>

                <div className="flex-1 min-w-[140px]">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                    <Activity className="w-4 h-4" /> Difficulty
                  </label>
                  <select
                    value={workout.difficulty_level}
                    onChange={e => handleWorkoutChange('difficulty_level', e.target.value)}
                    className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 font-semibold text-gray-900 focus:ring-2 focus:ring-[#FE755D]/20 appearance-none cursor-pointer"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[140px]">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                    <Dumbbell className="w-4 h-4" /> Discipline
                  </label>
                  <select
                    value={workout.primary_disciplines[0] || ""}
                    onChange={e => handleWorkoutChange('primary_disciplines', [e.target.value])}
                    className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 font-semibold text-gray-900 focus:ring-2 focus:ring-[#FE755D]/20 appearance-none cursor-pointer"
                  >
                    <option value="">Select...</option>
                    {disciplines.map(d => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description / Goal</label>
                <textarea
                  placeholder="What's the goal of this workout?"
                  value={workout.goal}
                  onChange={e => handleWorkoutChange('goal', e.target.value)}
                  className="w-full bg-gray-50 border-none rounded-xl p-4 text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 resize-none h-32"
                />
              </div>
            </div>
          </div>

          {/* Blocks Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-bold text-gray-900">Workout Blocks</h2>
              <span className="text-sm text-gray-500 font-medium">{workout.blocks.length} Blocks</span>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="blocks">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
                    {workout.blocks.map((block, index) => (
                      <Draggable key={index} draggableId={`block-${index}`} index={index}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden group">
                            {/* Block Header */}
                            <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                              <div {...provided.dragHandleProps} className="cursor-grab text-gray-400 hover:text-gray-600 p-1">
                                <GripVertical className="w-5 h-5" />
                              </div>
                              <input
                                type="text"
                                value={block.name}
                                onChange={e => handleBlockChange(index, 'name', e.target.value)}
                                className="flex-1 bg-transparent border-none font-bold text-lg text-gray-900 focus:ring-0 p-0"
                              />
                              <button
                                onClick={() => removeBlock(index)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>

                            {/* Exercises List */}
                            <div className="p-4 space-y-2">
                              {block.exercises.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-2xl mb-4">
                                  <p className="text-gray-400 text-sm">No exercises yet. Use the search below to add one.</p>
                                </div>
                              ) : (
                                block.exercises.map((ex, exIndex) => {
                                  const isExpanded = expandedExercise === `${index}-${exIndex}`;
                                  return (
                                    <div
                                      key={exIndex}
                                      className={`rounded-2xl transition-all border ${isExpanded ? 'bg-gray-50 border-[#FE755D]/20 shadow-sm' : 'bg-white border-transparent hover:border-gray-200'}`}
                                    >
                                      {/* Compact Row Header */}
                                      <div
                                        onClick={() => toggleExpand(index, exIndex)}
                                        className="p-4 flex items-center justify-between cursor-pointer"
                                      >
                                        <div className="flex items-center gap-3 flex-1">
                                          <div className={`p-2 rounded-lg ${isExpanded ? 'bg-[#FE755D] text-white' : 'bg-gray-100 text-gray-500'}`}>
                                            <Dumbbell className="w-4 h-4" />
                                          </div>
                                          <div>
                                            <h4 className="font-bold text-gray-900">{ex.exercise_name}</h4>
                                            {!isExpanded && (
                                              <p className="text-sm text-gray-500">{ex.volume || 'Set volume'} • {ex.rest || 'Set rest'}</p>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeExercise(index, exIndex);
                                            }}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                        </div>
                                      </div>

                                      {/* Expanded Details */}
                                      {isExpanded && (
                                        <div className="px-4 pb-4 pt-0 space-y-3 animate-accordion-down">
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <label className="text-xs font-semibold text-gray-400 uppercase mb-1 block">Volume</label>
                                              <input
                                                type="text"
                                                placeholder="3x8"
                                                value={ex.volume}
                                                onChange={(e) => updateExercise(index, exIndex, 'volume', e.target.value)}
                                                className="w-full bg-white border-none rounded-lg text-sm py-2 px-3 font-medium text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-xs font-semibold text-gray-400 uppercase mb-1 block">Rest</label>
                                              <input
                                                type="text"
                                                placeholder="60s"
                                                value={ex.rest}
                                                onChange={(e) => updateExercise(index, exIndex, 'rest', e.target.value)}
                                                className="w-full bg-white border-none rounded-lg text-sm py-2 px-3 font-medium text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="text-xs font-semibold text-gray-400 uppercase mb-1 block">Notes</label>
                                            <input
                                              type="text"
                                              placeholder="Add notes..."
                                              value={ex.notes}
                                              onChange={(e) => updateExercise(index, exIndex, 'notes', e.target.value)}
                                              className="w-full bg-white border-none rounded-lg text-sm py-2 px-3 text-gray-600 placeholder-gray-400 focus:ring-2 focus:ring-[#FE755D]/20 shadow-sm"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Spotlight Search Footer */}
                            <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                              <BlockSearch
                                allExercises={allExercises}
                                onSelect={(ex) => handleSelectExercise(index, ex)}
                              />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <button
              onClick={addBlock}
              className="w-full py-6 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-lg hover:border-[#FE755D] hover:text-[#FE755D] hover:bg-[#FE755D]/5 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
              Add New Block
            </button>
          </div>
        </div>

        {/* Sidebar - Tips / Info */}
        <div className="space-y-6">
          <div className="bg-[#FE755D]/5 rounded-3xl p-6 border border-[#FE755D]/10">
            <h3 className="font-bold text-[#FE755D] mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5" /> Pro Tips
            </h3>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-2">
                <span className="text-[#FE755D] font-bold">•</span>
                Start with compound movements for better energy utilization.
              </li>
              <li className="flex gap-2">
                <span className="text-[#FE755D] font-bold">•</span>
                Group exercises into blocks (e.g., Warmup, Main, Cooldown).
              </li>
              <li className="flex gap-2">
                <span className="text-[#FE755D] font-bold">•</span>
                Add specific rest times to keep the intensity high.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
