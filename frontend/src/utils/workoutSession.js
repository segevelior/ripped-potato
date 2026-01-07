/**
 * Workout Session Management Utility
 *
 * Manages active workout state in localStorage for persistence across
 * navigation, tab switches, and browser restarts.
 */

const ACTIVE_WORKOUT_KEY = 'activeWorkout';
const ACTIVE_WORKOUT_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @typedef {Object} WorkoutSet
 * @property {number} target_reps
 * @property {number} reps
 * @property {number} weight
 * @property {number} rest_seconds
 * @property {boolean} is_completed
 */

/**
 * @typedef {Object} WorkoutExercise
 * @property {string} exercise_id
 * @property {string} exercise_name
 * @property {string} notes
 * @property {WorkoutSet[]} sets
 */

/**
 * @typedef {Object} WorkoutData
 * @property {string} title
 * @property {string} type
 * @property {number} duration_minutes
 * @property {WorkoutExercise[]} exercises
 */

/**
 * @typedef {Object} ActiveWorkout
 * @property {WorkoutData} data
 * @property {number} totalWorkoutTime - seconds elapsed
 * @property {number} startedAt - timestamp
 * @property {number} lastSavedAt - timestamp
 */

/**
 * Get the active workout from localStorage
 * @returns {ActiveWorkout|null}
 */
export function getActiveWorkout() {
  try {
    const json = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    console.log('[WorkoutSession] getActiveWorkout - raw value exists:', !!json);
    if (!json) return null;

    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed.data || !parsed.startedAt) {
      console.warn('[WorkoutSession] Invalid active workout data, clearing');
      localStorage.removeItem(ACTIVE_WORKOUT_KEY);
      return null;
    }

    // Check TTL
    const age = Date.now() - parsed.startedAt;
    if (age >= ACTIVE_WORKOUT_TTL) {
      console.log('[WorkoutSession] Active workout expired, clearing');
      localStorage.removeItem(ACTIVE_WORKOUT_KEY);
      return null;
    }

    console.log('[WorkoutSession] getActiveWorkout - returning:', parsed.data?.title);
    return parsed;
  } catch (error) {
    console.error('[WorkoutSession] Failed to parse active workout:', error);
    localStorage.removeItem(ACTIVE_WORKOUT_KEY);
    return null;
  }
}

/**
 * Check if there's a valid active workout
 * @returns {boolean}
 */
export function hasActiveWorkout() {
  return getActiveWorkout() !== null;
}

/**
 * Start a new workout session
 * @param {WorkoutData} workoutData
 */
export function startWorkoutSession(workoutData) {
  const activeWorkout = {
    data: workoutData,
    totalWorkoutTime: 0,
    startedAt: Date.now(),
    lastSavedAt: Date.now()
  };
  console.log('[WorkoutSession] Starting new workout session:', activeWorkout.data?.title);
  localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(activeWorkout));
  console.log('[WorkoutSession] Workout saved to localStorage');
}

/**
 * Save progress of active workout
 * @param {WorkoutData} workoutData - current workout state
 * @param {number} totalWorkoutTime - elapsed seconds
 */
export function saveWorkoutProgress(workoutData, totalWorkoutTime) {
  const existing = getActiveWorkout();
  if (!existing) {
    console.warn('[WorkoutSession] No active workout to save progress to');
    return;
  }

  const updated = {
    ...existing,
    data: workoutData,
    totalWorkoutTime,
    lastSavedAt: Date.now()
  };
  localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(updated));
}

/**
 * Clear the active workout (on complete or discard)
 */
export function clearActiveWorkout() {
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
}

// Helper to validate MongoDB ObjectId format (24 hex characters)
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Parse volume string (e.g., "3x10") into sets and reps
 * Returns null if the volume cannot be parsed
 * @param {string} volume
 * @returns {{ numSets: number, numReps: number } | null}
 */
