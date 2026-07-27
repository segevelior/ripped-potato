/**
 * Hidden-context message markers for the coach chat.
 *
 * Some chat messages carry machine context the model needs but the user never
 * typed ([EXERCISE SWAP ...], [SESSION REQUEST ...], [TRAIN NOW]). These
 * helpers reduce a stored wire message back to display text.
 */

// Marker prefixes accepted on the DISPLAY/STRIP side. New messages are always
// emitted with '[SESSION REQUEST'; the '[WORKOUT REQUEST' spelling stays here
// FOREVER because conversations persisted before the workout→session rename
// still carry it, and dropping it would render raw marker text to users.
export const SESSION_REQUEST_PREFIXES = ['[SESSION REQUEST', '[WORKOUT REQUEST'];

function startsWithAny(content, prefixes) {
  return prefixes.some((prefix) => content.startsWith(prefix));
}

/**
 * True when the message is a session-planning request marker, in either the
 * current or the pre-rename spelling. Parse side only — never emit the old one.
 */
export function isSessionRequestMarker(content) {
  return Boolean(content) && startsWithAny(content, SESSION_REQUEST_PREFIXES);
}

export function stripContextMarkers(content) {
  if (!content) return content;
  if (content.startsWith('[EXERCISE SWAP')) {
    const said = content.match(/User says:\s*([\s\S]*)$/);
    return said ? said[1].trim() : 'Help me swap an exercise';
  }
  if (isSessionRequestMarker(content)) {
    const looking = content.match(/Here's what I'm looking for:\s*(.+?)(?:\n|Please|$)/s);
    return looking ? looking[1].trim() : 'Help me plan a session for today';
  }
  if (content.startsWith('[TRAIN NOW')) {
    return 'I want to train now - help me decide what to do';
  }
  return content;
}

/**
 * Compose the [EXERCISE SWAP] wire message: marker + live-session context +
 * the user's typed text. The display layer shows only the typed text.
 *
 * Emission uses the new attribute spellings (session=, source_session_id=) —
 * the coach prompt reads these. Old persisted messages keep the workout=
 * spelling; nothing on this side parses them back.
 */
export function buildExerciseSwapMessage({ exercise, sessionTitle, sourceTemplateId, exercises, elapsedMinutes, text }) {
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
    `session="${sessionTitle || ''}" ` +
    `source_session_id="${sourceTemplateId || 'none'}" ` +
    `elapsed_minutes="${elapsedMinutes ?? 0}"]`;
  return `${marker}\nLive session in progress (${elapsedMinutes ?? 0} min elapsed). Exercises:\n${lines.join('\n')}\nUser says: ${text}`;
}
