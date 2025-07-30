
import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise, Workout } from "@/api/entities";
import { Search, Filter, Copy, Calendar, Clock, Target, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import WorkoutCard from "../components/predefined/WorkoutCard";
import WorkoutDetailModal from "../components/predefined/WorkoutDetailModal";

export default function PredefinedWorkouts() {
  const navigate = useNavigate();
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      setPredefinedWorkouts(workoutData);
      setExercises(exerciseData);
    } catch (error) {
      console.error("Error loading predefined workouts:", error);
    }
    setIsLoading(false);
  };

  const filteredWorkouts = predefinedWorkouts.filter(workout => {
    const matchesSearch = workout.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workout.goal.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDiscipline = selectedDiscipline === "all" || 
                             (workout.primary_disciplines || []).includes(selectedDiscipline);
    const matchesDifficulty = selectedDifficulty === "all" || 
                             workout.difficulty_level === selectedDifficulty;
    
    return matchesSearch && matchesDiscipline && matchesDifficulty;
  });

  const disciplines = [...new Set(predefinedWorkouts.flatMap(w => w.primary_disciplines || []))];
  const difficulties = ["beginner", "intermediate", "advanced"];

  const handleViewWorkout = (workout) => {
    setSelectedWorkout(workout);
    setShowDetailModal(true);
  };

  const handleEditWorkout = (workout) => {
    // Navigate to edit page with workout ID
    navigate(createPageUrl(`CreatePredefinedWorkout?edit=${workout.id}`));
  };

  const handleDeleteWorkout = async (workout) => {
    if (!confirm(`Are you sure you want to delete "${workout.name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await PredefinedWorkout.delete(workout.id);
      loadData();
      alert("Workout deleted successfully!");
    } catch (error) {
      console.error("Error deleting workout:", error);
      alert("Error deleting workout. Please try again.");
    }
  };

  const handleDuplicateWorkout = async (workout) => {
    try {
      const duplicatedWorkout = {
        ...workout,
        name: `${workout.name} (Copy)`,
        id: undefined // Let the system generate a new ID
      };
      await PredefinedWorkout.create(duplicatedWorkout);
      loadData();
      alert("Workout duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating workout:", error);
      alert("Error duplicating workout. Please try again.");
    }
  };

  const handleApplyToCalendar = async (workout, selectedDate) => {
    try {
      // Convert predefined workout to actual workout format
      const workoutExercises = [];
      
      workout.blocks.forEach(block => {
        block.exercises.forEach(ex => {
          // Parse volume string (e.g., "3x8" -> 3 sets of 8 reps)
          const volume = ex.volume || "3x8";
          let sets = 3;
          let reps = [8, 8, 8];
          
          if (volume.includes('x')) {
            const [setsStr, repsStr] = volume.split('x');
            sets = parseInt(setsStr) || 3;
            const repCount = parseInt(repsStr) || 8;
            reps = Array(sets).fill(repCount);
          }
          
          workoutExercises.push({
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            sets: sets,
            reps: reps,
            weight: Array(sets).fill(0),
            rpe: Array(sets).fill(7),
            notes: ex.notes || ""
          });
        });
      });

      const newWorkout = {
        title: workout.name,
        date: selectedDate,
        type: workout.primary_disciplines[0] || "strength",
        duration_minutes: workout.estimated_duration || 60,
        exercises: workoutExercises,
        total_strain: 0, // Will be calculated
        muscle_strain: {},
        notes: `Applied from predefined workout: ${workout.name}\n\nGoal: ${workout.goal}`
      };

      await Workout.create(newWorkout);
      setShowDetailModal(false);
      alert(`"${workout.name}" has been added to your calendar for ${selectedDate}!`);
    } catch (error) {
      console.error("Error applying workout to calendar:", error);
      alert("Error adding workout to calendar. Please try again.");
    }
  };

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
          <h1 className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>
            Predefined Workouts
          </h1>
          <p className="text-lg" style={{color: 'var(--text-secondary)'}}>
            Ready-to-use workout templates designed by experts.
          </p>
        </div>
        <Link to={createPageUrl("CreatePredefinedWorkout")}>
          <button className="apple-button-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Workout Template
          </button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="apple-card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{color: 'var(--text-secondary)'}} />
              <input
                type="text"
                placeholder="Search workouts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="apple-input w-full pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="apple-input"
            >
              <option value="all">All Disciplines</option>
              {disciplines.map(discipline => (
                <option key={discipline} value={discipline}>
                  {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="apple-input"
            >
              <option value="all">All Levels</option>
              {difficulties.map(difficulty => (
                <option key={difficulty} value={difficulty}>
                  {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm" style={{color: 'var(--text-secondary)'}}>
          Showing {filteredWorkouts.length} of {predefinedWorkouts.length} workouts
        </div>
      </div>

      {/* Workout Grid */}
      {filteredWorkouts.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkouts.map(workout => (
            <WorkoutCard
              key={workout.id}
              workout={workout}
              onView={() => handleViewWorkout(workout)}
              onEdit={handleEditWorkout}
              onDelete={handleDeleteWorkout}
              onDuplicate={() => handleDuplicateWorkout(workout)}
              onApply={(date) => handleApplyToCalendar(workout, date)}
            />
          ))}
        </div>
      ) : (
        <div className="apple-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Target className="w-8 h-8" style={{color: 'var(--text-secondary)'}} />
          </div>
          <h3 className="text-xl font-semibold mb-2" style={{color: 'var(--text-primary)'}}>No Workouts Found</h3>
          <p style={{color: 'var(--text-secondary)'}}>
            Try adjusting your search or filters to find workouts.
          </p>
        </div>
      )}

      {/* Workout Detail Modal */}
      {showDetailModal && selectedWorkout && (
        <WorkoutDetailModal
          workout={selectedWorkout}
          exercises={exercises}
          onClose={() => setShowDetailModal(false)}
          onApply={handleApplyToCalendar}
          onDuplicate={() => handleDuplicateWorkout(selectedWorkout)}
        />
      )}
    </div>
  );
}