function parseVolume(volume) {
  if (!volume || typeof volume !== 'string') return null;

  if (volume.includes('x')) {
    const [setsStr, repsStr] = volume.split('x');
    const numSets = parseInt(setsStr);
    const numReps = parseInt(repsStr);

    if (isNaN(numSets) || isNaN(numReps) || numSets <= 0 || numReps <= 0) {
      console.warn(`[WorkoutSession] Invalid volume format: "${volume}"`);
      return null;
    }
    return { numSets, numReps };
  }

  return null;
}

/**
 * Parse rest string (e.g., "90s", "2 min") into seconds
 * Returns null if the rest cannot be parsed
 * @param {string} rest
 * @returns {number | null}
 */
function parseRest(rest) {
  if (!rest || typeof rest !== 'string') return null;

  const restMatch = rest.match(/\d+/);
  if (!restMatch) return null;

  const value = parseInt(restMatch[0]);
  if (isNaN(value) || value <= 0) return null;

  return value;
}

/**
 * Parse workout blocks into exercise format for LiveWorkout
 * @param {Object} workout - workout with blocks
 * @returns {WorkoutData}
 * @throws {Error} if workout data is invalid
 */
export function parseWorkoutToSessionData(workout) {
  if (!workout) {
    throw new Error('Workout data is required');
  }

  if (!workout.name && !workout.title) {
    throw new Error('Workout must have a name or title');
  }

  const sessionData = {
    title: workout.name || workout.title,
    type: workout.primary_disciplines?.[0] || workout.type || null,
    duration_minutes: workout.estimated_duration || workout.duration_minutes || null,
    exercises: []
  };

  // Handle both blocks format and flat exercises array
  const exerciseList = [];

  if (workout.blocks && Array.isArray(workout.blocks)) {
    workout.blocks.forEach(block => {
      if (block.exercises && Array.isArray(block.exercises)) {
        block.exercises.forEach(ex => exerciseList.push(ex));
      }
    });
  }

  if (workout.exercises && Array.isArray(workout.exercises)) {
    workout.exercises.forEach(ex => exerciseList.push(ex));
  }

  exerciseList.forEach((ex, index) => {
    if (!ex.exercise_name && !ex.exerciseName && !ex.name) {
      console.warn(`[WorkoutSession] Skipping exercise at index ${index}: missing name`);
      return;
    }

    const rawExerciseId = ex.exercise_id || ex.exerciseId;
    const newExercise = {
      exercise_id: isValidObjectId(rawExerciseId) ? rawExerciseId : null,
      exercise_name: ex.exercise_name || ex.exerciseName || ex.name,
      notes: ex.notes || '',
      order: index,
      sets: []
    };

    // If exercise already has a sets array, use it
    if (ex.sets && Array.isArray(ex.sets) && ex.sets.length > 0) {
      newExercise.sets = ex.sets.map(set => ({
        target_reps: set.target_reps || set.targetReps || set.reps || null,
        reps: 0,
        weight: set.weight || 0,
        rest_seconds: set.rest_seconds || set.restSeconds || null,
        is_completed: false
      }));
    } else {
      // Parse from volume string or numeric fields
      const volume = ex.volume || ex.sets_reps;
      const parsedVolume = parseVolume(volume);

      // Check for numeric sets/reps fields (from calendar format)
      const numericSets = typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : null;
      const numericReps = typeof ex.reps === 'number' && ex.reps > 0 ? ex.reps : null;

      // Priority: parsedVolume -> numeric fields -> defaults
      const numSets = parsedVolume?.numSets || numericSets || 3;
      const numReps = parsedVolume?.numReps || numericReps || 10;
      const restSeconds = parseRest(ex.rest) || 90;

      if (!parsedVolume && !numericSets && !numericReps) {
        console.warn(`[WorkoutSession] Exercise "${newExercise.exercise_name}" has no valid volume data (got: "${volume}"). Using defaults: ${numSets}x${numReps}`);
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
    }

    if (newExercise.sets.length > 0) {
      sessionData.exercises.push(newExercise);
    }
  });

  if (sessionData.exercises.length === 0) {
    throw new Error('Workout has no valid exercises');
  }

  return sessionData;
}

export { ACTIVE_WORKOUT_KEY, ACTIVE_WORKOUT_TTL };
