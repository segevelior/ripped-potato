/**
 * Decision-matrix tests for the Strava↔planned-event matcher. Pure-function
 * tests on plain objects — no DB. See activityMatchingService header for the
 * rules under test.
 */
const mongoose = require('mongoose');
const {
  activityLocalDay,
  activityUtcOffsetMs,
  eventLocalDay,
  disciplinesCompatible,
  classifyCandidates,
  shouldUnlinkNotDelete,
  mergeSetCompletion
} = require('../activityMatchingService');
const CalendarEvent = require('../../models/CalendarEvent');
const ExternalActivity = require('../../models/ExternalActivity');

const oid = () => new mongoose.Types.ObjectId();

// Evening run in Israel (UTC+3): 21:30 local on Jul 29 = 18:30 UTC.
const makeActivity = (overrides = {}) => ({
  _id: oid(),
  userId: oid(),
  sportType: 'Run',
  startDate: new Date('2026-07-29T18:30:00Z'),
  movingTime: 45 * 60,
  rawData: {
    start_date: '2026-07-29T18:30:00Z',
    start_date_local: '2026-07-29T21:30:00Z',
    utc_offset: 10800
  },
  ...overrides
});

const makeEvent = (overrides = {}) => ({
  _id: oid(),
  type: 'session',
  status: 'scheduled',
  date: new Date('2026-07-29T00:00:00Z'),
  sessionDetails: { discipline: 'running', estimatedDuration: 45 },
  ...overrides
});

describe('activityLocalDay / activityUtcOffsetMs', () => {
  test('prefers start_date_local wall time', () => {
    // 23:30 local Jul 29 = 20:30 UTC — UTC day is still Jul 29, but at
    // 01:30 local (22:30 UTC prev day) the local day differs from UTC day.
    const lateNight = makeActivity({
      startDate: new Date('2026-07-29T22:30:00Z'),
      rawData: { start_date: '2026-07-29T22:30:00Z', start_date_local: '2026-07-30T01:30:00Z', utc_offset: 10800 }
    });
    expect(activityLocalDay(lateNight)).toBe('2026-07-30');
  });

  test('falls back to startDate UTC day without rawData', () => {
    expect(activityLocalDay({ startDate: new Date('2026-07-29T18:30:00Z') })).toBe('2026-07-29');
  });

  test('offset from utc_offset, then from local-minus-utc, else 0', () => {
    expect(activityUtcOffsetMs(makeActivity())).toBe(10800 * 1000);
    const noOffset = makeActivity();
    delete noOffset.rawData.utc_offset;
    expect(activityUtcOffsetMs(noOffset)).toBe(3 * 60 * 60 * 1000);
    expect(activityUtcOffsetMs({ rawData: {} })).toBe(0);
  });
});

describe('eventLocalDay', () => {
  test('midnight-UTC planned dates are day labels — never shifted', () => {
    expect(eventLocalDay({ date: new Date('2026-07-29T00:00:00Z') }, 10800 * 1000)).toBe('2026-07-29');
  });

  test('timestamped dates shift by the activity offset across the UTC day boundary', () => {
    // App-logged at 00:30 local Jul 30 = 21:30 UTC Jul 29
    expect(eventLocalDay({ date: new Date('2026-07-29T21:30:00Z') }, 10800 * 1000)).toBe('2026-07-30');
  });
});

describe('disciplinesCompatible', () => {
  test('exact match', () => {
    expect(disciplinesCompatible('running', 'running')).toEqual({ match: true, exact: true });
  });

  test('legacy synonyms normalize (endurance → cardio)', () => {
    expect(disciplinesCompatible('cardio', 'endurance')).toEqual({ match: true, exact: true });
  });

  test('cardio family is bidirectional', () => {
    expect(disciplinesCompatible('cycling', 'cardio').match).toBe(true);
    expect(disciplinesCompatible('cardio', 'running').match).toBe(true);
    expect(disciplinesCompatible('cycling', 'endurance').match).toBe(true);
  });

  test('specific modalities never match each other', () => {
    expect(disciplinesCompatible('running', 'cycling').match).toBe(false);
  });

  test('hiit/hybrid are outside the cardio family', () => {
    expect(disciplinesCompatible('cardio', 'hiit').match).toBe(false);
    expect(disciplinesCompatible('cardio', 'hybrid').match).toBe(false);
  });

  test('other and empty never match', () => {
    expect(disciplinesCompatible('other', 'other').match).toBe(false);
    expect(disciplinesCompatible('running', null).match).toBe(false);
  });

  test('case-insensitive', () => {
    expect(disciplinesCompatible('Running', 'RUNNING')).toEqual({ match: true, exact: true });
  });
});

