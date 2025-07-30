
import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";
import { Plus, Save, Trash2, ArrowLeft, GripVertical, Search, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const ExerciseSelector = ({ exercises, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredExercises = exercises.filter(ex => 
    ex.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="apple-card w-full max-w-2xl max-h-[70vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Select Exercise</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-4 border-b">
          <input 
            type="text"
            placeholder="Search exercises..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="apple-input w-full"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredExercises.map(ex => (
            <div key={ex.id} onClick={() => onSelect(ex)} className="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer">
              <h4 className="font-medium">{ex.name}</h4>
              <p className="text-sm text-gray-500 capitalize">{(ex.discipline || []).join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function CreatePredefinedWorkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [allExercises, setAllExercises] = useState([]);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
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
    
    // Check if we're editing an existing workout
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
  
  const openExerciseSelector = (blockIndex) => {
    setCurrentBlockIndex(blockIndex);
    setShowExerciseSelector(true);
  };
  
  const handleSelectExercise = (exercise) => {
    if (currentBlockIndex === null) return;
    const newBlocks = [...workout.blocks];
    const newExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      volume: "3x8",
      rest: "60s",
      notes: ""
    };
    newBlocks[currentBlockIndex].exercises.push(newExercise);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
    setShowExerciseSelector(false);
  };
  
  const removeExercise = (blockIndex, exerciseIndex) => {
    const newBlocks = [...workout.blocks];
    newBlocks[blockIndex].exercises.splice(exerciseIndex, 1);
    setWorkout(prev => ({ ...prev, blocks: newBlocks }));
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

  const disciplines = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5"/>
        </button>
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? 'Edit Workout Template' : 'Create Workout Template'}
          </h1>
          <p className="text-lg text-gray-500">
            {isEditing ? 'Modify your existing workout template.' : 'Build a structured, reusable workout.'}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Details */}
          <div className="apple-card p-6">
            <h2 className="text-xl font-bold mb-4">Workout Details</h2>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Workout Name" 
                value={workout.name} 
                onChange={e => handleWorkoutChange('name', e.target.value)} 
                className="apple-input w-full"
              />
              <textarea 
                placeholder="Goal or description..." 
                value={workout.goal} 
                onChange={e => handleWorkoutChange('goal', e.target.value)} 
                className="apple-input w-full h-24 resize-none"
              />
            </div>
          </div>
          
          {/* Blocks */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Blocks</h2>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="blocks">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                    {workout.blocks.map((block, index) => (
                      <Draggable key={index} draggableId={`block-${index}`} index={index}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className="apple-card p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2 flex-1">
                                <div {...provided.dragHandleProps} className="cursor-grab">
                                  <GripVertical className="w-5 h-5 text-gray-400"/>
                                </div>
                                <input 
                                  type="text" 
                                  value={block.name} 
                                  onChange={e => handleBlockChange(index, 'name', e.target.value)} 
                                  className="apple-input text-lg font-semibold flex-1"
                                />
                              </div>
                              <button 
                                onClick={() => removeBlock(index)} 
                                className="p-2 hover:bg-red-50 rounded-full"
                              >
                                <Trash2 className="w-4 h-4 text-red-500"/>
                              </button>
                            </div>
                            
                            <div className="space-y-2 pl-4 border-l-2">
                              {block.exercises.map((ex, exIndex) => (
                                <div key={exIndex} className="bg-gray-50 p-3 rounded-md space-y-2">
                                  <div className="flex justify-between items-start">
                                    <span className="font-medium">{ex.exercise_name}</span>
                                    <button 
                                      onClick={() => removeExercise(index, exIndex)}
                                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                                    >
                                      <Trash2 className="w-4 h-4"/>
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="text"
                                      placeholder="Volume (e.g., 3x8)"
                                      value={ex.volume}
                                      onChange={(e) => updateExercise(index, exIndex, 'volume', e.target.value)}
                                      className="apple-input text-sm"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Rest (e.g., 60s)"
                                      value={ex.rest}
                                      onChange={(e) => updateExercise(index, exIndex, 'rest', e.target.value)}
                                      className="apple-input text-sm"
                                    />
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Notes (optional)"
                                    value={ex.notes}
                                    onChange={(e) => updateExercise(index, exIndex, 'notes', e.target.value)}
                                    className="apple-input text-sm w-full"
                                  />
                                </div>
                              ))}
                              <button 
                                onClick={() => openExerciseSelector(index)} 
                                className="apple-button-secondary text-sm w-full mt-2"
                              >
                                <Plus className="w-4 h-4 mr-2"/>Add Exercise
                              </button>
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
            <button onClick={addBlock} className="apple-button-secondary w-full">
              <Plus className="w-4 h-4 mr-2"/>Add Block
            </button>
          </div>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6">
          <div className="apple-card p-6">
            <h3 className="font-bold mb-4">Properties</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Difficulty</label>
                <select 
                  value={workout.difficulty_level} 
                  onChange={e => handleWorkoutChange('difficulty_level', e.target.value)} 
                  className="apple-input w-full"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Primary Discipline</label>
                <select 
                  value={workout.primary_disciplines[0] || ""} 
                  onChange={e => handleWorkoutChange('primary_disciplines', [e.target.value])} 
                  className="apple-input w-full"
                >
                  <option value="">Select...</option>
                  {disciplines.map(d => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-600">Est. Duration (min)</label>
                <input 
                  type="number" 
                  value={workout.estimated_duration} 
                  onChange={e => handleWorkoutChange('estimated_duration', parseInt(e.target.value))} 
                  className="apple-input w-full"
                />
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="apple-button-primary w-full py-3 flex items-center justify-center gap-2 font-bold text-lg"
          >
            <Save className="w-5 h-5"/>
            {isSaving ? "Saving..." : (isEditing ? "Update Template" : "Save Template")}
          </button>
        </div>
      </div>
      
      {showExerciseSelector && (
        <ExerciseSelector 
          exercises={allExercises} 
          onSelect={handleSelectExercise} 
          onClose={() => setShowExerciseSelector(false)} 
        />
      )}
    </div>
  );
}
