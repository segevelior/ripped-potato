jest.mock('../../config/sportsNews', () => ({
  ESPN_LEAGUES: [],
  isWhitelistedSlug: () => true,
  getLeagueBySlug: () => null,
  legacySlugFeeds: () => [],
  DEFAULT_SUGGESTIONS: [],
  SPORT_FEEDS: {},
  GLOBAL_TOP_FEEDS: [
    { slug: 'soccer/fifa.world', label: 'World Cup', from: '2026-06-01', to: '2026-08-01' },
    { slug: 'olympics', label: 'Olympics', from: '2026-07-01', to: '2026-09-01' },
    { slug: 'tennis/wimbledon', label: 'Wimbledon', from: '2026-06-20', to: '2026-07-20' }
  ],
  NEWS_TTL_DAYS: 3,
  MAX_ARTICLES_PER_FEED: 10
}));

const { pickTopEvents } = require('../news');

const article = (n, feeds) => ({
  _id: `id-${n}`,
  headline: `Story ${n}`,
  feeds,
  isTopEvent: true,
  publishedAt: new Date(`2026-07-${String(20 - n).padStart(2, '0')}T10:00:00Z`)
});

describe('pickTopEvents', () => {
  test('many articles from one global feed collapse to the newest one', () => {
    const pool = [1, 2, 3, 4, 5, 6].map((n) => article(n, ['soccer/fifa.world']));
    const picked = pickTopEvents(pool, 2);
    expect(picked).toHaveLength(1);
    expect(picked[0]._id).toBe('id-1');
  });

  test('two global feeds yield one article each, newest per group', () => {
    const pool = [
      article(1, ['soccer/fifa.world']),
      article(2, ['olympics']),
      article(3, ['soccer/fifa.world']),
      article(4, ['olympics'])
    ];
    const picked = pickTopEvents(pool, 2);
    expect(picked.map((a) => a._id)).toEqual(['id-1', 'id-2']);
  });

  test('three concurrent global feeds respect the cap, keeping newest-first order', () => {
    const pool = [
      article(1, ['tennis/wimbledon']),
      article(2, ['soccer/fifa.world']),
      article(3, ['olympics'])
    ];
    const picked = pickTopEvents(pool, 2);
    expect(picked.map((a) => a._id)).toEqual(['id-1', 'id-2']);
  });

  test('articles with stale or missing feed slugs group by fallback key without crashing', () => {
    const pool = [
      article(1, ['soccer/uefa.euro']),
      article(2, ['soccer/uefa.euro']),
      article(3, undefined),
      article(4, [])
    ];
    const picked = pickTopEvents(pool, 4);
    // stale slugs group by feeds[0]; missing feeds share the 'unknown' group
    expect(picked.map((a) => a._id)).toEqual(['id-1', 'id-3']);
  });

  test('empty pool returns empty', () => {
    expect(pickTopEvents([], 2)).toEqual([]);
  });
});
