import React, { useState, useEffect, useCallback, useRef } from "react";
import { Workout, WorkoutLog } from "@/api/entities";
import {
  ArrowLeft, Play, Pause, Square, ChevronLeft, ChevronRight,
  Timer, Check, RotateCcw, Plus, Minus, SkipForward, Trash2, Save, Clock, CheckCircle, X
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// Mood options for feedback
const MOOD_OPTIONS = [
  { value: 'exhausted', emoji: '😢', label: 'Exhausted' },
  { value: 'tired', emoji: '😕', label: 'Tired' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'great', emoji: '😄', label: 'Great' }
];

// Workout Feedback Modal Component
function FeedbackModal({ onSubmit, onCancel, workoutStats }) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await onSubmit(selectedMood, notes);
  };

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

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl font-semibold bg-green-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" /> Save Workout
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

// Rest Timer Overlay Component
function RestTimer({ duration, onSkip, onAdjust }) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setTimeLeft(duration);
    setIsPaused(false);
  }, [duration]);

  useEffect(() => {
    if (isPaused || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          onSkip();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, timeLeft, onSkip]);

  const progress = ((duration - timeLeft) / duration) * 100;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6">
      <div className="relative w-48 h-48 mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#374151" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="45"
            fill="none" stroke="#FE5334" strokeWidth="6"
            strokeDasharray={`${progress * 2.83} 283`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-white">{formatTime(timeLeft)}</span>
          <span className="text-gray-400 mt-1 text-xs">Rest</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => { onAdjust(-15); setTimeLeft(prev => Math.max(0, prev - 15)); }}
          className="bg-gray-800 text-white px-3 py-2 rounded-xl font-medium flex items-center gap-1 text-sm"
        >
          <Minus className="w-3 h-3" /> 15s
        </button>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center"
        >
          {isPaused ? <Play className="w-6 h-6 text-white" /> : <Pause className="w-6 h-6 text-white" />}
        </button>
        <button
          onClick={() => { onAdjust(15); setTimeLeft(prev => prev + 15); }}
          className="bg-gray-800 text-white px-3 py-2 rounded-xl font-medium flex items-center gap-1 text-sm"
        >
          <Plus className="w-3 h-3" /> 15s
        </button>
      </div>

      <button onClick={onSkip} className="text-gray-400 font-medium flex items-center gap-2 text-sm">
        <SkipForward className="w-4 h-4" /> Skip
      </button>
    </div>
  );
}

