import { useState, useEffect, useRef } from "react";
import { WorkoutLog } from "@/api/entities";
import { ArrowLeft, Square, Play, Pause, Plus, Minus, Check, X, Save, Trash2, MoreVertical, RefreshCw, ArrowUp, ArrowDown, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getActiveWorkout,
  saveWorkoutProgress,
  clearActiveWorkout,
  startWorkoutSession,
  buildSessionExercise
} from "@/utils/workoutSession";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import ReplaceExerciseModal from "@/components/exercise/ReplaceExerciseModal";
import ExerciseSearchInput from "@/components/exercise/ExerciseSearchInput";

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

// Swipeable Exercise Card
// - swipe RIGHT to complete all sets (existing behavior)
// - swipe LEFT to reveal quick Replace / Delete actions
// - long-press (or the kebab button) opens the full action sheet
function SwipeableExerciseCard({ exercise, exerciseIndex, onSetUpdate, onSetComplete, onCompleteAll, onOpenMenu, onReplace, onDelete }) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const suppressSwipeRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const COMPLETE_THRESHOLD = 100;   // swipe-right distance to complete all
  const REVEAL_THRESHOLD = 60;      // swipe-left distance to snap actions open
  const REVEAL_WIDTH = 148;         // how far the card slides left to show 2 buttons
  const LONG_PRESS_MS = 450;
  const MOVE_SLOP = 10;             // px of movement that cancels a long-press

  const completedSets = exercise.sets.filter(s => s.is_completed).length;
  const totalSets = exercise.sets.length;
  const isFullyComplete = completedSets === totalSets;

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleStart = (clientX, clientY) => {
    setIsDragging(true);
    startXRef.current = clientX;
    startYRef.current = clientY;
    suppressSwipeRef.current = false;
    // Start the long-press timer; any real drag (handleMove) cancels it.
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      suppressSwipeRef.current = true;
      setIsDragging(false);
      setTranslateX(0);
      if (navigator.vibrate) navigator.vibrate(30);
      onOpenMenu(exerciseIndex);
    }, LONG_PRESS_MS);
  };

  const handleMove = (clientX, clientY) => {
    if (!isDragging) return;
    const diff = clientX - startXRef.current;
    // Cancel the long-press on movement in EITHER axis — a finger sliding
    // vertically while scrolling the list shouldn't trigger the action sheet.
    const diffY = clientY == null ? 0 : clientY - startYRef.current;
    if (Math.abs(diff) > MOVE_SLOP || Math.abs(diffY) > MOVE_SLOP) cancelLongPress();
    // Right = complete (capped 150). Left = reveal actions (capped REVEAL_WIDTH).
    const base = revealed ? -REVEAL_WIDTH : 0;
    const next = Math.max(-REVEAL_WIDTH, Math.min(base + diff, 150));
    setTranslateX(next);
  };

  const handleEnd = () => {
    cancelLongPress();
    setIsDragging(false);
    if (suppressSwipeRef.current) { setTranslateX(revealed ? -REVEAL_WIDTH : 0); return; }
    if (translateX > COMPLETE_THRESHOLD) {
      onCompleteAll(exerciseIndex);
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      setRevealed(false);
      setTranslateX(0);
    } else if (translateX < -REVEAL_THRESHOLD) {
      setRevealed(true);
      setTranslateX(-REVEAL_WIDTH);
    } else {
      setRevealed(false);
      setTranslateX(0);
    }
  };

  const closeReveal = () => { setRevealed(false); setTranslateX(0); };

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-sm">
      {/* Swipe-right background: complete all */}
      <div className="absolute inset-0 bg-green-500 flex items-center pl-6">
        <div className="flex items-center gap-2 text-white">
          <Check className="w-8 h-8" />
          <span className="font-semibold">Complete All</span>
        </div>
      </div>

      {/* Swipe-left background: quick actions */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={() => { closeReveal(); onReplace(exerciseIndex); }}
          className="w-[74px] bg-blue-600 text-white flex flex-col items-center justify-center gap-1"
        >
          <RefreshCw className="w-5 h-5" />
          <span className="text-xs font-medium">Replace</span>
        </button>
        <button
          onClick={() => { closeReveal(); onDelete(exerciseIndex); }}
          className="w-[74px] bg-red-600 text-white flex flex-col items-center justify-center gap-1"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-xs font-medium">Delete</span>
        </button>
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
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
        onMouseMove={(e) => isDragging && handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={() => isDragging && handleEnd()}
      >
        {/* Exercise Header */}
        <div className={`p-4 ${isFullyComplete ? 'bg-green-50' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-1 gap-2">
            <h3 className="text-lg font-bold text-gray-900 flex-1 min-w-0">{exercise.exercise_name}</h3>
            <div className={`px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${
              isFullyComplete
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {completedSets}/{totalSets}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMenu(exerciseIndex); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="Exercise options"
              className="shrink-0 -mr-1 p-1.5 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
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

  // Exercise-modification UI state
  const [menuIndex, setMenuIndex] = useState(null);        // action sheet target
  const [replaceIndex, setReplaceIndex] = useState(null);  // Replace modal target
  const [addContext, setAddContext] = useState(null);      // { index, position } for Add above/below
  const [confirmDelete, setConfirmDelete] = useState(null); // { index, exercise } pending delete confirm
  const [undoState, setUndoState] = useState(null);        // { exercise, index } for the undo snackbar
  const undoTimerRef = useRef(null);

  // Clear the undo-snackbar timeout on unmount so it can't fire setUndoState
  // after the component is gone.
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

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

  // --- Exercise modification handlers ---

  // Re-normalize the cosmetic `order` field to match array position.
  const withOrder = (exercises) => exercises.map((e, i) => ({ ...e, order: i }));

  const requestDeleteExercise = (exIndex) => {
    setMenuIndex(null);
    setConfirmDelete({ index: exIndex, exercise: workout.exercises[exIndex] });
  };

  const performDeleteExercise = (exIndex) => {
    const removed = workout.exercises[exIndex];
    const nextExercises = withOrder(workout.exercises.filter((_, i) => i !== exIndex));
    setWorkout({ ...workout, exercises: nextExercises });
    setConfirmDelete(null);
    // Offer an undo for a few seconds (restores the exercise with its logged sets).
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ exercise: removed, index: exIndex });
    undoTimerRef.current = setTimeout(() => setUndoState(null), 6000);
    if (navigator.vibrate) navigator.vibrate(40);
  };

  const handleUndoDelete = () => {
    if (!undoState) return;
    const { exercise, index } = undoState;
    const insertAt = Math.min(index, workout.exercises.length);
    const nextExercises = withOrder([
      ...workout.exercises.slice(0, insertAt),
      exercise,
      ...workout.exercises.slice(insertAt),
    ]);
    setWorkout({ ...workout, exercises: nextExercises });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState(null);
  };

  // Replace preserves already-logged work: it swaps identity and keeps the existing
  // sets array (counts + completion). Only when the old exercise had no sets do we
  // regenerate defaults from the new exercise's strain.
  const handleReplaceExercise = (exIndex, picked) => {
    const built = buildSessionExercise(picked, exIndex);
    const old = workout.exercises[exIndex];
    // Session exercises ALWAYS have a sets array, so "has sets" is always true.
    // We only want to preserve actually-logged work; otherwise adopt the new
    // exercise's own generated defaults (e.g. swapping Plank 3×60s → Bench Press
    // shouldn't leave Bench Press with a 60-second target).
    const hasLoggedWork = old.sets && old.sets.some(
      s => s.is_completed || Number(s.reps) > 0 || Number(s.weight) > 0
    );
    const nextExercise = {
      ...built,
      notes: old.notes || '',
      sets: hasLoggedWork ? old.sets : built.sets,
    };
    const nextExercises = workout.exercises.map((e, i) => (i === exIndex ? nextExercise : e));
    setWorkout({ ...workout, exercises: withOrder(nextExercises) });
    setReplaceIndex(null);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleAddExercise = (exIndex, position, picked) => {
    const insertAt = position === 'above' ? exIndex : exIndex + 1;
    const nextExercises = withOrder([
      ...workout.exercises.slice(0, insertAt),
      buildSessionExercise(picked, insertAt),
      ...workout.exercises.slice(insertAt),
    ]);
    setWorkout({ ...workout, exercises: nextExercises });
    setAddContext(null);
    if (navigator.vibrate) navigator.vibrate(30);
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
            onOpenMenu={setMenuIndex}
            onReplace={setReplaceIndex}
            onDelete={requestDeleteExercise}
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

      {/* Per-exercise action sheet (long-press / kebab) */}
      <Drawer open={menuIndex !== null} onOpenChange={(open) => !open && setMenuIndex(null)}>
        <DrawerContent className="pb-6">
          <DrawerHeader>
            <DrawerTitle className="truncate">
              {menuIndex !== null ? workout.exercises[menuIndex]?.exercise_name : ''}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-1">
            <button
              onClick={() => { const i = menuIndex; setMenuIndex(null); setReplaceIndex(i); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-100 text-left"
            >
              <RefreshCw className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">Replace exercise</span>
            </button>
            <button
              onClick={() => { const i = menuIndex; setMenuIndex(null); setAddContext({ index: i, position: 'above' }); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-100 text-left"
            >
              <ArrowUp className="w-5 h-5 text-gray-700" />
              <span className="font-medium text-gray-900">Add exercise above</span>
            </button>
            <button
              onClick={() => { const i = menuIndex; setMenuIndex(null); setAddContext({ index: i, position: 'below' }); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-100 text-left"
            >
              <ArrowDown className="w-5 h-5 text-gray-700" />
              <span className="font-medium text-gray-900">Add exercise below</span>
            </button>
            <button
              onClick={() => requestDeleteExercise(menuIndex)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-red-50 text-left"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-600">Delete exercise</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete exercise?</h3>
            <p className="text-sm text-gray-600 mb-5">
              Remove <span className="font-semibold">{confirmDelete.exercise?.exercise_name}</span> from
              this workout? You can undo right after.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-xl font-semibold bg-gray-100 text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => performDeleteExercise(confirmDelete.index)}
                className="flex-1 py-3 rounded-xl font-semibold bg-red-600 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo snackbar */}
      {undoState && (
        <div className="fixed bottom-40 left-0 right-0 px-4 z-[60] flex justify-center">
          <div className="bg-gray-900 text-white rounded-full pl-5 pr-2 py-2 shadow-lg flex items-center gap-3 max-w-sm w-full">
            <span className="text-sm flex-1 truncate">Deleted “{undoState.exercise?.exercise_name}”</span>
            <button
              onClick={handleUndoDelete}
              className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 text-sm font-semibold"
            >
              <Undo2 className="w-4 h-4" /> Undo
            </button>
          </div>
        </div>
      )}

      {/* Replace exercise modal (Similar / Ask the Sensei / Search) */}
      {replaceIndex !== null && (
        <ReplaceExerciseModal
          exercise={workout.exercises[replaceIndex]}
          onClose={() => setReplaceIndex(null)}
          onReplace={(picked) => handleReplaceExercise(replaceIndex, picked)}
        />
      )}

      {/* Add exercise picker (above / below) */}
      <Drawer open={addContext !== null} onOpenChange={(open) => !open && setAddContext(null)}>
        <DrawerContent className="pb-6">
          <DrawerHeader>
            <DrawerTitle>
              {addContext?.position === 'above' ? 'Add exercise above' : 'Add exercise below'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4">
            {addContext && (
              <ExerciseSearchInput
                autoFocus
                placeholder="Search to add an exercise..."
                onSelect={(ex) => handleAddExercise(addContext.index, addContext.position, ex)}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
