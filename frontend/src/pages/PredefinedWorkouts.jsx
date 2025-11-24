import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";
import { Eye, Edit, Copy, Trash2, Clock, Target, ChevronDown, ChevronUp, Plus } from "lucide-react";
import WorkoutDetailModal from "@/components/predefined/WorkoutDetailModal";
import CreateWorkoutModal from "@/components/predefined/CreateWorkoutModal";

export default function PredefinedWorkouts() {
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workoutData, exerciseData] = await Promise.all([
        PredefinedWorkout.list(),
        Exercise.list()
      ]);
      setPredefinedWorkouts(workoutData || []);
      setExercises(exerciseData || []);
    } catch (error) {
      console.error("Error loading data:", error);
      setPredefinedWorkouts([]);
      setExercises([]);
    }
    setIsLoading(false);
  };

  const handleView = (workout) => {
    setSelectedWorkout(workout);
    setShowDetailModal(true);
  };

  const handleEdit = (workout) => {
    setSelectedWorkout(workout);
    setShowDetailModal(true);
  };

  const handleDuplicate = async (workout) => {
    try {
      const duplicatedWorkout = {
        ...workout,
        name: `${workout.name} (Copy)`,
        id: undefined
      };
      await PredefinedWorkout.create(duplicatedWorkout);
      await loadData();
      alert("Workout duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating workout:", error);
      alert("Error duplicating workout. Please try again.");
    }
  };

  const handleDelete = async (workout) => {
    if (!confirm(`Are you sure you want to delete "${workout.name}"?`)) {
      return;
    }

    try {
      await PredefinedWorkout.delete(workout.id);
      await loadData();
      alert("Workout deleted successfully!");
    } catch (error) {
      console.error("Error deleting workout:", error);
      alert("Error deleting workout. Please try again.");
    }
  };

  const handleSave = async (updatedWorkout) => {
    try {
      await PredefinedWorkout.update(updatedWorkout.id, updatedWorkout);
      await loadData();
      setShowDetailModal(false);
      alert("Workout updated successfully!");
    } catch (error) {
      console.error("Error updating workout:", error);
      alert("Error updating workout. Please try again.");
    }
  };

  const handleCreate = async (newWorkout) => {
    try {
      await PredefinedWorkout.create(newWorkout);
      await loadData();
      setShowCreateModal(false);
      alert("Workout created successfully!");
    } catch (error) {
      console.error("Error creating workout:", error);
      alert("Error creating workout. Please try again.");
    }
  };

  const handleApplyToCalendar = (workout, date) => {
    // TODO: Implement apply to calendar functionality
    console.log("Apply workout to calendar:", workout, date);
    alert(`Workout "${workout.name}" will be added to your calendar on ${date}`);
  };

  const getDifficultyColor = (level) => {
    switch (level) {
      case 'beginner': return 'bg-green-500';
      case 'intermediate': return 'bg-orange-500';
      case 'advanced': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getDisciplineColor = (discipline) => {
    const colors = {
      strength: 'bg-blue-500',
      climbing: 'bg-orange-600',
      running: 'bg-green-500',
      cycling: 'bg-purple-500',
      calisthenics: 'bg-yellow-500',
      mobility: 'bg-cyan-500',
      cardio: 'bg-pink-500',
      hiit: 'bg-red-500'
    };
    return colors[discipline] || 'bg-gray-500';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
        <p className="text-gray-600">Loading workouts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Predefined Workouts</h1>
          <p className="text-lg text-gray-600">
            Browse and manage workout templates
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-lg shadow-gray-900/10"
        >
          <Plus className="w-5 h-5" />
          Create Workout
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {predefinedWorkouts.map((workout) => {
          const totalExercises = workout.blocks?.reduce((sum, block) =>
            sum + (block.exercises?.length || 0), 0) || 0;

          return (
            <div key={workout.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all group">
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-xl text-gray-900 leading-tight group-hover:text-coral-brand transition-colors">
                    {workout.name || 'Unnamed Workout'}
                  </h3>
                  {workout.difficulty_level && (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-wide ${getDifficultyColor(workout.difficulty_level)}`}>
                      {workout.difficulty_level}
                    </span>
                  )}
                </div>

                {workout.goal && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2 font-medium">
                    {workout.goal}
                  </p>
                )}

                {workout.primary_disciplines && workout.primary_disciplines.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {workout.primary_disciplines.map((discipline, index) => (
                      <span
                        key={index}
                        className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${getDisciplineColor(discipline)}`}
                      >
                        {discipline}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 mb-6 text-sm text-gray-500 bg-gray-50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{workout.duration_minutes || 60}m</span>
                  </div>
                  {workout.blocks && (
                    <div className="flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{workout.blocks.length} blocks</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{totalExercises} exercises</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleView(workout)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-xl transition-colors text-sm font-semibold"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                  <button
                    onClick={() => handleEdit(workout)}
                    className="flex items-center justify-center p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(workout)}
                    className="flex items-center justify-center p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(workout)}
                    className="flex items-center justify-center p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* Workout Detail Modal */}
      {showDetailModal && selectedWorkout && (
        <WorkoutDetailModal
          workout={selectedWorkout}
          exercises={exercises}
          onClose={() => setShowDetailModal(false)}
          onApply={handleApplyToCalendar}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* Create Workout Modal */}
      {showCreateModal && (
        <CreateWorkoutModal
          exercises={exercises}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}