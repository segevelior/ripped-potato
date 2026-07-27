jest.mock('../../models/User', () => ({
  findByIdAndUpdate: jest.fn()
}));
jest.mock('../../utils/invalidateTodaysPick', () => ({
  invalidateTodaysPick: jest.fn()
}));

const User = require('../../models/User');
const { updateProfile } = require('../authController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (profile) => ({
  body: { profile },
  user: { _id: 'user-1', settings: {}, profile: {} }
});

const savedUser = { _id: 'user-1', settings: {}, profile: {} };

beforeEach(() => {
  jest.clearAllMocks();
  User.findByIdAndUpdate.mockResolvedValue(savedUser);
});

describe('updateProfile profile writes', () => {
  test('plain keys become dot-path sets; omitted keys are not written at all', async () => {
    await updateProfile(
      makeReq({ sportPreferences: ['climbing', 'yoga'], goals: ['20 pull-ups'] }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    expect(updateData['profile.sportPreferences']).toEqual(['climbing', 'yoga']);
    expect(updateData['profile.goals']).toEqual(['20 pull-ups']);
    // no whole-object write, and untouched fields (injuries, weight, ...) absent
    expect(updateData.profile).toBeUndefined();
    expect(updateData['profile.injuries']).toBeUndefined();
    expect(updateData['profile.weight']).toBeUndefined();
  });

  test('empty-string values are dropped, not written', async () => {
    await updateProfile(
      makeReq({ weight: '', gender: '', fitnessLevel: 'advanced' }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    expect(updateData['profile.fitnessLevel']).toBe('advanced');
    expect(updateData['profile.weight']).toBeUndefined();
    expect(updateData['profile.gender']).toBeUndefined();
  });

  test('preferences merge one level: each preference key is its own dot-path', async () => {
    await updateProfile(
      makeReq({ preferences: { equipment: ['bands'] } }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    expect(updateData['profile.preferences.equipment']).toEqual(['bands']);
    // sibling preferences (sessionDuration, sessionDays) must not be touched
    expect(updateData['profile.preferences']).toBeUndefined();
  });

  test('dotted / operator keys cannot smuggle nested paths', async () => {
    await updateProfile(
      makeReq({
        'preferences.equipment': ['evil'],
        '$set': { role: 'admin' },
        preferences: { '$rename': { a: 'b' }, 'nested.path': 1 }
      }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    expect(Object.keys(updateData)).toEqual([]); // nothing legitimate in that payload
  });

  test('injuries change still invalidates the day pick', async () => {
    const { invalidateTodaysPick } = require('../../utils/invalidateTodaysPick');
    await updateProfile(
      makeReq({ injuries: ['right shoulder'] }),
      makeRes()
    );
    expect(invalidateTodaysPick).toHaveBeenCalledWith('user-1');
  });
});
