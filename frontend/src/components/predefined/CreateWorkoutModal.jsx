import React, { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, GripVertical, Search, Clock, Activity, Dumbbell, ChevronDown, ChevronUp, Save } from "lucide-react";
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

  // Track expanded exercise for "Compact Row" logic
  // Format: `${blockIndex}-${exerciseIndex}` or null
  const [expandedExercise, setExpandedExercise] = useState(null);

  const disciplines = ["strength", "cardio", "hiit", "flexibility", "calisthenics", "climbing", "running", "cycling", "mobility"];
  const difficulties = ["beginner", "intermediate", "advanced"];

  const handleAddBlock = () => {
    setWorkout(prev => ({
      ...prev,
      blocks: [...prev.blocks, { name: `Block ${prev.blocks.length + 1}`, exercises: [] }]
    }));
  };

  const handleRemoveBlock = (index) => {
    if (workout.blocks.length <= 1) {
      alert("You must have at least one block.");
      return;
    }
    const newBlocks = workout.blocks.filter((_, i) => i !== index);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const handleBlockChange = (index, field, value) => {
    const newBlocks = [...workout.blocks];
    newBlocks[index][field] = value;
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

  const toggleExpand = (blockIndex, exerciseIndex) => {
    const id = `${blockIndex}-${exerciseIndex}`;
    setExpandedExercise(expandedExercise === id ? null : id);
  };

  const toggleDiscipline = (discipline) => {
    const currentDisciplines = workout.primary_disciplines || [];
    if (currentDisciplines.includes(discipline)) {
      setWorkout(prev => ({
        ...prev,
        primary_disciplines: currentDisciplines.filter(d => d !== discipline)
      }));
    } else {
      setWorkout(prev => ({
        ...prev,
        primary_disciplines: [...currentDisciplines, discipline]
      }));
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;

    const newBlocks = [...workout.blocks];
    const [reorderedItem] = newBlocks.splice(source.index, 1);
    newBlocks.splice(destination.index, 0, reorderedItem);

    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
  };

  const handleSaveClick = () => {
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 z-[100]">
      <div className="bg-white w-full h-[90vh] md:h-[85vh] md:max-w-2xl md:rounded-[40px] rounded-t-[40px] flex flex-col overflow-hidden border border-gray-100 shadow-2xl relative">

        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white z-10">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-6 h-6 text-gray-400 hover:text-gray-600" />
          </button>

          <h2 className="text-lg font-bold text-gray-900">Create Workout</h2>

          <button
            onClick={handleSaveClick}
            className="text-[#FE755D] font-bold text-sm hover:text-[#E56A54] transition-colors"
          >
            Save
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 pb-10">

          {/* Workout Info */}
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Workout Name</label>
              <input
                type="text"
                value={workout.name}
                onChange={(e) => setWorkout({ ...workout, name: e.target.value })}
                className="w-full text-3xl font-bold text-gray-900 placeholder-gray-300 border-none p-0 focus:ring-0 bg-transparent"
                placeholder="e.g., Upper Body Strength"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[140px]">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                  <Activity className="w-4 h-4" /> Difficulty
                </label>
                <select
                  value={workout.difficulty_level}
                  onChange={(e) => setWorkout({ ...workout, difficulty_level: e.target.value })}
                  className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 font-semibold text-gray-900 focus:ring-2 focus:ring-[#FE755D]/20 appearance-none cursor-pointer"
                >
                  {difficulties.map(diff => (
                    <option key={diff} value={diff}>
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[140px]">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
                  <Clock className="w-4 h-4" /> Duration
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={workout.duration_minutes}
                    onChange={(e) => setWorkout({ ...workout, duration_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-50 border-none rounded-xl py-2.5 px-4 font-semibold text-gray-900 focus:ring-2 focus:ring-[#FE755D]/20"
                    min="5"
                    max="180"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">min</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Primary Disciplines</label>
              <div className="flex flex-wrap gap-2">
                {disciplines.map(discipline => (
                  <button
                    key={discipline}
                    onClick={() => toggleDiscipline(discipline)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${(workout.primary_disciplines || []).includes(discipline)
                      ? 'bg-[#FE755D] text-white shadow-lg shadow-[#FE755D]/20'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description / Goal</label>
              <textarea
                value={workout.goal}
                onChange={(e) => setWorkout({ ...workout, goal: e.target.value })}
                className="w-full bg-gray-50 border-none rounded-xl p-4 text-gray-700 focus:ring-2 focus:ring-[#FE755D]/20 resize-none h-24"
                placeholder="e.g., Build upper body strength with compound movements"
              />
            </div>
          </div>

          {/* Blocks Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-bold text-gray-900">Workout Blocks</h2>
              <span className="text-sm text-gray-500 font-medium">{workout.blocks.length} Blocks</span>
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="modal-blocks">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
                    {workout.blocks.map((block, index) => (
                      <Draggable key={index} draggableId={`modal-block-${index}`} index={index}>
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
                                onClick={() => handleRemoveBlock(index)}
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
                                allExercises={exercises}
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
              onClick={handleAddBlock}
              className="w-full py-6 rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-lg hover:border-[#FE755D] hover:text-[#FE755D] hover:bg-[#FE755D]/5 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
              Add New Block
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}