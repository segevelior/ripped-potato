/**
 * Live Session Management Utility
 *
 * Manages active session state in localStorage for persistence across
 * navigation, tab switches, and browser restarts.
 */

const ACTIVE_SESSION_KEY = 'activeSession';
// Pre-rename key (workout → session). Read-and-migrate only: never written.
const LEGACY_ACTIVE_SESSION_KEY = 'activeWorkout';
const ACTIVE_SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @typedef {Object} SessionSet
 * @property {number} target_reps
 * @property {number} reps
 * @property {number} weight
 * @property {number} rest_seconds
 * @property {boolean} is_completed
 */

/**
 * @typedef {Object} SessionExercise
 * @property {string} exercise_id
 * @property {string} exercise_name
 * @property {string} notes
 * @property {SessionSet[]} sets
 */

/**
 * @typedef {Object} SessionData
 * @property {string} title
 * @property {string} type - discipline of the session (sent to the server as `discipline`)
 * @property {number} duration_minutes
 * @property {string|null} sourceTemplateId - SessionTemplate this session started from (null for ad-hoc sessions)
 * @property {boolean} sourceTemplateIsCommon - whether that template is shared/common (permanent edits clone it)
 * @property {SessionExercise[]} exercises
 */

/**
 * @typedef {Object} ActiveSession
 * @property {SessionData} data
 * @property {number} totalSessionTime - seconds elapsed
 * @property {number} startedAt - timestamp
 * @property {number} lastSavedAt - timestamp
 */

/**
 * Migrate a pre-rename `activeWorkout` blob to `activeSession`.
 *
 * A key-only shim is not enough: the stored blob embeds `totalWorkoutTime`,
 * `sourceWorkoutId` and `sourceWorkoutIsCommon`, so a rename of the key alone
 * would pass TTL validation and then silently degrade (timer resets to 0, the
 * logged duration is wrong, "make permanent" is disabled). Everything else on
 * the blob — including `startedAt`, which the TTL check reads — is carried over
 * verbatim so a migrated session stays valid.
 *
 * Runs at most once: the legacy key is removed after a successful write.
 * @returns {void}
 */
function migrateLegacyActiveSession() {
  try {
    if (localStorage.getItem(ACTIVE_SESSION_KEY) !== null) return;

    const legacyJson = localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY);
    if (!legacyJson) return;

    const legacy = JSON.parse(legacyJson);
    const { totalWorkoutTime, data: legacyData, ...rest } = legacy || {};
    const { sourceWorkoutId, sourceWorkoutIsCommon, ...restData } = legacyData || {};

    const migrated = {
      ...rest,
      ...(legacyData
        ? {
            data: {
              ...restData,
              sourceTemplateId: sourceWorkoutId ?? null,
              sourceTemplateIsCommon: sourceWorkoutIsCommon === true
            }
          }
        : {}),
      totalSessionTime: totalWorkoutTime ?? 0
    };

    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
    console.log('[LiveSession] Migrated legacy active workout to activeSession');
  } catch (error) {
    console.error('[LiveSession] Failed to migrate legacy active workout:', error);
    // A corrupt legacy blob must not wedge the app forever.
    try {
      localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
}

/**
 * Get the active session from localStorage
 * @returns {ActiveSession|null}
 */
export function getActiveSession() {
  try {
    migrateLegacyActiveSession();

    const json = localStorage.getItem(ACTIVE_SESSION_KEY);
    console.log('[LiveSession] getActiveSession - raw value exists:', !!json);
    if (!json) return null;

    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed.data || !parsed.startedAt) {
      console.warn('[LiveSession] Invalid active session data, clearing');
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }

    // Check TTL
    const age = Date.now() - parsed.startedAt;
    if (age >= ACTIVE_SESSION_TTL) {
      console.log('[LiveSession] Active session expired, clearing');
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }

    console.log('[LiveSession] getActiveSession - returning:', parsed.data?.title);
    return parsed;
  } catch (error) {
    console.error('[LiveSession] Failed to parse active session:', error);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return null;
  }
}

/**
 * Check if there's a valid active session
 * @returns {boolean}
 */
export function hasActiveSession() {
  return getActiveSession() !== null;
}

/**
 * Start a new live session
 * @param {SessionData} sessionData
 */
export function startLiveSession(sessionData) {
  const activeSession = {
    data: sessionData,
    totalSessionTime: 0,
    startedAt: Date.now(),
    lastSavedAt: Date.now()
  };
  console.log('[LiveSession] Starting new live session:', activeSession.data?.title);
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
  // The legacy blob would otherwise be resurrected by the migration shim the
  // next time this session is cleared.
  localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
  console.log('[LiveSession] Session saved to localStorage');
}

