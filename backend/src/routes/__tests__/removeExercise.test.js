jest.mock('../../middleware/auth', () => ({
  auth: (req, res, next) => {
    req.user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'user' };
    next();
  },
  optionalAuth: (req, res, next) => next()
}));
jest.mock('../../services/WorkoutService', () => ({}));
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
jest.mock('../../models/UserWorkoutModification', () => ({
  findOne: jest.fn()
}));
jest.mock('../../models/PredefinedWorkout', () => {
  const ctor = jest.fn();
  ctor.findById = jest.fn();
  return ctor;
});

const express = require('express');
const request = require('supertest');
const PredefinedWorkout = require('../../models/PredefinedWorkout');
const CalendarEvent = require('../../models/CalendarEvent');
const Plan = require('../../models/Plan');
const UserWorkoutModification = require('../../models/UserWorkoutModification');
const router = require('../predefinedWorkouts');

const app = express();
app.use(express.json());
app.use('/', router);

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET_EX = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_EX = 'ffffffffffffffffffffffff';
const WORKOUT_ID = 'dddddddddddddddddddddddd';
const CLONE_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

const makeBlocks = () => [
  {
    name: 'Warm-up',
    exercises: [{ exercise_id: TARGET_EX, exercise_name: 'Plank', volume: '2x30s', rest: '30s', notes: '' }]
  },
  {
    name: 'Main Work',
    exercises: [
      { exercise_id: TARGET_EX, exercise_name: 'Plank', volume: '3x60s', rest: '60s', notes: '' },
      { exercise_id: OTHER_EX, exercise_name: 'Squat', volume: '3x5', rest: '120s', notes: '' }
    ]
  }
];

const makeWorkout = ({ ownedByUser, isCommon, blocks = makeBlocks() }) => {
  const workout = {
    _id: WORKOUT_ID,
    name: 'Core Day',
    isCommon,
    createdBy: ownedByUser ? USER_ID : 'a1a1a1a1a1a1a1a1a1a1a1a1',
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
  UserWorkoutModification.findOne.mockResolvedValue(null);
  PredefinedWorkout.mockImplementation(function (data) {
    Object.assign(this, JSON.parse(JSON.stringify(data)));
    this._id = CLONE_ID;
    this.save = jest.fn().mockResolvedValue(undefined);
    this.toObject = () => JSON.parse(JSON.stringify({ ...this, save: undefined, toObject: undefined }));
  });
});

describe('POST /:id/remove-exercise', () => {
  it('400s without exerciseId', async () => {
    const res = await request(app).post(`/${WORKOUT_ID}/remove-exercise`).send({});
    expect(res.status).toBe(400);
  });

  it('removes all occurrences in-place on an own template and drops emptied blocks', async () => {
    const workout = makeWorkout({ ownedByUser: true, isCommon: false });
    PredefinedWorkout.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${WORKOUT_ID}/remove-exercise`)
      .send({ exerciseId: TARGET_EX });

    expect(res.status).toBe(200);
    expect(res.body.cloned).toBe(false);
    expect(res.body.removedCount).toBe(2);
    // Warm-up block became empty and was dropped; Main Work keeps the squat.
    expect(workout.blocks).toHaveLength(1);
    expect(workout.blocks[0].exercises.map(e => e.exercise_name)).toEqual(['Squat']);
    expect(workout.save).toHaveBeenCalled();
  });

  it('clones a common template and relinks calendar + plan references', async () => {
    const workout = makeWorkout({ ownedByUser: false, isCommon: true });
    PredefinedWorkout.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${WORKOUT_ID}/remove-exercise`)
      .send({ exerciseId: TARGET_EX });

    expect(res.status).toBe(200);
    expect(res.body.cloned).toBe(true);
    expect(res.body.workout.isCommon).toBe(false);
    expect(res.body.workout.createdBy).toBe(USER_ID);
    expect(workout.save).not.toHaveBeenCalled(); // original untouched
    expect(CalendarEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ workoutTemplateId: WORKOUT_ID }),
      { $set: { workoutTemplateId: CLONE_ID } }
    );
    expect(Plan.updateMany).toHaveBeenCalled();
  });

  it('400s when the exercise is not in the workout', async () => {
    const workout = makeWorkout({ ownedByUser: true, isCommon: false });
    PredefinedWorkout.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${WORKOUT_ID}/remove-exercise`)
      .send({ exerciseId: 'cccccccccccccccccccccccc' });

    expect(res.status).toBe(400);
    expect(workout.save).not.toHaveBeenCalled();
  });

  it('refuses to remove the last remaining exercise', async () => {
    const workout = makeWorkout({
      ownedByUser: true,
      isCommon: false,
      blocks: [{ name: 'Only', exercises: [{ exercise_id: TARGET_EX, exercise_name: 'Plank', volume: '3x60s', rest: '', notes: '' }] }]
    });
    PredefinedWorkout.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${WORKOUT_ID}/remove-exercise`)
      .send({ exerciseId: TARGET_EX });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
    expect(workout.save).not.toHaveBeenCalled();
  });

  it('403s on someone else\'s private workout', async () => {
    const workout = makeWorkout({ ownedByUser: false, isCommon: false });
    PredefinedWorkout.findById.mockResolvedValue(workout);

    const res = await request(app)
      .post(`/${WORKOUT_ID}/remove-exercise`)
      .send({ exerciseId: TARGET_EX });

    expect(res.status).toBe(403);
  });
});
