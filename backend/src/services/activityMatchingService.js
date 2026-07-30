const CalendarEvent = require('../models/CalendarEvent');
const ExternalActivity = require('../models/ExternalActivity');
const ActivityMatchAudit = require('../models/ActivityMatchAudit');
const { normalizeDisciplines } = require('../config/disciplines');

/**
 * Matching between synced external activities (Strava) and planned calendar
 * events, plus the single home for merge/un-merge semantics — the sync path,
 * the user-facing routes, and the coach internal API must all go through
 * these helpers so the rules stay in one place.
 *
 * Event linkage vocabulary:
 *  - mirror event: created BY the sync for an activity that matched nothing
 *    (sessionDetails.source === 'strava'). Legacy linked events predating the
 *    matcher are all mirrors — merging didn't exist yet.
 *  - merged event: a pre-existing planned event an activity was merged into
 *    (sessionDetails.source === 'strava-matched').
 *
 * Rules that are deliberate (do not "fix"):
 *  - Activities with matchStatus 'separate', 'confirmed' or 'pending' are
 *    never re-classified — sync and the consistency job only maintain their
 *    mirror/linked event. A webhook update that corrects the sportType of a
 *    pending activity therefore never re-classifies it; only the user or the
 *    coach resolves it.
 *  - Two same-day activities against one planned event: first processed wins
 *    the merge (Strava page order), the second becomes a mirror.
 *  - The cardio family excludes 'hiit' and 'hybrid': a planned hybrid session
 *    only ever exact-matches, so it lands in pending by design.
 */

// 'cardio' is the generic endurance bucket: a planned cardio/endurance
// session accepts any of these activity disciplines and vice versa. Specific
// modalities never match each other (a planned run is not a Strava ride).
const CARDIO_FAMILY = new Set(['running', 'cycling', 'swimming', 'walking', 'cardio']);

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_TTL_MS = 180 * DAY_MS;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without a DB)
// ---------------------------------------------------------------------------

function normalizeDiscipline(value) {
  return normalizeDisciplines([value])[0] || null;
}

/**
 * The activity's local calendar day as 'YYYY-MM-DD'. Strava's
 * start_date_local is wall time serialized with a fake Z suffix, so its date
 * part IS the local day.
 */
function activityLocalDay(activity) {
  const local = activity.rawData?.start_date_local;
  if (typeof local === 'string' && local.length >= 10) return local.slice(0, 10);
  return new Date(activity.startDate).toISOString().slice(0, 10);
}

/** UTC offset of the activity's timezone in ms (0 when underivable). */
function activityUtcOffsetMs(activity) {
  const raw = activity.rawData || {};
  if (typeof raw.utc_offset === 'number' && Number.isFinite(raw.utc_offset)) {
    return raw.utc_offset * 1000;
  }
  if (typeof raw.start_date_local === 'string' && typeof raw.start_date === 'string') {
    const diff = new Date(raw.start_date_local).getTime() - new Date(raw.start_date).getTime();
    return Number.isFinite(diff) ? diff : 0;
  }
  return 0;
}

/**
 * The local day a candidate event belongs to. Planned events are stored at
 * midnight UTC of the intended local day, so their UTC day-string is the day
 * label. Timestamped dates (sessionLog-derived events) are real instants and
 * get shifted by the activity's UTC offset first, so a 00:30-local app-logged
 * session doesn't fall on the previous UTC day.
 */
function eventLocalDay(event, offsetMs) {
  const date = new Date(event.date);
  const isMidnightUtc = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  const effective = isMidnightUtc ? date : new Date(date.getTime() + offsetMs);
  return effective.toISOString().slice(0, 10);
}

/** Discipline of a planned event, normalized; template's first primary discipline as fallback. */
function eventDiscipline(event) {
  return normalizeDiscipline(event.sessionDetails?.discipline)
    || normalizeDiscipline(event.sessionTemplateId?.primary_disciplines?.[0]);
}