/**
 * Save progress of the active session
 * @param {SessionData} sessionData - current session state
 * @param {number} totalSessionTime - elapsed seconds
 */
export function saveSessionProgress(sessionData, totalSessionTime) {
  const existing = getActiveSession();
  if (!existing) {
    console.warn('[LiveSession] No active session to save progress to');
    return;
  }

  const updated = {
    ...existing,
    data: sessionData,
    totalSessionTime,
    lastSavedAt: Date.now()
  };
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(updated));
}

/**
 * Clear the active session (on complete or discard)
 */
export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  // Clear the pre-rename key too, otherwise the migration shim would restore
  // the session we were just asked to discard.
  localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
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
      console.warn(`[LiveSession] Invalid volume format: "${volume}"`);
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
 * Parse session-template blocks into exercise format for LiveSession
 *
 * sourceTemplateId must be passed explicitly — never derived from template._id,
 * because callers hand in shapes where the id is something else entirely
 * (e.g. TrainNow's calendar path, where .id is the calendar event id).
 *
 * @param {Object} workout - session template with blocks
 * @param {Object} [options]
 * @param {string} [options.sourceTemplateId] - SessionTemplate id this session was started from
 * @param {boolean} [options.sourceTemplateIsCommon] - whether that template is a shared/common one
 * @returns {SessionData}
 * @throws {Error} if the session data is invalid
 */
export function parseTemplateToSessionData(workout, { sourceTemplateId, sourceTemplateIsCommon } = {}) {
  if (!workout) {
    throw new Error('Session data is required');
  }

  if (!workout.name && !workout.title) {
    throw new Error('Session must have a name or title');
  }

  const sessionData = {
    title: workout.name || workout.title,
    // Client-side blob field; mapped to the server's `discipline` at log time.
    type: workout.primary_disciplines?.[0] || workout.type || null,
    duration_minutes: workout.estimated_duration || workout.duration_minutes || null,
    sourceTemplateId: isValidObjectId(String(sourceTemplateId || '')) ? String(sourceTemplateId) : null,
    sourceTemplateIsCommon: sourceTemplateIsCommon === true,
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
      console.warn(`[LiveSession] Skipping exercise at index ${index}: missing name`);
      return;
    }

    // exercise_id may arrive populated as an object ({_id, name, ...}) — the
    // Sessions-page list populates it — or as a plain id string.
    const rawIdSource = ex.exercise_id ?? ex.exerciseId;
    const rawExerciseId = rawIdSource && typeof rawIdSource === 'object'
      ? String(rawIdSource._id || rawIdSource.id || '')
      : rawIdSource;
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
        console.warn(`[LiveSession] Exercise "${newExercise.exercise_name}" has no valid volume data (got: "${volume}"). Using defaults: ${numSets}x${numReps}`);
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
    throw new Error('Session has no valid exercises');
  }

  return sessionData;
}

/**
 * Build a single live-session exercise from a catalog/generated exercise object.
 * Used when replacing or inserting an exercise mid-workout.
 *
 * Guarantees the same set shape as parseTemplateToSessionData so logging/stats stay
 * consistent. exercise_id is a real 24-hex ObjectId or null (never a fabricated
 * string) — a null id logs to SessionLog without breaking, matching the existing gate.
 *
 * Default sets come from the catalog's strain.typicalVolume (camelCase — note the
 * backend field is typicalVolume, NOT typical_volume); falls back to 3x10 / 90s rest.
 *
 * @param {Object} exercise - a catalog exercise ({ id|_id, name, strain })
 * @param {number} [order=0]
 * @returns {SessionExercise}
 */
export function buildSessionExercise(exercise, order = 0) {
  const rawId = exercise?.id || exercise?._id;
  const typicalVolume = exercise?.strain?.typicalVolume;
  const parsedVolume = parseVolume(typicalVolume);

  const numSets = parsedVolume?.numSets || 3;
  const numReps = parsedVolume?.numReps || 10;

  const sets = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({
      target_reps: numReps,
      reps: 0,
      weight: 0,
      rest_seconds: 90,
      is_completed: false
    });
  }

  return {
    exercise_id: isValidObjectId(rawId) ? rawId : null,
    exercise_name: exercise?.name || exercise?.exercise_name || 'Exercise',
    notes: '',
    order,
    sets
  };
}

export { ACTIVE_SESSION_KEY, LEGACY_ACTIVE_SESSION_KEY, ACTIVE_SESSION_TTL, isValidObjectId };
