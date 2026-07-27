/**
 * Regression guard for the workout-log write path used by the torii MCP tools
 * (create_workout / update_workout): logs land in SessionLog, the session
 * interval is derived honestly, and the calendar entry stays in step.
 */
jest.mock('../../models/SessionLog', () => {
  const ctor = jest.fn(function (doc) {
    Object.assign(this, doc);
    this._id = 'log000000000000000000001';
    this.save = jest.fn().mockResolvedValue(this);
  });
  ctor.findOneAndUpdate = jest.fn();
  return ctor;
});
jest.mock('../../models/CalendarEvent', () => {
  const ctor = jest.fn(function (doc) {
    Object.assign(this, doc);
    this._id = 'cal000000000000000000001';
    this.save = jest.fn().mockResolvedValue(this);
  });
  ctor.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  ctor.findByIdAndDelete = jest.fn().mockResolvedValue({});
  return ctor;
});
jest.mock('../../models/Exercise', () => ({
  exists: jest.fn(),
  findOne: jest.fn()
}));

const SessionLog = require('../../models/SessionLog');
const CalendarEvent = require('../../models/CalendarEvent');
const Exercise = require('../../models/Exercise');
const { createSessionLog, updateSessionLog } = require('../sessionLogController');

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const EXERCISE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const lastJson = (res) => res.json.mock.calls[res.json.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  Exercise.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: EXERCISE_ID })
  });
});

describe('createSessionLog', () => {
  const baseBody = {
    title: 'Morning Push',
    type: 'Strength',
    startedAt: '2026-07-20T07:00:00.000Z',
    actualDuration: 45,
    exercises: [
      { exerciseName: 'Bench Press', sets: [{ actualReps: 8, weight: 60 }] }
    ]
  };

  const run = async (body) => {
    const res = makeRes();
    await createSessionLog({ user: { _id: USER_ID }, body }, res);
    return res;
  };

  test('writes a SessionLog with normalized fields and a derived completedAt', async () => {
    const res = await run({ ...baseBody });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(SessionLog).toHaveBeenCalledTimes(1);

    const doc = SessionLog.mock.calls[0][0];
    expect(doc.userId).toBe(USER_ID);
    expect(doc.title).toBe('Morning Push');
    expect(doc.type).toBe('strength');
    expect(doc.startedAt).toBeInstanceOf(Date);
    expect(doc.startedAt.toISOString()).toBe('2026-07-20T07:00:00.000Z');
    expect(doc.actualDuration).toBe(45);
    // completedAt = startedAt + actualDuration, NOT "now".
    expect(doc.completedAt).toBeInstanceOf(Date);
    expect(doc.completedAt.toISOString()).toBe('2026-07-20T07:45:00.000Z');
    expect(doc.completedAt - doc.startedAt).toBe(45 * 60000);
    expect(doc).not.toHaveProperty('status');

    // Exercise ids resolved by name.
    expect(doc.exercises).toHaveLength(1);
    expect(doc.exercises[0].exerciseId).toBe(EXERCISE_ID);
    expect(doc.exercises[0].exerciseName).toBe('Bench Press');
  });

  test('creates a completed calendar event backlinked to the log', async () => {
    const res = await run({ ...baseBody });

    expect(CalendarEvent).toHaveBeenCalledTimes(1);
    const event = CalendarEvent.mock.calls[0][0];
    expect(event.type).toBe('workout');
    expect(event.status).toBe('completed');
    expect(event.workoutLogId).toBe('log000000000000000000001');
    expect(event.date.toISOString()).toBe('2026-07-20T07:00:00.000Z');
    expect(event.completedAt.toISOString()).toBe('2026-07-20T07:45:00.000Z');
    expect(event.workoutDetails.durationMinutes).toBe(45);
    expect(event.workoutDetails.exercises[0].exerciseName).toBe('Bench Press');

    // The log carries the backlink to the event.
    const { log } = lastJson(res).data;
    expect(log.calendarEventId).toBe('cal000000000000000000001');
    expect(log.save).toHaveBeenCalledTimes(2);
  });

  test('explicit completedAt wins and derives the duration from the real interval', async () => {
    const { actualDuration, ...rest } = baseBody;
    await run({ ...rest, completedAt: '2026-07-20T08:10:00.000Z' });

    const doc = SessionLog.mock.calls[0][0];
    expect(doc.completedAt.toISOString()).toBe('2026-07-20T08:10:00.000Z');
    expect(doc.actualDuration).toBe(70);
  });

  test('with neither completedAt nor duration, completedAt = startedAt and duration stays unset', async () => {
    const { actualDuration, ...rest } = baseBody;
    await run({ ...rest });

    const doc = SessionLog.mock.calls[0][0];
    expect(doc.completedAt.toISOString()).toBe('2026-07-20T07:00:00.000Z');
    expect(doc.actualDuration).toBeUndefined();
  });
});

describe('updateSessionLog', () => {
  test('syncs the linked calendar event with the changed fields only', async () => {
    SessionLog.findOneAndUpdate.mockResolvedValue({
      _id: 'log000000000000000000001',
      calendarEventId: 'cal000000000000000000001',
      title: 'Evening Push',
      type: 'strength',
      startedAt: new Date('2026-07-20T18:00:00.000Z'),
      actualDuration: 50,
      exercises: []
    });

    const res = makeRes();
    await updateSessionLog(
      {
        user: { _id: USER_ID },
        params: { id: 'log000000000000000000001' },
        body: { title: 'Evening Push', actualDuration: 50 }
      },
      res
    );

    expect(CalendarEvent.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [eventId, payload] = CalendarEvent.findByIdAndUpdate.mock.calls[0];
    expect(eventId).toBe('cal000000000000000000001');
    expect(payload.$set).toEqual({
      title: 'Evening Push',
      'workoutDetails.durationMinutes': 50
    });
    expect(lastJson(res).success).toBe(true);
  });

  test('resolves exercise ids on the update path', async () => {
    SessionLog.findOneAndUpdate.mockResolvedValue({
      _id: 'log000000000000000000001',
      exercises: []
    });

    await updateSessionLog(
      {
        user: { _id: USER_ID },
        params: { id: 'log000000000000000000001' },
        body: { exercises: [{ exerciseName: 'Bench Press', sets: [] }] }
      },
      makeRes()
    );

    const update = SessionLog.findOneAndUpdate.mock.calls[0][1];
    expect(update.exercises[0].exerciseId).toBe(EXERCISE_ID);
    expect(update.exercises[0].order).toBe(0);
    // No linked event on this log -> nothing to sync.
    expect(CalendarEvent.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
