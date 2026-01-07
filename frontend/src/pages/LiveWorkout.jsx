import { useState, useEffect, useRef } from "react";
import { WorkoutLog } from "@/api/entities";
import { ArrowLeft, Square, Play, Pause, Plus, Minus, Check, X, Save, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getActiveWorkout,
  saveWorkoutProgress,
  clearActiveWorkout,
  startWorkoutSession
} from "@/utils/workoutSession";

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

// Mood options for feedback
const MOOD_OPTIONS = [
  { value: 'exhausted', emoji: '😢', label: 'Exhausted' },
  { value: 'tired', emoji: '😕', label: 'Tired' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'great', emoji: '😄', label: 'Great' }
];

// Workout Feedback Modal Component
function FeedbackModal({ onSubmit, onDiscard, onCancel, workoutStats, isSaving }) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">How was your workout?</h3>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Workout Stats Summary */}
        <div className="bg-gray-50 rounded-xl p-3 mb-5">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{workoutStats.duration}</p>
              <p className="text-xs text-gray-500">minutes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{workoutStats.exercisesDone}</p>
              <p className="text-xs text-gray-500">exercises</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{workoutStats.setsCompleted}</p>
              <p className="text-xs text-gray-500">sets</p>
            </div>
          </div>
        </div>

        {/* Mood Selection */}
        <p className="text-sm text-gray-600 mb-3">How do you feel?</p>
        <div className="flex justify-between mb-5">
          {MOOD_OPTIONS.map((mood) => (
            <button
              key={mood.value}
              onClick={() => setSelectedMood(mood.value)}
              className={`flex flex-col items-center p-2 rounded-xl transition-all ${
                selectedMood === mood.value
                  ? 'bg-primary-100 ring-2 ring-primary-500 scale-110'
                  : 'hover:bg-gray-100'
              }`}
            >
              <span className="text-3xl">{mood.emoji}</span>
              <span className="text-xs text-gray-500 mt-1">{mood.label}</span>
            </button>
          ))}
        </div>

        {/* Notes */}
        <div className="mb-5">
          <label className="text-sm text-gray-600 mb-2 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any thoughts about this workout..."
            className="w-full p-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => onSubmit(selectedMood, notes)}
            disabled={isSaving}
            className="w-full py-3 rounded-xl font-semibold bg-green-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" /> Save Workout
              </>
            )}
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-3 rounded-xl font-semibold bg-red-50 text-red-600 flex items-center justify-center gap-2"
          >
            <Trash2 className="w-5 h-5" /> Discard
          </button>
        </div>
      </div>
    </div>
  );
}

