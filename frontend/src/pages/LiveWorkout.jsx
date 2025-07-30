import React, { useState, useEffect, useCallback } from "react";
import { Workout } from "@/api/entities";
import { ArrowLeft, Play, Pause, Square, ChevronsRight, ChevronsLeft, Timer, AlarmClock, Check, Undo } from "lucide-react";
import { useNavigate } from "react-router-dom";

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

export default function LiveWorkout() {
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  
  // Timers State
  const [totalWorkoutTime, setTotalWorkoutTime] = useState(0);
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(true);
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [timedExerciseTimer, setTimedExerciseTimer] = useState(0);
  const [isTimedExerciseRunning, setIsTimedExerciseRunning] = useState(false);

  useEffect(() => {
    // Load workout from sessionStorage
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const workoutData = sessionStorage.getItem(id);
    if (workoutData) {
      setWorkout(JSON.parse(workoutData));
    } else {
      // Handle case where no workout is found
      navigate(-1);
    }
  }, [navigate]);

  // Main Workout Timer
  useEffect(() => {
    let interval;
    if (isWorkoutRunning) {
      interval = setInterval(() => {
        setTotalWorkoutTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkoutRunning]);
  
  // Rest Timer
  useEffect(() => {
    let interval;
    if (isResting && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
    } else if (isResting && restTimer === 0) {
      setIsResting(false);
      // Optional: play a sound
    }
    return () => clearInterval(interval);
  }, [isResting, restTimer]);
  
  // Timed Exercise Timer
  useEffect(() => {
    let interval;
    if (isTimedExerciseRunning && timedExerciseTimer > 0) {
      interval = setInterval(() => {
        setTimedExerciseTimer(prev => prev - 1);
      }, 1000);
    } else if (isTimedExerciseRunning && timedExerciseTimer === 0) {
      setIsTimedExerciseRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimedExerciseRunning, timedExerciseTimer]);


  const handleSetChange = (exIndex, setIndex, field, value) => {
    const newWorkout = { ...workout };
    newWorkout.exercises[exIndex].sets[setIndex][field] = value;
    setWorkout(newWorkout);
  };
  
  const toggleSetComplete = (exIndex, setIndex) => {
    const newWorkout = { ...workout };
    const set = newWorkout.exercises[exIndex].sets[setIndex];
    set.is_completed = !set.is_completed;
    
    if (set.is_completed && set.rest_seconds > 0) {
      setRestTimer(set.rest_seconds);
      setIsResting(true);
    } else {
      setIsResting(false);
      setRestTimer(0);
    }
    
    setWorkout(newWorkout);
  };
  
  const startTimedExercise = (duration) => {
    setTimedExerciseTimer(duration);
    setIsTimedExerciseRunning(true);
  };
  
  const endWorkout = async () => {
    if (!workout) return;
    
    try {
      // Add final duration and save workout
      const finalWorkout = { ...workout, duration_minutes: Math.ceil(totalWorkoutTime / 60) };
      await Workout.create(finalWorkout);
      alert("Workout saved successfully!");
      navigate(-1); // Go back to where user came from
    } catch (error) {
      console.error("Failed to save workout:", error);
      alert("Error saving workout. Please try again.");
    }
  };

  if (!workout) {
    return <div>Loading workout...</div>;
  }
  
  const currentExercise = workout.exercises[currentExerciseIndex];
  const isTimeBased = !!currentExercise.duration_seconds;

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col p-4">
      {/* Header */}
      <header className="flex items-center justify-between pb-4 border-b border-gray-700">
        <button onClick={() => navigate(-1)}><ArrowLeft /></button>
        <h1 className="text-xl font-bold">{workout.title}</h1>
        <div className="flex items-center gap-2">
          <Timer className="w-5 h-5"/>
          <span>{formatTime(totalWorkoutTime)}</span>
          <button onClick={() => setIsWorkoutRunning(!isWorkoutRunning)}>
            {isWorkoutRunning ? <Pause size={20}/> : <Play size={20}/>}
          </button>
        </div>
      </header>

      {/* Exercise Navigation */}
      <div className="flex items-center justify-between py-4">
        <button 
          onClick={() => setCurrentExerciseIndex(prev => Math.max(0, prev - 1))}
          disabled={currentExerciseIndex === 0}
          className="disabled:opacity-30"
        >
          <ChevronsLeft size={32}/>
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-bold">{currentExercise.exercise_name}</h2>
          <p className="text-gray-400">{currentExerciseIndex + 1} / {workout.exercises.length}</p>
        </div>
        <button 
          onClick={() => setCurrentExerciseIndex(prev => Math.min(workout.exercises.length - 1, prev + 1))}
          disabled={currentExerciseIndex === workout.exercises.length - 1}
          className="disabled:opacity-30"
        >
          <ChevronsRight size={32}/>
        </button>
      </div>
      
      {/* Rest Timer Overlay */}
      {isResting && (
        <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
          <AlarmClock className="w-16 h-16 text-yellow-400 mb-4"/>
          <h2 className="text-6xl font-bold">{formatTime(restTimer)}</h2>
          <p className="text-xl text-gray-300 mb-6">Rest</p>
          <button onClick={() => setIsResting(false)} className="bg-gray-600 px-6 py-2 rounded-lg">Skip</button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {isTimeBased ? (
          // UI for time-based exercises
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div 
              className="w-64 h-64 rounded-full border-8 border-blue-500 flex items-center justify-center"
              onClick={() => isTimedExerciseRunning ? setIsTimedExerciseRunning(false) : startTimedExercise(timedExerciseTimer || currentExercise.duration_seconds)}
            >
              <div className="text-center">
                <p className="text-5xl font-bold">{formatTime(timedExerciseTimer)}</p>
                <p className="text-gray-400">Tap to {isTimedExerciseRunning ? 'Pause' : 'Start'}</p>
              </div>
            </div>
            <button 
              onClick={() => startTimedExercise(currentExercise.duration_seconds)}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
            >
              Reset Timer
            </button>
          </div>
        ) : (
          // UI for set-based exercises
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2 text-center text-gray-400 text-sm font-bold">
              <span>SET</span>
              <span>REPS</span>
              <span>WEIGHT</span>
              <span>RPE</span>
              <span>DONE</span>
            </div>
            {currentExercise.sets.map((set, setIndex) => (
              <div key={setIndex} className={`grid grid-cols-5 gap-2 items-center p-2 rounded-lg ${set.is_completed ? 'bg-green-800/50' : 'bg-gray-800'}`}>
                <div className="text-center font-bold">{setIndex + 1}</div>
                <input type="number" value={set.reps || ''} onChange={e => handleSetChange(currentExerciseIndex, setIndex, 'reps', e.target.value)} className="bg-gray-700 text-center rounded p-2"/>
                <input type="number" value={set.weight || ''} onChange={e => handleSetChange(currentExerciseIndex, setIndex, 'weight', e.target.value)} className="bg-gray-700 text-center rounded p-2"/>
                <input type="number" value={set.rpe || ''} onChange={e => handleSetChange(currentExerciseIndex, setIndex, 'rpe', e.target.value)} className="bg-gray-700 text-center rounded p-2"/>
                <button 
                  onClick={() => toggleSetComplete(currentExerciseIndex, setIndex)}
                  className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center transition-colors ${set.is_completed ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  {set.is_completed ? <Undo/> : <Check />}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="pt-4 border-t border-gray-700">
        <button 
          onClick={endWorkout}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2"
        >
          <Square className="w-5 h-5"/> End Workout
        </button>
      </footer>
    </div>
  );
}