/** @returns {{match: boolean, exact: boolean}} */
function disciplinesCompatible(activityDiscipline, plannedDiscipline) {
  const a = normalizeDiscipline(activityDiscipline);
  const p = normalizeDiscipline(plannedDiscipline);
  if (!a || !p || a === 'other' || p === 'other') return { match: false, exact: false };
  if (a === p) return { match: true, exact: true };
  const family = (a === 'cardio' && CARDIO_FAMILY.has(p)) || (p === 'cardio' && CARDIO_FAMILY.has(a));
  return { match: family, exact: false };
}

function activityDurationMinutes(activity) {
  return Math.round((activity.movingTime || activity.elapsedTime || 0) / 60);
}

function durationInTolerance(activity, event) {
  const planned = event.sessionDetails?.estimatedDuration;
  if (!planned || !Number.isFinite(planned)) return false;
  const actual = activityDurationMinutes(activity);
  return Math.abs(actual - planned) <= Math.max(15, 0.25 * planned);
}

/**
 * Decide what to do with a not-yet-linked activity given candidate events
 * (pre-fetched, unlinked, status scheduled/in_progress/completed).
 *
 * @returns {{decision: 'merge'|'pending'|'none', target?: object, candidateIds: Array}}
 */
function classifyCandidates(activity, discipline, events) {
  const normalized = normalizeDiscipline(discipline);
  // Unmapped sport types never merge and never nag: straight to mirror.
  if (!normalized || normalized === 'other') return { decision: 'none', candidateIds: [] };

  const localDay = activityLocalDay(activity);
  const offsetMs = activityUtcOffsetMs(activity);
  const sameDay = (events || []).filter((e) => !e.externalActivityId && eventLocalDay(e, offsetMs) === localDay);

  // Auto-merge pool: still fully open. Events completed in-app (or carrying a
  // sessionLog — in_progress always does) are the double-record case: they
  // can trigger a pending question but are never auto-merged.
  const pool = sameDay.filter((e) => e.status === 'scheduled' && !e.sessionLogId);
  const closedMatches = sameDay
    .filter((e) => e.status !== 'scheduled' || e.sessionLogId)
    .filter((e) => disciplinesCompatible(normalized, eventDiscipline(e)).match);

  const exact = [];
  const family = [];
  for (const e of pool) {
    const compat = disciplinesCompatible(normalized, eventDiscipline(e));
    if (compat.exact) exact.push(e);
    else if (compat.match) family.push(e);
  }
  const matching = exact.length > 0 ? exact : family;

  if (matching.length === 1) {
    return { decision: 'merge', target: matching[0], candidateIds: matching.map((e) => e._id) };
  }
  if (matching.length > 1) {
    const inTolerance = matching.filter((e) => durationInTolerance(activity, e));
    if (inTolerance.length === 1) {
      return { decision: 'merge', target: inTolerance[0], candidateIds: matching.map((e) => e._id) };
    }
    return { decision: 'pending', candidateIds: matching.map((e) => e._id) };
  }
  if (closedMatches.length > 0) {
    return { decision: 'pending', candidateIds: closedMatches.map((e) => e._id) };
  }
  if (pool.length > 0) {
    // Open plans exist but none matches the discipline — the "Endurance
    // planned, strength done" case the coach should ask about.
    return { decision: 'pending', candidateIds: pool.map((e) => e._id) };
  }
  return { decision: 'none', candidateIds: [] };
}