// Set Row Component - Ultra compact layout with stacked +/- buttons
function SetRow({ setData, setIndex, onUpdate, onComplete, onStartRest }) {
  const { target_reps, reps, weight, is_completed, rest_seconds } = setData;

  const handleWeightChange = (delta) => {
    const newWeight = Math.max(0, (weight || 0) + delta);
    onUpdate({ ...setData, weight: newWeight });
  };

  const handleRepsChange = (delta) => {
    const newReps = Math.max(0, (reps || target_reps || 0) + delta);
    onUpdate({ ...setData, reps: newReps });
  };

  return (
    <div className={`flex items-center gap-1 py-1.5 px-1.5 rounded-lg transition-all ${
      is_completed ? 'bg-green-50' : 'bg-gray-50'
    }`}>
      {/* Set Number */}
      <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
        is_completed ? 'bg-green-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
      }`}>
        {is_completed ? <Check className="w-2.5 h-2.5" /> : setIndex + 1}
      </div>

      {/* Weight Input Group - Stacked buttons */}
      <div className="flex items-center flex-1 min-w-0">
        <div className="flex flex-col shrink-0">
          <button
            onClick={() => handleWeightChange(2.5)}
            className="w-5 h-4 flex items-center justify-center text-gray-400 active:text-gray-600 bg-white rounded-t border border-gray-200 border-b-0"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => handleWeightChange(-2.5)}
            className="w-5 h-4 flex items-center justify-center text-gray-400 active:text-gray-600 bg-white rounded-b border border-gray-200"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="flex items-baseline ml-0.5">
          <input
            type="number"
            value={weight || ''}
            onChange={(e) => onUpdate({ ...setData, weight: parseFloat(e.target.value) || 0 })}
            className="w-7 text-center font-semibold text-xs bg-transparent focus:outline-none"
            placeholder="0"
          />
          <span className="text-[9px] text-gray-400">kg</span>
        </div>
      </div>

      {/* Reps Input Group - Stacked buttons */}
      <div className="flex items-center flex-1 min-w-0">
        <div className="flex flex-col shrink-0">
          <button
            onClick={() => handleRepsChange(1)}
            className="w-5 h-4 flex items-center justify-center text-gray-400 active:text-gray-600 bg-white rounded-t border border-gray-200 border-b-0"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => handleRepsChange(-1)}
            className="w-5 h-4 flex items-center justify-center text-gray-400 active:text-gray-600 bg-white rounded-b border border-gray-200"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="flex items-baseline ml-0.5">
          <input
            type="number"
            value={reps || target_reps || ''}
            onChange={(e) => onUpdate({ ...setData, reps: parseInt(e.target.value) || 0 })}
            className="w-6 text-center font-semibold text-xs bg-transparent focus:outline-none"
            placeholder={target_reps?.toString() || '0'}
          />
          <span className="text-[9px] text-gray-400">reps</span>
        </div>
      </div>

      {/* Action Buttons - Stacked */}
      <div className="flex flex-col shrink-0">
        <button
          onClick={() => onStartRest(rest_seconds || 90)}
          className="w-6 h-5 rounded-t flex items-center justify-center text-gray-400 hover:bg-gray-200 active:bg-gray-300 bg-white border border-gray-200 border-b-0"
        >
          <Clock className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={() => onComplete(setIndex)}
          className={`w-6 h-5 rounded-b flex items-center justify-center transition-all active:scale-95 ${
            is_completed
              ? 'bg-green-500 text-white'
              : 'bg-primary-500 text-white'
          }`}
        >
          {is_completed ? <RotateCcw className="w-2.5 h-2.5" /> : <Check className="w-2.5 h-2.5" />}
        </button>
      </div>
    </div>
  );
}

// Exercise List Item - Single line compact
function ExerciseListItem({ exercise, index, isActive, isCompleted, onClick }) {
  const completedSets = exercise.sets.filter(s => s.is_completed).length;
  const totalSets = exercise.sets.length;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 py-1 px-2 border-l-2 transition-all ${
        isActive
          ? 'border-l-primary-500 bg-primary-50'
          : isCompleted
            ? 'border-l-green-500 bg-green-50/50'
            : 'border-l-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <p className={`font-medium text-[11px] truncate flex-1 text-left ${isActive ? 'text-primary-700' : isCompleted ? 'text-green-700' : 'text-gray-900'}`}>
        {exercise.exercise_name}
      </p>
      <span className="text-[9px] text-gray-400 shrink-0">
        {totalSets}×{exercise.sets[0]?.target_reps || '?'}
      </span>
      {isCompleted ? (
        <Check className="w-3 h-3 text-green-500 shrink-0" />
      ) : (
        <span className="text-[9px] text-gray-400 shrink-0 w-5 text-right">
          {completedSets}/{totalSets}
        </span>
      )}
    </button>
  );
}

export default function LiveWorkout() {
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [totalWorkoutTime, setTotalWorkoutTime] = useState(0);
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(true);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(90);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [workoutStartTime] = useState(new Date());

  const exerciseListRef = useRef(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const workoutData = sessionStorage.getItem(id);
    if (workoutData) {
      const parsed = JSON.parse(workoutData);
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
    } else {
      navigate(-1);
    }
  }, [navigate]);

  // Scroll to active exercise in list
  useEffect(() => {
    if (exerciseListRef.current) {
      const activeItem = exerciseListRef.current.children[currentExerciseIndex];
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentExerciseIndex]);

  useEffect(() => {
    let interval;
    if (isWorkoutRunning) {
      interval = setInterval(() => {
        setTotalWorkoutTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkoutRunning]);

  const handleSetUpdate = (exIndex, setIndex, newSetData) => {
    const newWorkout = { ...workout };
    newWorkout.exercises[exIndex].sets[setIndex] = newSetData;
    setWorkout(newWorkout);
  };

  // Just marks as complete, no auto rest timer
  const handleSetComplete = (setIndex) => {
    const newWorkout = { ...workout };
    const set = newWorkout.exercises[currentExerciseIndex].sets[setIndex];
    set.is_completed = !set.is_completed;
    if (navigator.vibrate && set.is_completed) navigator.vibrate(50);
    setWorkout(newWorkout);
  };

  // Separate function to start rest timer
  const handleStartRest = (duration) => {
    setRestDuration(duration);
    setShowRestTimer(true);
  };

  // Complete all sets for current exercise
  const handleCompleteAllSets = () => {
    const newWorkout = { ...workout };
    const allComplete = newWorkout.exercises[currentExerciseIndex].sets.every(s => s.is_completed);

    newWorkout.exercises[currentExerciseIndex].sets.forEach(set => {
      set.is_completed = !allComplete;
    });

    if (navigator.vibrate) navigator.vibrate(allComplete ? 30 : [50, 30, 50]);
    setWorkout(newWorkout);
  };

  const handleRestTimerSkip = useCallback(() => {
    setShowRestTimer(false);
  }, []);

  const handleRestTimerAdjust = useCallback((delta) => {
    setRestDuration(prev => Math.max(0, prev + delta));
  }, []);

  const goToNextExercise = () => {
    if (currentExerciseIndex < workout.exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
    }
  };

  const goToPrevExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(prev => prev - 1);
    }
  };

  // Get workout type - just log a warning if it's an unknown type
  const getWorkoutType = (type) => {
    if (!type) {
      console.warn('LiveWorkout: No workout type provided, defaulting to "strength"');
      return 'strength';
    }
    const normalized = type.toLowerCase().trim();
    const knownTypes = ['strength', 'cardio', 'hybrid', 'recovery', 'hiit', 'flexibility', 'calisthenics', 'mobility', 'meditation', 'climbing', 'running', 'cycling', 'yoga', 'swimming', 'walking', 'other'];
    if (!knownTypes.includes(normalized)) {
      console.warn(`LiveWorkout: Unknown workout type "${type}", using as-is`);
    }
    return normalized;
  };

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

  // Show feedback modal when user clicks "Save Workout"
  const handleShowFeedback = () => {
    setShowFinishConfirm(false);
    setShowFeedbackModal(true);
  };

  // Save workout with feedback to WorkoutLog
  const saveAndExit = async (mood, notes) => {
    if (!workout) return;
    try {
      // Build workout log data
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
        createCalendarEvent: true // Backend will create linked calendar event
      };

      await WorkoutLog.create(workoutLogData);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
      navigate(-1);
    } catch (error) {
      console.error("Failed to save workout:", error);
      alert(`Failed to save workout: ${error.message}`);
    }
  };

  const discardAndExit = () => {
    navigate(-1);
  };

  if (!workout) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentExercise = workout.exercises[currentExerciseIndex];
  const completedSets = currentExercise.sets.filter(s => s.is_completed).length;
  const totalSets = currentExercise.sets.length;
  const totalExercisesDone = workout.exercises.filter(ex => ex.sets.every(s => s.is_completed)).length;
  const isLastExercise = currentExerciseIndex === workout.exercises.length - 1;
  const allCurrentSetsComplete = currentExercise.sets.every(s => s.is_completed);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Rest Timer Overlay */}
      {showRestTimer && (
        <RestTimer duration={restDuration} onSkip={handleRestTimerSkip} onAdjust={handleRestTimerAdjust} />
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onSubmit={saveAndExit}
          onCancel={() => setShowFeedbackModal(false)}
          workoutStats={getWorkoutStats()}
        />
      )}

      {/* Finish Confirm Modal - Centered */}
      {showFinishConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-center mb-2">Finish Workout?</h3>
            <p className="text-gray-600 text-center mb-6">
              {totalExercisesDone}/{workout.exercises.length} exercises completed
              <br />
              <span className="text-sm text-gray-400">Duration: {formatTime(totalWorkoutTime)}</span>
            </p>
            <div className="space-y-3">
              <button
                onClick={handleShowFeedback}
                className="w-full py-3 rounded-xl font-semibold bg-green-600 text-white flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" /> Save Workout
              </button>
              <button
                onClick={discardAndExit}
                className="w-full py-3 rounded-xl font-semibold bg-red-50 text-red-600 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" /> Discard
              </button>
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="w-full py-3 rounded-xl font-semibold text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header - Compact */}
      <header className="bg-white px-3 py-2 border-b shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowFinishConfirm(true)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="text-center flex-1">
            <h1 className="font-bold text-gray-900 uppercase tracking-wide text-xs">{workout.title}</h1>
            <div className="flex items-center justify-center gap-1.5 text-gray-500">
              <Timer className="w-3 h-3" />
              <span className="font-mono text-xs">{formatTime(totalWorkoutTime)}</span>
              <button onClick={() => setIsWorkoutRunning(!isWorkoutRunning)} className="ml-0.5">
                {isWorkoutRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowFinishConfirm(true)}
            className="w-8 h-8 border-2 border-primary-500 text-primary-500 rounded-lg flex items-center justify-center"
          >
            <Square className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* Current Exercise Panel - Compact */}
      <div className="flex-1 bg-white px-3 py-2 flex flex-col min-h-0">
        {/* Exercise Header - Compact */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <button
            onClick={goToPrevExercise}
            disabled={currentExerciseIndex === 0}
            className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center flex-1 px-2">
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {currentExercise.exercise_name}
            </h2>
            <p className="text-xs text-gray-500">
              Set {Math.min(completedSets + 1, totalSets)} of {totalSets}
            </p>
          </div>

          {/* Complete All Button */}
          <button
            onClick={handleCompleteAllSets}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              allCurrentSetsComplete
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
            }`}
            title={allCurrentSetsComplete ? "Undo all" : "Complete all sets"}
          >
            <CheckCircle className="w-4 h-4" />
          </button>

          <button
            onClick={goToNextExercise}
            disabled={isLastExercise}
            className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center disabled:opacity-30 ml-1"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Sets Header */}
        <div className="flex items-center gap-1 h-5 px-1.5 text-[9px] text-gray-400 font-medium shrink-0">
          <div className="w-5 shrink-0 text-center">SET</div>
          <div className="flex-1 text-center">WEIGHT</div>
          <div className="flex-1 text-center">REPS</div>
          <div className="w-6 shrink-0"></div>
        </div>

        {/* Sets List - Scrollable */}
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {currentExercise.sets.map((set, setIndex) => (
            <SetRow
              key={setIndex}
              setData={set}
              setIndex={setIndex}
              onUpdate={(newData) => handleSetUpdate(currentExerciseIndex, setIndex, newData)}
              onComplete={handleSetComplete}
              onStartRest={handleStartRest}
            />
          ))}
        </div>

        {/* Notes */}
        {currentExercise.notes && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg shrink-0">
            <p className="text-xs text-yellow-800">{currentExercise.notes}</p>
          </div>
        )}
      </div>

      {/* Exercise List - Compact */}
      <div className="bg-gray-100 border-t shrink-0" style={{ height: '130px' }}>
        <div className="px-3 py-1.5 border-b bg-white">
          <p className="text-[10px] text-gray-500 font-medium">
            {totalExercisesDone}/{workout.exercises.length} Exercises
          </p>
        </div>
        <div
          ref={exerciseListRef}
          className="overflow-y-auto divide-y divide-gray-100"
          style={{ height: 'calc(130px - 28px)' }}
        >
          {workout.exercises.map((ex, idx) => (
            <ExerciseListItem
              key={idx}
              exercise={ex}
              index={idx}
              isActive={idx === currentExerciseIndex}
              isCompleted={ex.sets.every(s => s.is_completed)}
              onClick={() => setCurrentExerciseIndex(idx)}
            />
          ))}
        </div>
      </div>

      {/* Bottom Action - Two buttons */}
      <div className="px-3 py-2 bg-white border-t shrink-0">
        {isLastExercise ? (
          <button
            onClick={() => setShowFinishConfirm(true)}
            className="w-full bg-green-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 active:bg-green-700"
          >
            <Check className="w-4 h-4" /> Complete Workout
          </button>
        ) : (
          <div className="flex gap-2">
            {/* Complete and Continue - marks all sets done and goes to next */}
            <button
              onClick={() => {
                // Mark all sets complete
                const newWorkout = { ...workout };
                newWorkout.exercises[currentExerciseIndex].sets.forEach(set => {
                  set.is_completed = true;
                });
                setWorkout(newWorkout);
                if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
                // Go to next
                goToNextExercise();
              }}
              className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:bg-green-700 text-sm"
            >
              <CheckCircle className="w-4 h-4" /> Complete & Continue
            </button>
            {/* Next Exercise - just moves to next */}
            <button
              onClick={goToNextExercise}
              className="flex-1 bg-primary-500 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:bg-primary-600 text-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
