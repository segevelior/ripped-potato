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

const makeReq = (settings) => ({
  body: { settings },
  user: { _id: 'user-1', settings: {}, profile: {} }
});

const savedUser = { _id: 'user-1', settings: {}, profile: {} };

beforeEach(() => {
  jest.clearAllMocks();
  User.findByIdAndUpdate.mockResolvedValue(savedUser);
});

describe('updateProfile settings writes', () => {
  test('plain keys become dot-path sets; sportsNews allows only enabled + legacy sports', async () => {
    await updateProfile(
      makeReq({ theme: 'dark', sportsNews: { enabled: false, sports: ['soccer'], follows: [{ label: 'x', feeds: ['y/z'] }] } }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    expect(updateData['settings.theme']).toBe('dark');
    expect(updateData['settings.sportsNews.enabled']).toBe(false);
    expect(updateData['settings.sportsNews.sports']).toEqual(['soccer']);
    // follows is written exclusively by POST /news/follows
    expect(updateData['settings.sportsNews.follows']).toBeUndefined();
    expect(updateData['settings.sportsNews']).toBeUndefined();
  });

  test('dotted keys cannot smuggle nested paths past the sportsNews guard', async () => {
    await updateProfile(
      makeReq({
        'sportsNews.follows': [{ label: 'EVIL', feeds: ['hack/hack'] }],
        'sportsNews.follows.0.feeds': ['also/evil'],
        '$set': { 'settings.sportsNews.follows': [] }
      }),
      makeRes()
    );

    const updateData = User.findByIdAndUpdate.mock.calls[0][1];
    const keys = Object.keys(updateData);
    expect(keys.some((k) => k.includes('follows'))).toBe(false);
    expect(keys.some((k) => k.includes('$'))).toBe(false);
    expect(keys).toEqual([]); // nothing legitimate in that payload
  });
});
