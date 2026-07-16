const axios = require('axios');

jest.mock('axios');

jest.mock('../../config/sportsNews', () => ({
  ESPN_LEAGUES: [],
  isWhitelistedSlug: () => true,
  getLeagueBySlug: () => null,
  legacySlugFeeds: () => [],
  DEFAULT_SUGGESTIONS: [],
  SPORT_FEEDS: {},
  GLOBAL_TOP_FEEDS: [],
  NEWS_TTL_DAYS: 3,
  MAX_ARTICLES_PER_FEED: 3
}));

const SportsNewsService = require('../SportsNewsService');

const quietLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const article = (n, overrides = {}) => ({
  headline: `Story ${n}`,
  description: `desc ${n}`,
  images: [{ url: `https://img/${n}.jpg` }],
  links: { web: { href: `https://espn.com/story/${n}` } },
  published: `2026-07-0${n}T10:00:00Z`,
  type: 'Story',
  premium: false,
  ...overrides
});

beforeEach(() => jest.clearAllMocks());

describe('fetchFeed oneFeed scheme', () => {
  test('onefeed: slugs hit the oneFeed API and flatten feed[].data.now[]', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        feed: [
          { data: { now: [article(1), article(2)] } },
          { data: { now: [article(3)] } },
          { data: {} } // entry without articles
        ]
      }
    });

    const service = new SportsNewsService(quietLogger);
    const result = await service.fetchFeed('onefeed:motogp');

    expect(axios.get.mock.calls[0][0]).toBe(
      'https://onefeed.fan.api.espn.com/apis/v3/cached/contentEngine/oneFeed/leagues/motogp'
    );
    expect(result.status).toBe('ok');
    // Sorted newest-first
    expect(result.articles.map((a) => a.headline)).toEqual(['Story 3', 'Story 2', 'Story 1']);
    expect(result.articles[0]).toEqual({
      articleUrl: 'https://espn.com/story/3',
      headline: 'Story 3',
      description: 'desc 3',
      imageUrl: 'https://img/3.jpg',
      publishedAt: new Date('2026-07-03T10:00:00Z')
    });
  });

  test('dedupes repeated stories, filters premium/video, caps at MAX_ARTICLES_PER_FEED', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        feed: [
          {
            data: {
              now: [
                article(1),
                article(1), // duplicate url
                article(2, { premium: true }),
                article(3, { type: 'Media' }),
                article(4),
                article(5),
                article(6),
                article(7)
              ]
            }
          }
        ]
      }
    });

    const service = new SportsNewsService(quietLogger);
    const { articles } = await service.fetchFeed('onefeed:cricket');

    // MAX_ARTICLES_PER_FEED mocked to 3; premium 2 and Media 3 filtered out
    expect(articles.map((a) => a.headline)).toEqual(['Story 7', 'Story 6', 'Story 5']);
  });

  test('malformed body (no feed array) is invalid; 4xx invalid; timeout network', async () => {
    const service = new SportsNewsService(quietLogger);

    axios.get.mockResolvedValueOnce({ data: { status: 'success' } });
    expect((await service.fetchFeed('onefeed:x')).status).toBe('invalid');

    const httpErr = new Error('bad'); httpErr.response = { status: 404 };
    axios.get.mockRejectedValueOnce(httpErr);
    expect(await service.fetchFeed('onefeed:x')).toEqual({ status: 'invalid', articles: [], error: 'HTTP 404' });

    axios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));
    expect((await service.fetchFeed('onefeed:x')).status).toBe('network');
  });

  test('empty feed is ok (whitelist is the gate for oneFeed keys)', async () => {
    axios.get.mockResolvedValueOnce({ data: { feed: [] } });
    const service = new SportsNewsService(quietLogger);
    expect(await service.fetchFeed('onefeed:quiet')).toEqual({ status: 'ok', articles: [] });
  });

  test('plain league slugs still use the site/v2 news endpoint', async () => {
    axios.get.mockResolvedValueOnce({ data: { articles: [article(1)] } });
    const service = new SportsNewsService(quietLogger);
    const result = await service.fetchFeed('racing/f1');

    expect(axios.get.mock.calls[0][0]).toBe(
      'https://site.api.espn.com/apis/site/v2/sports/racing/f1/news'
    );
    expect(result.status).toBe('ok');
    expect(result.articles).toHaveLength(1);
  });
});
