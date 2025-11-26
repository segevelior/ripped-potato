import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";
import { format } from "date-fns";
import {
  Play, Clock, ChevronRight, Dumbbell, Calendar,
  Search, Sparkles, X, Flame
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getDisciplineClass } from "@/styles/designTokens";
import WorkoutDetailModal from "../components/predefined/WorkoutDetailModal";

const getWorkoutImage = (workout) => {
  const discipline = workout?.primary_disciplines?.[0]?.toLowerCase() || 'strength';
  const imageMap = {
    running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=500&fit=crop',
    cycling: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&h=500&fit=crop',
    strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=500&fit=crop',
    climbing: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=500&fit=crop',
    hiit: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=500&fit=crop',
    cardio: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=500&fit=crop',
    mobility: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=500&fit=crop',
    meditation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=500&fit=crop',
    calisthenics: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800&h=500&fit=crop',
  };
  return workout?.image || imageMap[discipline] || imageMap.strength;
};

// Quick start card - prominent CTA
function QuickStartCard({ workout, onStart }) {
  if (!workout) return null;

  const discipline = workout.primary_disciplines?.[0] || 'Workout';

  return (
    <div
      onClick={() => onStart(workout)}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-700 p-6 text-white cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-5 h-5 text-primary-100" />
          <span className="text-sm font-medium text-primary-100">Today's Pick</span>
        </div>

        <h3 className="text-xl font-bold mb-2">{workout.name}</h3>

        <div className="flex items-center gap-4 text-sm text-primary-100 mb-4">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {workout.estimated_duration || 45} min
          </span>
          <span className="capitalize">{discipline}</span>
        </div>

        <button className="w-full bg-white text-primary-600 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-50 transition-colors">
          <Play className="w-5 h-5" />
          Start Now
        </button>
      </div>
    </div>
  );
}

