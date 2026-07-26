/**
 * Hidden-context message markers for the coach chat.
 *
 * Some chat messages carry machine context the model needs but the user never
 * typed ([EXERCISE SWAP ...], [WORKOUT REQUEST ...], [TRAIN NOW]). These
 * helpers reduce a stored wire message back to display text.
 */

export function stripContextMarkers(content) {
  if (!content) return content;
  if (content.startsWith('[EXERCISE SWAP')) {
    const said = content.match(/User says:\s*([\s\S]*)$/);
    return said ? said[1].trim() : 'Help me swap an exercise';
  }
  if (content.startsWith('[WORKOUT REQUEST')) {
    const looking = content.match(/Here's what I'm looking for:\s*(.+?)(?:\n|Please|$)/s);
    return looking ? looking[1].trim() : 'Help me plan a workout for today';
  }
  if (content.startsWith('[TRAIN NOW')) {
    return 'I want to train now - help me decide what to do';
  }
  return content;
}

/**
 * Compose the [EXERCISE SWAP] wire message: marker + live-session context +
 * the user's typed text. The display layer shows only the typed text.
 */
export function buildExerciseSwapMessage({ exercise, workoutTitle, sourceWorkoutId, exercises, elapsedMinutes, text }) {
  const lines = (exercises || []).map((ex, i) => {
    const sets = ex.sets || [];
    const done = sets.filter((s) => s.is_completed).length;
    const status = done === sets.length && sets.length > 0
      ? `done (${done}/${sets.length} sets)`
      : done > 0
        ? `in progress (${done}/${sets.length} sets)`
        : 'not started';
    return `${i + 1}. ${ex.exercise_name} — ${status}`;
  });
  const marker =
    `[EXERCISE SWAP exercise_id="${exercise?.exercise_id || 'none'}" ` +
    `exercise="${exercise?.exercise_name || ''}" ` +
    `workout="${workoutTitle || ''}" ` +
    `source_workout_id="${sourceWorkoutId || 'none'}" ` +
    `elapsed_minutes="${elapsedMinutes ?? 0}"]`;
  return `${marker}\nLive session in progress (${elapsedMinutes ?? 0} min elapsed). Exercises:\n${lines.join('\n')}\nUser says: ${text}`;
}