// Swipeable Set Row - swipe right to mark as done
function SwipeableSetRow({ setData, setIndex, onUpdate, onComplete }) {
  const { target_reps, reps, weight, is_completed } = setData;
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const SWIPE_THRESHOLD = 80;

  const handleStart = (clientX) => {
    setIsDragging(true);
    startXRef.current = clientX;
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const diff = clientX - startXRef.current;
    // Only allow swiping right (positive values)
    const newTranslate = Math.max(0, Math.min(diff, 120));
    setTranslateX(newTranslate);
  };

  const handleEnd = () => {
    setIsDragging(false);
    if (translateX > SWIPE_THRESHOLD) {
      // Mark as done
      onComplete(setIndex);
      if (navigator.vibrate) navigator.vibrate(50);
    }
    setTranslateX(0);
  };

  const handleWeightChange = (delta) => {
    const newWeight = Math.max(0, (weight || 0) + delta);
    onUpdate({ ...setData, weight: newWeight });
  };

  const handleRepsChange = (delta) => {
    const newReps = Math.max(0, (reps || target_reps || 0) + delta);
    onUpdate({ ...setData, reps: newReps });
  };

  const handleTouchStart = (e) => {
    e.stopPropagation();
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (isDragging) {
      e.stopPropagation();
      handleMove(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    handleEnd();
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe background - green checkmark area */}
      <div className="absolute inset-y-0 left-0 w-full bg-green-500 flex items-center pl-4">
        <Check className="w-6 h-6 text-white" />
      </div>

      {/* Set row content */}
      <div
        className={`relative flex items-center h-14 px-3 transition-transform ${
          is_completed ? 'bg-green-50' : 'bg-gray-50'
        }`}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleStart(e.clientX); }}
        onMouseMove={(e) => { if (isDragging) { e.stopPropagation(); handleMove(e.clientX); }}}
        onMouseUp={(e) => { e.stopPropagation(); handleEnd(); }}
        onMouseLeave={() => isDragging && handleEnd()}
      >
        {/* Set Number */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
          is_completed ? 'bg-green-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
        }`}>
          {is_completed ? <Check className="w-4 h-4" /> : setIndex + 1}
        </div>

        {/* Weight Input */}
        <div className="flex items-center flex-1 justify-center">
          <button
            onClick={() => handleWeightChange(-2.5)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-gray-600 active:bg-gray-200 rounded-full"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex items-baseline gap-0.5 min-w-[60px] justify-center">
            <input
              type="number"
              value={weight || ''}
              onChange={(e) => onUpdate({ ...setData, weight: parseFloat(e.target.value) || 0 })}
              className="w-12 text-center font-semibold text-base bg-transparent focus:outline-none"
              placeholder="0"
            />
            <span className="text-xs text-gray-400">kg</span>
          </div>
          <button
            onClick={() => handleWeightChange(2.5)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-gray-600 active:bg-gray-200 rounded-full"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Reps Input */}
        <div className="flex items-center flex-1 justify-center">
          <button
            onClick={() => handleRepsChange(-1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-gray-600 active:bg-gray-200 rounded-full"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex items-baseline gap-0.5 min-w-[50px] justify-center">
            <input
              type="number"
              value={reps || target_reps || ''}
              onChange={(e) => onUpdate({ ...setData, reps: parseInt(e.target.value) || 0 })}
              className="w-10 text-center font-semibold text-base bg-transparent focus:outline-none"
              placeholder={target_reps?.toString() || '0'}
            />
            <span className="text-xs text-gray-400">reps</span>
          </div>
          <button
            onClick={() => handleRepsChange(1)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 active:text-gray-600 active:bg-gray-200 rounded-full"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Swipeable Exercise Card - swipe right to complete all sets
function SwipeableExerciseCard({ exercise, exerciseIndex, onSetUpdate, onSetComplete, onCompleteAll }) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const SWIPE_THRESHOLD = 100;

  const completedSets = exercise.sets.filter(s => s.is_completed).length;
  const totalSets = exercise.sets.length;
  const isFullyComplete = completedSets === totalSets;

  const handleStart = (clientX) => {
    setIsDragging(true);
    startXRef.current = clientX;
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const diff = clientX - startXRef.current;
    // Only allow swiping right
    const newTranslate = Math.max(0, Math.min(diff, 150));
    setTranslateX(newTranslate);
  };

  const handleEnd = () => {
    setIsDragging(false);
    if (translateX > SWIPE_THRESHOLD) {
      onCompleteAll(exerciseIndex);
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    }
    setTranslateX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-sm">
      {/* Swipe background */}
      <div className="absolute inset-0 bg-green-500 flex items-center pl-6">
        <div className="flex items-center gap-2 text-white">
          <Check className="w-8 h-8" />
          <span className="font-semibold">Complete All</span>
        </div>
      </div>

      {/* Card content */}
      <div
        className={`relative bg-white rounded-3xl overflow-hidden transition-transform ${
          isFullyComplete ? 'ring-2 ring-green-500' : ''
        }`}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX); }}
        onMouseMove={(e) => isDragging && handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={() => isDragging && handleEnd()}
      >
        {/* Exercise Header */}
        <div className={`p-4 ${isFullyComplete ? 'bg-green-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold text-gray-900">{exercise.exercise_name}</h3>
            <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
              isFullyComplete
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {completedSets}/{totalSets}
            </div>
          </div>
          {exercise.notes && (
            <p className="text-sm text-gray-500">{exercise.notes}</p>
          )}
        </div>

        {/* Sets Header */}
        <div className="flex items-center h-8 px-4 bg-gray-100 text-xs text-gray-500 font-medium">
          <div className="w-8 shrink-0 text-center">SET</div>
          <div className="flex-1 text-center">WEIGHT</div>
          <div className="flex-1 text-center">REPS</div>
        </div>

        {/* Sets List */}
        <div className="p-2 space-y-2">
          {exercise.sets.map((set, setIndex) => (
            <SwipeableSetRow
              key={setIndex}
              setData={set}
              setIndex={setIndex}
              onUpdate={(newData) => onSetUpdate(exerciseIndex, setIndex, newData)}
              onComplete={(idx) => onSetComplete(exerciseIndex, idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Global Stopwatch Component
function Stopwatch({ seconds, isRunning, onToggle }) {
  return (
    <div className="bg-black rounded-2xl px-6 py-4 flex items-center justify-center gap-4">
      <span className="text-white text-4xl font-mono font-bold tracking-wider">
        {formatTime(seconds)}
      </span>
      <button
        onClick={onToggle}
        className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
      >
        {isRunning ? (
          <Pause className="w-5 h-5 text-white" />
        ) : (
          <Play className="w-5 h-5 text-white ml-0.5" />
        )}
      </button>
    </div>
  );
}

export default function LiveWorkout() {
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [totalWorkoutTime, setTotalWorkoutTime] = useState(0);
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [workoutStartTime] = useState(new Date());
  const [isSaving, setIsSaving] = useState(false);

  // Calculate workout stats for feedback modal
  const getWorkoutStats = () => {
    if (!workout) return { duration: 0, exercisesDone: 0, setsCompleted: 0 };

    const exercisesDone = workout.exercises.filter(ex =>
      ex.sets.every(s => s.is_completed)
    ).length;

    const setsCompleted = workout.exercises.reduce((total, ex) =>
      total + ex.sets.filter(s => s.is_completed).length, 0
    );

    return {
      duration: Math.ceil(totalWorkoutTime / 60),
      exercisesDone,
      setsCompleted
    };
  };

  // Load workout data from localStorage (or legacy sessionStorage)
  useEffect(() => {
    const activeWorkout = getActiveWorkout();

    if (activeWorkout) {
      const parsed = activeWorkout.data;

      // Normalize exercise sets
      if (parsed.exercises) {
        parsed.exercises = parsed.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(set => ({
            ...set,
            reps: set.reps || set.target_reps || 0
          }))
        }));
      }

      setWorkout(parsed);

      // Restore elapsed time and keep timer running
      if (activeWorkout.totalWorkoutTime > 0) {
        setTotalWorkoutTime(activeWorkout.totalWorkoutTime);
      }
      // Timer continues running (isWorkoutRunning defaults to true)
      return;
    }

    // No valid active workout - check for legacy sessionStorage (backwards compat)
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    if (id) {
      const legacyData = sessionStorage.getItem(id);
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          if (parsed.exercises) {
            parsed.exercises = parsed.exercises.map(ex => ({
              ...ex,
              sets: ex.sets.map(set => ({
                ...set,
                reps: set.reps || set.target_reps || 0
              }))
            }));
          }
          setWorkout(parsed);

          // Migrate to new localStorage format
          startWorkoutSession(parsed);
          sessionStorage.removeItem(id); // Clean up old storage

          // Remove ?id param from URL
          window.history.replaceState({}, '', window.location.pathname);
          return;
        } catch (e) {
          console.error('Failed to parse legacy workout data:', e);
        }
      }
    }

    // No workout found at all
    navigate(-1);
  }, [navigate]);

  // Timer
  useEffect(() => {
    let interval;
    if (isWorkoutRunning) {
      interval = setInterval(() => {
        setTotalWorkoutTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkoutRunning]);

  // Auto-save progress whenever workout state or time changes
  useEffect(() => {
    if (!workout) return;

    // Debounce saves to avoid excessive writes
    const timeoutId = setTimeout(() => {
      saveWorkoutProgress(workout, totalWorkoutTime);
    }, 500); // Save 500ms after last change

    return () => clearTimeout(timeoutId);
  }, [workout, totalWorkoutTime]);

  const handleSetUpdate = (exIndex, setIndex, newSetData) => {
    const newWorkout = { ...workout };
    newWorkout.exercises[exIndex].sets[setIndex] = newSetData;
    setWorkout(newWorkout);
  };

  const handleSetComplete = (exIndex, setIndex) => {
    const newWorkout = { ...workout };
    const set = newWorkout.exercises[exIndex].sets[setIndex];
    set.is_completed = !set.is_completed;
    setWorkout(newWorkout);
  };

  const handleCompleteAllSets = (exIndex) => {
    const newWorkout = { ...workout };
    const allComplete = newWorkout.exercises[exIndex].sets.every(s => s.is_completed);
    newWorkout.exercises[exIndex].sets.forEach(set => {
      set.is_completed = !allComplete;
    });
    setWorkout(newWorkout);
  };

  // Check if all exercises are complete
  const isWorkoutComplete = workout?.exercises?.every(ex =>
    ex.sets.every(s => s.is_completed)
  );

  const getWorkoutType = (type) => {
    if (!type) return 'strength';
    return type.toLowerCase().trim();
  };

  const saveAndExit = async (mood, notes) => {
    if (!workout || isSaving) return;
    setIsSaving(true);

    try {
      const workoutLogData = {
        title: workout.title || 'Workout',
        type: getWorkoutType(workout.type),
        startedAt: workoutStartTime.toISOString(),
        completedAt: new Date().toISOString(),
        actualDuration: Math.ceil(totalWorkoutTime / 60) || workout.duration_minutes || 60,
        exercises: workout.exercises.map((ex, i) => ({
          exerciseId: ex.exercise_id,
          exerciseName: ex.exercise_name,
          order: i,
          sets: ex.sets.map((set, setIdx) => ({
            setNumber: setIdx + 1,
            targetReps: set.target_reps || 0,
            actualReps: set.reps || set.target_reps || 0,
            weight: set.weight || 0,
            restSeconds: set.rest_seconds || 90,
            isCompleted: set.is_completed || false
          })),
          notes: ex.notes || ''
        })),
        mood: mood || undefined,
        notes: notes || undefined,
        createCalendarEvent: true
      };

      console.log('Saving workout log:', workoutLogData);
      const result = await WorkoutLog.create(workoutLogData);
      console.log('Workout saved successfully:', result);
      clearActiveWorkout(); // Clear active workout from localStorage
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
      navigate(-1);
    } catch (error) {
      console.error("Failed to save workout:", error);
      alert(`Failed to save workout: ${error.message}`);
      setIsSaving(false);
    }
  };

  const discardAndExit = () => {
    clearActiveWorkout(); // Clear active workout from localStorage
    navigate(-1);
  };

  if (!workout) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-32">
      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onSubmit={saveAndExit}
          onDiscard={discardAndExit}
          onCancel={() => setShowFeedbackModal(false)}
          workoutStats={getWorkoutStats()}
          isSaving={isSaving}
        />
      )}

      {/* Header */}
      <header className="bg-white px-4 py-3 border-b sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <h1 className="font-bold text-gray-900 text-lg">{workout.title}</h1>

          <button
            onClick={() => setShowFeedbackModal(true)}
            className="w-10 h-10 border-2 border-gray-900 rounded-xl flex items-center justify-center"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Stopwatch */}
      <div className="px-4 py-4">
        <Stopwatch
          seconds={totalWorkoutTime}
          isRunning={isWorkoutRunning}
          onToggle={() => setIsWorkoutRunning(!isWorkoutRunning)}
        />
      </div>

      {/* Exercise Cards List */}
      <div className="px-4 space-y-4">
        {workout.exercises.map((exercise, index) => (
          <SwipeableExerciseCard
            key={index}
            exercise={exercise}
            exerciseIndex={index}
            onSetUpdate={handleSetUpdate}
            onSetComplete={handleSetComplete}
            onCompleteAll={handleCompleteAllSets}
          />
        ))}
      </div>

      {/* Done Workout Button - Fixed at bottom */}
      <div className="fixed bottom-20 left-0 right-0 px-4 py-3 bg-white border-t z-20">
        <button
          onClick={() => setShowFeedbackModal(true)}
          className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
            isWorkoutComplete
              ? 'bg-green-600 text-white'
              : 'bg-gray-900 text-white'
          }`}
        >
          <Check className="w-6 h-6" />
          Done Workout
        </button>
      </div>
    </div>
  );
}
