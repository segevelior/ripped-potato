/**
 * Interest-based visibility of common session templates: canonical + cached
 * custom labels resolve to disciplines; the hide predicate only ever hides
 * sport-specific-only commons the user hasn't opted into.
 */
jest.mock('../../models/SportInterestResolution', () => ({
  find: jest.fn(),
}));

const SportInterestResolution = require('../../models/SportInterestResolution');
const { resolveInterestDisciplines, isHiddenSportTemplate } = require('../interestDisciplines');

const mockCache = (docs) => {
  SportInterestResolution.find.mockReturnValue({ lean: () => Promise.resolve(docs) });
};

describe('resolveInterestDisciplines', () => {
  beforeEach(() => jest.clearAllMocks());

  test('canonical labels map to themselves without touching the cache', async () => {
    const result = await resolveInterestDisciplines(['Climbing', 'running']);
    expect([...result].sort()).toEqual(['climbing', 'running']);
    expect(SportInterestResolution.find).not.toHaveBeenCalled();
  });

  test('legacy synonyms normalize (endurance -> cardio)', async () => {
    const result = await resolveInterestDisciplines(['Endurance']);
    expect([...result]).toEqual(['cardio']);
  });

  test('custom labels resolve through the cache', async () => {
    mockCache([{ label: 'triathlon', disciplines: ['running', 'cycling', 'swimming'] }]);
    const result = await resolveInterestDisciplines(['triathlon']);
    expect([...result].sort()).toEqual(['cycling', 'running', 'swimming']);
    expect(SportInterestResolution.find).toHaveBeenCalledWith({ label: { $in: ['triathlon'] } });
  });

  test('uncached custom labels contribute nothing', async () => {
    mockCache([]);
    const result = await resolveInterestDisciplines(['underwater basket weaving']);
    expect(result.size).toBe(0);
  });

  test('off-vocab disciplines in a cache doc are ignored', async () => {
    mockCache([{ label: 'ninja', disciplines: ['parkour', 'calisthenics'] }]);
    const result = await resolveInterestDisciplines(['ninja']);
    expect([...result]).toEqual(['calisthenics']);
  });

  test('empty / junk input resolves to an empty set', async () => {
    expect((await resolveInterestDisciplines([])).size).toBe(0);
    expect((await resolveInterestDisciplines(undefined)).size).toBe(0);
    expect((await resolveInterestDisciplines(['', 42, null])).size).toBe(0);
  });
});

describe('isHiddenSportTemplate', () => {
  const common = (disciplines, extra = {}) => ({
    isCommon: true,
    primary_disciplines: disciplines,
    ...extra,
  });
  const none = new Set();

  test('generic common stays visible with no interests', () => {
    expect(isHiddenSportTemplate(common(['strength', 'calisthenics']), none)).toBe(false);
  });

  test('sport-specific common hidden with no interests', () => {
    expect(isHiddenSportTemplate(common(['cycling']), none)).toBe(true);
  });

  test('sport-specific common visible with matching interest', () => {
    expect(isHiddenSportTemplate(common(['cycling']), new Set(['cycling']))).toBe(false);
  });

  test('mixed generic+sport template always visible', () => {
    expect(isHiddenSportTemplate(common(['cardio', 'running']), none)).toBe(false);
  });

  test('no-discipline common always visible', () => {
    expect(isHiddenSportTemplate(common([]), none)).toBe(false);
  });

  test('private templates never hidden', () => {
    expect(isHiddenSportTemplate({ isCommon: false, primary_disciplines: ['cycling'] }, none)).toBe(false);
  });

  test('favorited/modified sport common stays visible (opt-in wins)', () => {
    expect(isHiddenSportTemplate(common(['climbing'], { userMetadata: { isFavorite: true } }), none)).toBe(false);
    expect(isHiddenSportTemplate(common(['climbing'], { isModified: true }), none)).toBe(false);
  });

  test('ANY modification doc counts as opt-in, not just favorites', () => {
    // A user who completed a template (timesCompleted metadata) but never
    // favorited it has expressed interest too — the overlay attaches
    // userMetadata whenever a UserSessionModification doc exists.
    expect(isHiddenSportTemplate(
      common(['running'], { userMetadata: { timesCompleted: 3, isFavorite: false } }), none
    )).toBe(false);
  });
});