// Compact workout card for lists
function CompactWorkoutCard({ workout, onStart, onView }) {
  const discipline = workout.primary_disciplines?.[0] || 'workout';

  return (
    <div
      onClick={() => onView(workout)}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="relative h-32 overflow-hidden">
        <img
          src={getWorkoutImage(workout)}
          alt={workout.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${getDisciplineClass(discipline)}`}>
            {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h4 className="font-semibold text-gray-900 mb-2 line-clamp-1 group-hover:text-primary-500 transition-colors">
          {workout.name}
        </h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{workout.estimated_duration || 45} min</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onStart(workout); }}
            className="bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

// Horizontal scroll workout row
function WorkoutRow({ title, icon: Icon, workouts, onStart, onView, seeAllLink }) {
  if (!workouts || workouts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary-500" />}
          {title}
        </h2>
        {seeAllLink && (
          <Link to={seeAllLink} className="text-sm text-primary-500 font-medium flex items-center gap-1">
            See All <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {workouts.map((workout) => (
          <div key={workout.id} className="flex-shrink-0 w-56">
            <CompactWorkoutCard workout={workout} onStart={onStart} onView={onView} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrainNow() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [workoutToView, setWorkoutToView] = useState(null);

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
      setWorkouts(workoutData || []);
      setExercises(exerciseData || []);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  // Get workouts by category
  const getWorkoutsByDiscipline = (discipline) => {
    return workouts.filter(w =>
      w.primary_disciplines?.some(d => d.toLowerCase() === discipline.toLowerCase())
    ).slice(0, 6);
  };

  // Get quick/short workouts
  const quickWorkouts = workouts.filter(w => (w.estimated_duration || 45) <= 30).slice(0, 6);

  // Featured workout (first one or random)
  const featuredWorkout = workouts[0];

  // Search results
  const searchResults = searchQuery.trim()
    ? workouts.filter(w =>
        w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.goal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.primary_disciplines?.some(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const startWorkout = (workout) => {
    const sessionData = {
      title: workout.name,
      type: workout.primary_disciplines?.[0] || "strength",
      duration_minutes: workout.estimated_duration || 60,
      exercises: []
    };

    workout.blocks?.forEach(block => {
      block.exercises?.forEach(ex => {
        const newExercise = {
          exercise_id: ex.exercise_id || ex.exercise_name?.toLowerCase().replace(/\s/g, '_'),
          exercise_name: ex.exercise_name,
          notes: ex.notes || "",
          sets: []
        };

        const volume = ex.volume || "3x10";
        let numSets = 3;
        let numReps = 10;

        if (volume.includes('x')) {
          const [setsStr, repsStr] = volume.split('x');
          numSets = parseInt(setsStr) || 3;
          numReps = parseInt(repsStr) || 10;
        }

        let restSeconds = 90;
        if (ex.rest) {
          const restMatch = ex.rest.match(/\d+/);
          if (restMatch) restSeconds = parseInt(restMatch[0]);
        }

        for (let i = 0; i < numSets; i++) {
          newExercise.sets.push({
            target_reps: numReps,
            reps: 0,
            weight: 0,
            rest_seconds: restSeconds,
            is_completed: false
          });
        }

        sessionData.exercises.push(newExercise);
      });
    });

    const tempId = `temp_${Date.now()}`;
    sessionStorage.setItem(tempId, JSON.stringify(sessionData));
    navigate(createPageUrl(`LiveWorkout?id=${tempId}`));
  };

  const applyToCalendar = async (workout, selectedDate) => {
    console.log("Apply workout to calendar:", workout, selectedDate);
    alert(`Workout "${workout.name}" added to ${selectedDate}!`);
    setWorkoutToView(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-24">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-32 mb-6" />
          <div className="h-48 bg-gray-200 rounded-3xl mb-6" />
          <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
          <div className="flex gap-4">
            <div className="h-48 w-56 bg-gray-200 rounded-2xl flex-shrink-0" />
            <div className="h-48 w-56 bg-gray-200 rounded-2xl flex-shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Train Now</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, MMM d')}</p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workouts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Search Results */}
      {showSearch && searchQuery.trim() && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">
            Results for "{searchQuery}"
          </h2>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.slice(0, 6).map(workout => (
                <CompactWorkoutCard
                  key={workout.id}
                  workout={workout}
                  onStart={startWorkout}
                  onView={setWorkoutToView}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-2xl">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No workouts found</p>
              <Link
                to={createPageUrl("Chat")}
                className="text-primary-500 font-medium mt-2 inline-flex items-center gap-1"
              >
                <Sparkles className="w-4 h-4" /> Ask AI to create one
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Content (hidden during search) */}
      {!showSearch && (
        <>
          {/* Featured / Quick Start */}
          <QuickStartCard workout={featuredWorkout} onStart={startWorkout} />

          {/* Quick Workouts */}
          <WorkoutRow
            title="Quick Workouts"
            icon={Clock}
            workouts={quickWorkouts}
            onStart={startWorkout}
            onView={setWorkoutToView}
          />

          {/* Strength */}
          <WorkoutRow
            title="Strength"
            icon={Dumbbell}
            workouts={getWorkoutsByDiscipline('strength')}
            onStart={startWorkout}
            onView={setWorkoutToView}
            seeAllLink={createPageUrl("PredefinedWorkouts")}
          />

          {/* HIIT */}
          <WorkoutRow
            title="HIIT & Cardio"
            icon={Flame}
            workouts={[...getWorkoutsByDiscipline('hiit'), ...getWorkoutsByDiscipline('cardio')].slice(0, 6)}
            onStart={startWorkout}
            onView={setWorkoutToView}
          />

          {/* Browse All CTA */}
          <Link
            to={createPageUrl("PredefinedWorkouts")}
            className="block bg-gray-100 rounded-2xl p-5 text-center hover:bg-gray-200 transition-colors"
          >
            <Dumbbell className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="font-semibold text-gray-900">Browse All Workouts</p>
            <p className="text-sm text-gray-500 mt-1">{workouts.length} workouts available</p>
          </Link>

          {/* AI Generate CTA */}
          <Link
            to={createPageUrl("Chat")}
            className="block bg-gradient-to-r from-primary-50 to-indigo-50 border border-primary-100 rounded-2xl p-5 text-center hover:from-primary-100 hover:to-indigo-100 transition-colors"
          >
            <Sparkles className="w-8 h-8 text-primary-500 mx-auto mb-2" />
            <p className="font-semibold text-gray-900">Need Something Different?</p>
            <p className="text-sm text-primary-500 mt-1">Ask AI to create a custom workout</p>
          </Link>
        </>
      )}

      {/* Workout Detail Modal */}
      {workoutToView && (
        <WorkoutDetailModal
          workout={workoutToView}
          exercises={exercises}
          onClose={() => setWorkoutToView(null)}
          onApply={applyToCalendar}
          onDuplicate={() => {}}
        />
      )}
    </div>
  );
}