describe('classifyCandidates decision matrix', () => {
  const activity = makeActivity();

  test('single scheduled exact match → merge', () => {
    const event = makeEvent();
    const result = classifyCandidates(activity, 'running', [event]);
    expect(result.decision).toBe('merge');
    expect(result.target).toBe(event);
  });

  test('family match merges: planned endurance session + Strava Ride', () => {
    const ride = makeActivity({ sportType: 'Ride' });
    const event = makeEvent({ sessionDetails: { discipline: 'endurance', estimatedDuration: 60 } });
    const result = classifyCandidates(ride, 'cycling', [event]);
    expect(result.decision).toBe('merge');
  });

  test('exact match outranks family match', () => {
    const exact = makeEvent({ sessionDetails: { discipline: 'running' } });
    const family = makeEvent({ sessionDetails: { discipline: 'cardio' } });
    const result = classifyCandidates(activity, 'running', [family, exact]);
    expect(result.decision).toBe('merge');
    expect(result.target).toBe(exact);
  });

  test('multiple matches + decisive duration tiebreak → merge', () => {
    const close = makeEvent({ sessionDetails: { discipline: 'running', estimatedDuration: 45 } });
    const far = makeEvent({ sessionDetails: { discipline: 'running', estimatedDuration: 120 } });
    const result = classifyCandidates(activity, 'running', [far, close]);
    expect(result.decision).toBe('merge');
    expect(result.target).toBe(close);
  });

  test('multiple matches, ambiguous tiebreak → pending', () => {
    const a = makeEvent({ sessionDetails: { discipline: 'running', estimatedDuration: 45 } });
    const b = makeEvent({ sessionDetails: { discipline: 'running', estimatedDuration: 50 } });
    const result = classifyCandidates(activity, 'running', [a, b]);
    expect(result.decision).toBe('pending');
    expect(result.candidateIds).toHaveLength(2);
  });

  test('missing estimatedDuration counts as out of tolerance', () => {
    const a = makeEvent({ sessionDetails: { discipline: 'running' } });
    const b = makeEvent({ sessionDetails: { discipline: 'running' } });
    expect(classifyCandidates(activity, 'running', [a, b]).decision).toBe('pending');
  });

  test('completed discipline-match → pending, never merge', () => {
    const done = makeEvent({ status: 'completed' });
    const result = classifyCandidates(activity, 'running', [done]);
    expect(result.decision).toBe('pending');
  });

  test('sessionLogId event (app-logged) → pending, never merge', () => {
    const logged = makeEvent({ sessionLogId: oid() });
    expect(classifyCandidates(activity, 'running', [logged]).decision).toBe('pending');
  });

  test('skipped discipline-match → pending (the "skipped but actually done" question)', () => {
    const skipped = makeEvent({ status: 'skipped' });
    const result = classifyCandidates(activity, 'running', [skipped]);
    expect(result.decision).toBe('pending');
    expect(result.candidateIds).toEqual([skipped._id]);
  });

  test('skipped non-matching event alone does not trigger pending', () => {
    const skipped = makeEvent({ status: 'skipped', sessionDetails: { discipline: 'strength' } });
    expect(classifyCandidates(activity, 'running', [skipped]).decision).toBe('none');
  });

  test('open candidates but no discipline match → pending with those candidates', () => {
    const strengthPlan = makeEvent({ sessionDetails: { discipline: 'strength' } });
    const result = classifyCandidates(activity, 'running', [strengthPlan]);
    expect(result.decision).toBe('pending');
    expect(result.candidateIds).toEqual([strengthPlan._id]);
  });

  test('empty day → none', () => {
    expect(classifyCandidates(activity, 'running', []).decision).toBe('none');
  });

  test('other-day events are ignored', () => {
    const otherDay = makeEvent({ date: new Date('2026-07-28T00:00:00Z') });
    expect(classifyCandidates(activity, 'running', [otherDay]).decision).toBe('none');
  });

  test('already-linked events are excluded', () => {
    const linked = makeEvent({ externalActivityId: oid() });
    expect(classifyCandidates(activity, 'running', [linked]).decision).toBe('none');
  });

  test("'other' discipline short-circuits to none even with open candidates", () => {
    const event = makeEvent({ sessionDetails: { discipline: 'strength' } });
    expect(classifyCandidates(activity, 'other', [event]).decision).toBe('none');
  });

  test('template primary_disciplines is the discipline fallback', () => {
    const event = makeEvent({
      sessionDetails: {},
      sessionTemplateId: { primary_disciplines: ['running'] }
    });
    expect(classifyCandidates(activity, 'running', [event]).decision).toBe('merge');
  });

  test('timestamped app-logged event across the UTC day boundary still counts as same-day', () => {
    // Activity at 01:00 local Jul 30; logged event stored 21:30 UTC Jul 29 (00:30 local Jul 30)
    const nightOwl = makeActivity({
      startDate: new Date('2026-07-29T22:00:00Z'),
      rawData: { start_date: '2026-07-29T22:00:00Z', start_date_local: '2026-07-30T01:00:00Z', utc_offset: 10800 }
    });
    const logged = makeEvent({ date: new Date('2026-07-29T21:30:00Z'), sessionLogId: oid() });
    expect(classifyCandidates(nightOwl, 'running', [logged]).decision).toBe('pending');
  });
});

