jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    req.user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'user' };
    next();
  },
  optionalAuth: (req, res, next) => next()
}));
jest.mock('../../services/SessionService', () => ({}));
jest.mock('../../models/CalendarEvent', () => ({
  updateMany: jest.fn().mockResolvedValue({}),
  countDocuments: jest.fn().mockResolvedValue(0)
}));
jest.mock('../../models/Plan', () => ({
  updateMany: jest.fn().mockResolvedValue({})
}));
jest.mock('../../models/Exercise', () => ({
  findOne: jest.fn()
}));
jest.mock('../../models/UserSessionModification', () => ({
  findOne: jest.fn()
}));
jest.mock('../../models/SessionTemplate', () => {
  const ctor = jest.fn();
  ctor.findById = jest.fn();
  return ctor;
});

const express = require('express');
const request = require('supertest');
const SessionTemplate = require('../../models/SessionTemplate');
const CalendarEvent = require('../../models/CalendarEvent');
const Plan = require('../../models/Plan');
const Exercise = require('../../models/Exercise');
const UserSessionModification = require('../../models/UserSessionModification');
const router = require('../sessionTemplates');

const app = express();
app.use(express.json());
app.use('/', router);

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const FROM_EX = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TO_EX = 'cccccccccccccccccccccccc';
const TEMPLATE_ID = 'dddddddddddddddddddddddd';
const CLONE_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

const makeBlocks = () => [
  {
    name: 'Warm-up',
    exercises: [{ exercise_id: FROM_EX, exercise_name: 'Bench Press', volume: '2x10', rest: '60s', notes: 'light' }]
  },
  {
    name: 'Main Work',
    exercises: [
      { exercise_id: FROM_EX, exercise_name: 'Bench Press', volume: '3x8', rest: '90s', notes: '' },
      { exercise_id: 'ffffffffffffffffffffffff', exercise_name: 'Squat', volume: '3x5', rest: '120s', notes: '' }
    ]
  }
];

const makeTemplate = ({ ownedByUser, isCommon, blocks = makeBlocks() }) => {
  const workout = {
    _id: TEMPLATE_ID,
    name: 'Push Day',
    goal: 'strength',
    estimated_duration: 45,
    difficulty_level: 'intermediate',
    isCommon,
    createdBy: ownedByUser ? USER_ID : 'a1a1a1a1a1a1a1a1a1a1a1a1',
    popularity: 7,
    ratings: { average: 4.5, count: 12 },
    blocks,
    canUserEdit(userId) {
      return !this.isCommon && this.createdBy === userId;
    },
    save: jest.fn().mockResolvedValue(undefined)
  };
  workout.toObject = () => JSON.parse(JSON.stringify({ ...workout, save: undefined, toObject: undefined }));
  return workout;
};

beforeEach(() => {
  jest.clearAllMocks();
  Exercise.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: TO_EX, name: 'Dumbbell Press' })
  });
  UserSessionModification.findOne.mockResolvedValue(null);
  SessionTemplate.mockImplementation(function (data) {
    Object.assign(this, JSON.parse(JSON.stringify(data)));
    this._id = CLONE_ID;
    this.save = jest.fn().mockResolvedValue(undefined);
    this.toObject = () => JSON.parse(JSON.stringify({ ...this, save: undefined, toObject: undefined }));
  });
});

