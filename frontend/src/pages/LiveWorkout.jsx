import React, { useState, useEffect, useCallback, useRef } from "react";
import { Workout } from "@/api/entities";
import {
  ArrowLeft, Play, Pause, Square, ChevronLeft, ChevronRight,
  Timer, Check, RotateCcw, Plus, Minus, SkipForward, Trash2, Save, Clock, CheckCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";

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

// Spacious Set Row Component - with separate timer and check buttons
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
    <div className={`flex items-center gap-3 py-3 px-3 rounded-xl transition-all ${
      is_completed ? 'bg-green-50' : 'bg-white'
    }`}>
      {/* Set Number */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
        is_completed ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700'
      }`}>
        {is_completed ? <Check className="w-4 h-4" /> : setIndex + 1}
      </div>

      {/* Weight */}
      <div className="flex items-center gap-1 flex-1 justify-center">
        <button onClick={() => handleWeightChange(-2.5)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center active:bg-gray-200">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="w-16 text-center">
          <input
            type="number"
            value={weight || ''}
            onChange={(e) => onUpdate({ ...setData, weight: parseFloat(e.target.value) || 0 })}
            className="w-full text-center font-bold text-lg bg-transparent"
            placeholder="0"
          />
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">kg</span>
        </div>
        <button onClick={() => handleWeightChange(2.5)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center active:bg-gray-200">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Reps */}
      <div className="flex items-center gap-1 flex-1 justify-center">
        <button onClick={() => handleRepsChange(-1)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center active:bg-gray-200">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="w-12 text-center">
          <input
            type="number"
            value={reps || target_reps || ''}
            onChange={(e) => onUpdate({ ...setData, reps: parseInt(e.target.value) || 0 })}
            className="w-full text-center font-bold text-lg bg-transparent"
            placeholder={target_reps?.toString() || '0'}
          />
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">reps</span>
        </div>
        <button onClick={() => handleRepsChange(1)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center active:bg-gray-200">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Timer Button - starts rest timer */}
      <button
        onClick={() => onStartRest(rest_seconds || 90)}
        className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200 shrink-0"
      >
        <Clock className="w-5 h-5" />
      </button>

      {/* Complete Button - just marks as done */}
      <button
        onClick={() => onComplete(setIndex)}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
          is_completed ? 'bg-green-500 text-white' : 'bg-primary-500 text-white'
        }`}
      >
        {is_completed ? <RotateCcw className="w-5 h-5" /> : <Check className="w-5 h-5" />}
      </button>
    </div>
  );
}

// Vertical Exercise List Item - Clean, minimal
function ExerciseListItem({ exercise, index, isActive, isCompleted, onClick }) {
  const completedSets = exercise.sets.filter(s => s.is_completed).length;
  const totalSets = exercise.sets.length;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 py-2.5 px-4 border-l-4 transition-all ${
        isActive
          ? 'border-l-primary-500 bg-primary-50'
          : isCompleted
            ? 'border-l-green-500 bg-green-50/50'
            : 'border-l-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex-1 text-left min-w-0">
        <p className={`font-semibold text-sm truncate ${isActive ? 'text-primary-700' : isCompleted ? 'text-green-700' : 'text-gray-900'}`}>
          {exercise.exercise_name}
        </p>
        <p className="text-xs text-gray-500">
          {totalSets} sets × {exercise.sets[0]?.target_reps || '?'} reps
        </p>
      </div>

      {isCompleted ? (
        <Check className="w-5 h-5 text-green-500 shrink-0" />
      ) : (
        <span className="text-xs text-gray-400 shrink-0">
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

  const saveAndExit = async () => {
    if (!workout) return;
    try {
      // Build proper workout data for API
      const workoutLog = {
        title: workout.title || 'Workout',
        type: workout.type || 'strength',
        date: new Date().toISOString().split('T')[0],
        duration_minutes: Math.ceil(totalWorkoutTime / 60),
        exercises: workout.exercises.map(ex => ({
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          notes: ex.notes || '',
          sets: ex.sets.map(set => ({
            weight: set.weight || 0,
            reps: set.reps || set.target_reps || 0,
            target_reps: set.target_reps || 0,
            is_completed: set.is_completed || false
          }))
        })),
        notes: '',
        completed_at: new Date().toISOString()
      };

      await Workout.create(workoutLog);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
      navigate(-1);
    } catch (error) {
      console.error("Failed to save workout:", error);
      // Still navigate away - the workout data is in session anyway
      navigate(-1);
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
                onClick={saveAndExit}
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

      {/* Header */}
      <header className="bg-white px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowFinishConfirm(true)} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center flex-1">
            <h1 className="font-bold text-gray-900 uppercase tracking-wide text-sm">{workout.title}</h1>
            <div className="flex items-center justify-center gap-2 text-gray-500 mt-0.5">
              <Timer className="w-4 h-4" />
              <span className="font-mono">{formatTime(totalWorkoutTime)}</span>
              <button onClick={() => setIsWorkoutRunning(!isWorkoutRunning)} className="ml-1">
                {isWorkoutRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowFinishConfirm(true)}
            className="w-10 h-10 border-2 border-primary-500 text-primary-500 rounded-lg flex items-center justify-center"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Current Exercise Panel */}
      <div className="flex-1 bg-white px-4 py-4 flex flex-col min-h-0">
        {/* Exercise Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <button
            onClick={goToPrevExercise}
            disabled={currentExerciseIndex === 0}
            className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center flex-1 px-3">
            <h2 className="text-xl font-bold text-gray-900">
              {currentExercise.exercise_name}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Set {Math.min(completedSets + 1, totalSets)} of {totalSets}
            </p>
          </div>

          {/* Complete All Button */}
          <button
            onClick={handleCompleteAllSets}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              allCurrentSetsComplete
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-600'
            }`}
            title={allCurrentSetsComplete ? "Undo all" : "Complete all sets"}
          >
            <CheckCircle className="w-5 h-5" />
          </button>

          <button
            onClick={goToNextExercise}
            disabled={isLastExercise}
            className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center disabled:opacity-30 ml-2"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Sets List - Scrollable */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
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
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl shrink-0">
            <p className="text-sm text-yellow-800">{currentExercise.notes}</p>
          </div>
        )}
      </div>

      {/* Exercise List - Fixed height showing ~3 items */}
      <div className="bg-gray-100 border-t shrink-0" style={{ height: '160px' }}>
        <div className="px-4 py-2 border-b bg-white">
          <p className="text-xs text-gray-500 font-medium">
            {totalExercisesDone}/{workout.exercises.length} Exercises
          </p>
        </div>
        <div
          ref={exerciseListRef}
          className="overflow-y-auto divide-y divide-gray-100"
          style={{ height: 'calc(160px - 36px)' }}
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

      {/* Bottom Action */}
      <div className="p-4 bg-white border-t shrink-0">
        {isLastExercise ? (
          <button
            onClick={() => setShowFinishConfirm(true)}
            className="w-full bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 active:bg-green-700"
          >
            <Check className="w-5 h-5" /> Complete Workout
          </button>
        ) : (
          <button
            onClick={goToNextExercise}
            className={`w-full font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              allCurrentSetsComplete
                ? 'bg-green-600 text-white active:bg-green-700'
                : 'bg-primary-500 text-white active:bg-primary-600'
            }`}
          >
            {allCurrentSetsComplete ? (
              <>
                <Check className="w-5 h-5" /> Complete & Next
              </>
            ) : (
              <>
                Next Exercise <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