describe('shouldUnlinkNotDelete', () => {
  test('merged events unlink', () => {
    expect(shouldUnlinkNotDelete({ sessionDetails: { source: 'strava-matched' } })).toBe(true);
  });

  test('template/plan/sessionLog-backed events unlink (belt and suspenders)', () => {
    expect(shouldUnlinkNotDelete({ sessionTemplateId: oid() })).toBe(true);
    expect(shouldUnlinkNotDelete({ planId: oid() })).toBe(true);
    expect(shouldUnlinkNotDelete({ sessionLogId: oid() })).toBe(true);
  });

  test('mirrors delete — including legacy events with stripped source', () => {
    expect(shouldUnlinkNotDelete({ sessionDetails: { source: 'strava' } })).toBe(false);
    expect(shouldUnlinkNotDelete({ sessionDetails: {} })).toBe(false);
  });
});

describe('mergeSetCompletion (un-merge revert guard)', () => {
  const start = new Date('2026-07-29T18:30:00Z');
  const act = { startDate: start };

  test('merge-stamped completion (completedAt === activity start) → revert allowed', () => {
    expect(mergeSetCompletion({ completedAt: new Date(start) }, act)).toBe(true);
  });

  test('manual pre-merge completion (different completedAt) is preserved', () => {
    expect(mergeSetCompletion({ completedAt: new Date('2026-07-29T20:00:00Z') }, act)).toBe(false);
  });

  test('unknown activity (orphan cleanup) never reverts', () => {
    expect(mergeSetCompletion({ completedAt: new Date(start) }, null)).toBe(false);
  });

  test('no completedAt → nothing to revert', () => {
    expect(mergeSetCompletion({}, act)).toBe(false);
  });
});

describe('schema persistence of the new fields', () => {
  test('CalendarEvent keeps sessionDetails.source and stravaData (strict-mode fix)', () => {
    const doc = new CalendarEvent({
      userId: oid(),
      date: new Date(),
      title: 'Morning Run',
      sessionDetails: {
        discipline: 'running',
        source: 'strava',
        stravaData: { sportType: 'Run', distance: 10000, stravaUrl: 'https://www.strava.com/activities/1' }
      }
    });
    expect(doc.validateSync()).toBeUndefined();
    const obj = doc.toObject();
    expect(obj.sessionDetails.source).toBe('strava');
    expect(obj.sessionDetails.stravaData.sportType).toBe('Run');
    expect(obj.sessionDetails.stravaData.distance).toBe(10000);
  });

  test('ExternalActivity matchStatus enum accepts known values, rejects others', () => {
    const base = { userId: oid(), source: 'strava', externalId: '1', name: 'x', sportType: 'Run', startDate: new Date() };
    for (const value of ['auto', 'confirmed', 'pending', 'separate', 'unmatched']) {
      expect(new ExternalActivity({ ...base, matchStatus: value }).validateSync()).toBeUndefined();
    }
    const bad = new ExternalActivity({ ...base, matchStatus: 'maybe' });
    expect(bad.validateSync().errors.matchStatus).toBeDefined();
  });
});
