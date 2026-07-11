/**
 * Single source of truth for picking "today's session" from calendar events.
 * Shared by the Dashboard hero (TodayView) and the TrainNow page so both
 * surfaces always agree on what today looks like.
 */

const DONE_STATUSES = ["completed", "cancelled", "skipped"];

/**
 * @param {Array} events - today's calendar events
 * @returns {{ scheduledEvent: Object|null, completedToday: boolean }}
 *   scheduledEvent — the pending event to surface: prefers a workout, but
 *   falls back to any other pending event (e.g. a race/competition day) so
 *   it isn't hidden behind an AI suggestion.
 *   completedToday — whether a workout was already completed today.
 */
export function pickTodaySession(events) {
  const list = Array.isArray(events) ? events : [];

  const pending = list.filter(
    (e) => !DONE_STATUSES.includes(e.status || "scheduled")
  );

  const scheduledEvent =
    pending.find((e) => e.type === "workout") || pending[0] || null;

  const completedToday = list.some(
    (e) => e.type === "workout" && e.status === "completed"
  );

  return { scheduledEvent, completedToday };
}