/** Unlink vs delete for an event whose activity link must be severed. */
function shouldUnlinkNotDelete(event) {
  return event.sessionDetails?.source === 'strava-matched'
    || Boolean(event.sessionTemplateId)
    || Boolean(event.planId)
    || Boolean(event.sessionLogId);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function stravaDataFor(activity) {
  return {
    sportType: activity.sportType,
    distance: activity.distance,
    elevationGain: activity.elevationGain,
    avgHeartRate: activity.avgHeartRate,
    calories: activity.calories,
    stravaUrl: activity.stravaUrl
  };
}

async function writeAudit({ userId, activityId, eventId, action, actor, previous, context }) {
  try {
    await ActivityMatchAudit.create({
      userId,
      activityId,
      eventId,
      action,
      actor,
      previous,
      context,
      expiresAt: new Date(Date.now() + AUDIT_TTL_MS)
    });
  } catch (error) {
    console.error('Failed to write activity match audit:', error.message);
  }
}

async function findCandidateEvents(userId, activity) {
  const dayStart = new Date(`${activityLocalDay(activity)}T00:00:00Z`);
  return CalendarEvent.find({
    userId,
    type: 'session',
    status: { $in: ['scheduled', 'in_progress', 'completed'] },
    externalActivityId: null,
    date: {
      $gte: new Date(dayStart.getTime() - DAY_MS),
      $lt: new Date(dayStart.getTime() + 2 * DAY_MS)
    }
  })
    .populate('sessionTemplateId', 'primary_disciplines')
    .lean();
}

/**
 * Create/refresh the standalone mirror event for an activity.
 * (The pre-matcher behavior, kept for unmatched/pending/separate activities.)
 */
async function upsertMirrorEvent(activity, userId, discipline) {
  await CalendarEvent.findOneAndUpdate(
    { userId, externalActivityId: activity._id },
    {
      userId,
      date: activity.startDate,
      title: activity.name,
      type: 'session',
      status: 'completed',
      externalActivityId: activity._id,
      sessionDetails: {
        discipline,
        durationMinutes: activityDurationMinutes(activity),
        source: 'strava',
        stravaData: stravaDataFor(activity)
      },
      completedAt: activity.startDate
    },
    { upsert: true, new: true }
  );
}

/**
 * Merge an activity into a planned event. Targeted dot-path $set only — a
 * whole-sessionDetails replace would wipe the planned exercises/estimate.
 * App-native completion data always wins: an already-completed event keeps
 * its status/completedAt/durationMinutes and only gains the Strava link.
 */
async function mergeActivityIntoEvent(activity, event, { actor = 'system', matchStatus = 'auto', action = 'auto_merge', context } = {}) {
  const set = {
    externalActivityId: activity._id,
    'sessionDetails.source': 'strava-matched',
    'sessionDetails.stravaData': stravaDataFor(activity)
  };
  if (event.status !== 'completed') {
    set.status = 'completed';
    set.completedAt = activity.startDate;
  }
  if (event.sessionDetails?.durationMinutes == null) {
    set['sessionDetails.durationMinutes'] = activityDurationMinutes(activity);
  }
  await CalendarEvent.updateOne({ _id: event._id, userId: activity.userId }, { $set: set });

  // Merging supersedes any mirror this activity may have (user-initiated
  // merges start from a mirror on the calendar).
  await CalendarEvent.deleteOne({
    userId: activity.userId,
    externalActivityId: activity._id,
    _id: { $ne: event._id }
  });

  const previous = { matchStatus: activity.matchStatus, matchedEventId: activity.matchedEventId };
  await ExternalActivity.updateOne(
    { _id: activity._id },
    { $set: { matchStatus, matchedEventId: event._id, matchCandidateIds: [] } }
  );
  await writeAudit({
    userId: activity.userId,
    activityId: activity._id,
    eventId: event._id,
    action,
    actor,
    previous,
    context
  });
}

/** Sever a merged event's Strava link, reverting app-untouched events to scheduled. */
async function unlinkEvent(event) {
  const unset = {
    externalActivityId: 1,
    'sessionDetails.source': 1,
    'sessionDetails.stravaData': 1
  };
  const update = { $unset: unset };
  if (!event.sessionLogId) {
    unset.completedAt = 1;
    unset['sessionDetails.durationMinutes'] = 1;
    update.$set = { status: 'scheduled' };
  }
  await CalendarEvent.updateOne({ _id: event._id }, update);
}

/**
 * Undo a merge: restore the planned event, bring the activity back onto the
 * calendar as a mirror, and pin it 'separate' so it is never re-matched.
 */
async function unmergeActivity(activity, discipline, { actor = 'user', action = 'user_unmerge' } = {}) {
  const event = await CalendarEvent.findOne({
    userId: activity.userId,
    externalActivityId: activity._id
  }).lean();
  if (event) await unlinkEvent(event);

  const previous = { matchStatus: activity.matchStatus, matchedEventId: activity.matchedEventId };
  await ExternalActivity.updateOne(
    { _id: activity._id },
    { $set: { matchStatus: 'separate' }, $unset: { matchedEventId: 1 } }
  );
  await upsertMirrorEvent({ ...activity, matchStatus: 'separate' }, activity.userId, discipline);
  await writeAudit({
    userId: activity.userId,
    activityId: activity._id,
    eventId: event?._id,
    action,
    actor,
    previous
  });
}

/**
 * The activity behind this event is gone (deleted on Strava, or via the
 * external-activities DELETE): merged/planned events survive with the link
 * severed; pure mirrors are deleted.
 */
async function unlinkOrDeleteStravaEvent(event, userId) {
  if (shouldUnlinkNotDelete(event)) {
    await unlinkEvent(event);
  } else {
    await CalendarEvent.deleteOne({ _id: event._id, userId });
  }
}

/**
 * The user deleted a Strava-linked calendar event directly. That is a match
 * correction: pin the activity 'separate' (never re-merged, mirror not
 * auto-resurrected as a merge) and audit it.
 */
async function handleLinkedEventDeletion(event, userId) {
  const activity = await ExternalActivity.findOne({ _id: event.externalActivityId, userId }).lean();
  if (!activity) return;
  const previous = { matchStatus: activity.matchStatus, matchedEventId: activity.matchedEventId };
  await ExternalActivity.updateOne(
    { _id: activity._id },
    { $set: { matchStatus: 'separate' }, $unset: { matchedEventId: 1 } }
  );
  await writeAudit({
    userId,
    activityId: activity._id,
    eventId: event._id,
    action: 'user_event_delete',
    actor: 'user',
    previous
  });
}

/**
 * Classify a not-yet-linked activity and apply the outcome (merge, or mirror
 * with pending/unmatched bookkeeping). Called from syncCalendarEvent only.
 */
async function classifyAndApply(activity, userId, discipline) {
  const events = await findCandidateEvents(userId, activity);
  const { decision, target, candidateIds } = classifyCandidates(activity, discipline, events);
  const context = {
    candidateIds,
    discipline,
    localDay: activityLocalDay(activity),
    decision
  };

  if (decision === 'merge') {
    await mergeActivityIntoEvent(activity, target, { actor: 'system', matchStatus: 'auto', action: 'auto_merge', context });
    return;
  }

  await upsertMirrorEvent(activity, userId, discipline);
  const matchStatus = decision === 'pending' ? 'pending' : 'unmatched';
  await ExternalActivity.updateOne(
    { _id: activity._id },
    { $set: { matchStatus, matchCandidateIds: decision === 'pending' ? candidateIds : [] } }
  );
  await writeAudit({
    userId,
    activityId: activity._id,
    action: decision === 'pending' ? 'auto_pending' : 'auto_unmatched',
    actor: 'system',
    previous: { matchStatus: activity.matchStatus, matchedEventId: activity.matchedEventId },
    context
  });
}

/** Refresh Strava-derived details on a merged event after an activity update. */
async function refreshMergedEvent(activity, event) {
  const set = { 'sessionDetails.stravaData': stravaDataFor(activity) };
  if (!event.sessionLogId) set.completedAt = activity.startDate;
  await CalendarEvent.updateOne({ _id: event._id }, { $set: set });
}

module.exports = {
  CARDIO_FAMILY,
  normalizeDiscipline,
  activityLocalDay,
  activityUtcOffsetMs,
  eventLocalDay,
  eventDiscipline,
  disciplinesCompatible,
  durationInTolerance,
  classifyCandidates,
  shouldUnlinkNotDelete,
  findCandidateEvents,
  upsertMirrorEvent,
  mergeActivityIntoEvent,
  unlinkEvent,
  unmergeActivity,
  unlinkOrDeleteStravaEvent,
  handleLinkedEventDeletion,
  classifyAndApply,
  refreshMergedEvent,
  writeAudit
};