describe('POST /:id/swap-exercise', () => {
  test('own template: swaps every occurrence in place, keeps volume/rest/notes', async () => {
    const workout = makeTemplate({ ownedByUser: true, isCommon: false });
    SessionTemplate.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(200);
    expect(res.body.cloned).toBe(false);
    expect(res.body.replacedCount).toBe(2);
    expect(workout.save).toHaveBeenCalled();
    expect(workout.blocks[0].exercises[0]).toMatchObject({
      exercise_id: TO_EX,
      exercise_name: 'Dumbbell Press',
      volume: '2x10',
      rest: '60s',
      notes: 'light'
    });
    expect(workout.blocks[1].exercises[0].exercise_id).toBe(TO_EX);
    expect(workout.blocks[1].exercises[1].exercise_id).toBe('ffffffffffffffffffffffff');
    expect(CalendarEvent.updateMany).not.toHaveBeenCalled();
    expect(Plan.updateMany).not.toHaveBeenCalled();
  });

  test('common template: clones privately, swaps, relinks calendar events and plans', async () => {
    const workout = makeTemplate({ ownedByUser: false, isCommon: true });
    SessionTemplate.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(200);
    expect(res.body.cloned).toBe(true);
    expect(res.body.replacedCount).toBe(2);
    expect(res.body.workout._id).toBe(CLONE_ID);
    expect(workout.save).not.toHaveBeenCalled();

    const cloneData = SessionTemplate.mock.calls[0][0];
    expect(cloneData._id).toBeUndefined();
    expect(cloneData.createdBy).toBe(USER_ID);
    expect(cloneData.isCommon).toBe(false);
    expect(cloneData.popularity).toBe(0);
    expect(cloneData.ratings).toEqual({ average: 0, count: 0 });

    expect(CalendarEvent.updateMany).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        sessionTemplateId: TEMPLATE_ID,
        status: { $in: ['scheduled', 'in_progress'] }
      },
      { $set: { sessionTemplateId: CLONE_ID } }
    );
    expect(Plan.updateMany).toHaveBeenCalledWith(
      { userId: USER_ID, 'weeks.sessions.sessionTemplateId': TEMPLATE_ID },
      { $set: { 'weeks.$[].sessions.$[s].sessionTemplateId': CLONE_ID } },
      { arrayFilters: [{ 's.sessionTemplateId': TEMPLATE_ID }] }
    );
  });

  test('common template clone folds the modification overlay and moves the row', async () => {
    const workout = makeTemplate({ ownedByUser: false, isCommon: true });
    SessionTemplate.findById.mockResolvedValue(workout);
    const modification = {
      modifications: { title: 'My Push Day', description: 'tweaked', durationMinutes: 60 },
      metadata: { isFavorite: true },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined)
    };
    UserSessionModification.findOne.mockResolvedValue(modification);

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(200);
    const cloneData = SessionTemplate.mock.calls[0][0];
    expect(cloneData.name).toBe('My Push Day');
    expect(cloneData.goal).toBe('tweaked');
    expect(cloneData.estimated_duration).toBe(60);

    expect(modification.sessionTemplateId).toBe(CLONE_ID);
    expect(modification.modifications.title).toBeUndefined();
    expect(modification.modifications.description).toBeUndefined();
    expect(modification.modifications.durationMinutes).toBeUndefined();
    expect(modification.markModified).toHaveBeenCalledWith('modifications');
    expect(modification.save).toHaveBeenCalled();
  });

  test('400 when the exercise is not in the workout', async () => {
    const workout = makeTemplate({
      ownedByUser: true,
      isCommon: false,
      blocks: [{ name: 'Main', exercises: [{ exercise_id: 'ffffffffffffffffffffffff', exercise_name: 'Squat' }] }]
    });
    SessionTemplate.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(400);
    expect(workout.save).not.toHaveBeenCalled();
  });

  test('403 on someone else\'s private workout', async () => {
    const workout = makeTemplate({ ownedByUser: false, isCommon: false });
    SessionTemplate.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(403);
  });

  test('400 when the replacement exercise is not visible to the user', async () => {
    const workout = makeTemplate({ ownedByUser: true, isCommon: false });
    SessionTemplate.findById.mockResolvedValue(workout);
    Exercise.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post(`/${TEMPLATE_ID}/swap-exercise`)
      .send({ fromExerciseId: FROM_EX, toExerciseId: TO_EX });

    expect(res.status).toBe(400);
    expect(workout.save).not.toHaveBeenCalled();
  });
});
