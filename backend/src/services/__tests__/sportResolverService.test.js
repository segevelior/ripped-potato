const axios = require('axios');

jest.mock('axios');

jest.mock('../../config/sportsNews', () => {
  const WHITELIST = [
    { slug: 'racing/f1', sport: 'racing', name: 'Formula 1', aliases: ['F1'] },
    { slug: 'racing/irl', sport: 'racing', name: 'IndyCar Series', aliases: [] },
    { slug: 'soccer/eng.1', sport: 'soccer', name: 'Premier League', aliases: ['EPL'] },
    { slug: 'soccer/esp.1', sport: 'soccer', name: 'LALIGA', aliases: [] },
    { slug: 'mma/ufc', sport: 'mma', name: 'UFC', aliases: [] },
    { slug: 'golf/pga', sport: 'golf', name: 'PGA Tour', aliases: [] }
  ];
  return {
    ESPN_LEAGUES: WHITELIST,
    isWhitelistedSlug: (slug) => WHITELIST.some((l) => l.slug === slug),
    getLeagueBySlug: (slug) => WHITELIST.find((l) => l.slug === slug) || null,
    legacySlugFeeds: () => [],
    DEFAULT_SUGGESTIONS: [],
    SPORT_FEEDS: {},
    GLOBAL_TOP_FEEDS: [],
    NEWS_TTL_DAYS: 3,
    MAX_ARTICLES_PER_FEED: 10
  };
});

jest.mock('../../models/SportResolution', () => ({
  findOneAndUpdate: jest.fn()
}));

const SportResolution = require('../../models/SportResolution');
const SportResolverService = require('../SportResolverService');
const { ResolutionError, MAX_ATTEMPTS, DEADLINE_MS } = require('../SportResolverService');

const AUTH = 'Bearer test-token';
const quietLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const llmReply = (payload) => Promise.resolve({ data: { unmatched: false, rejected: [], ...payload } });

function makeResolver() {
  const resolver = new SportResolverService(quietLogger);
  resolver.sportsNews.fetchFeed = jest.fn();
  resolver.sportsNews.upsertArticles = jest.fn().mockResolvedValue(1);
  return resolver;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: cache miss on lookup, silent success on save.
  SportResolution.findOneAndUpdate.mockResolvedValue(null);
});

describe('SportResolverService.resolve', () => {
  test('resolves on first attempt, upserts articles, caches success', async () => {
    const resolver = makeResolver();
    axios.post.mockReturnValueOnce(llmReply({ label: 'Motorsport', candidates: ['racing/f1'] }));
    resolver.sportsNews.fetchFeed.mockResolvedValueOnce({
      status: 'ok',
      articles: [{ articleUrl: 'https://espn.com/a', headline: 'A' }]
    });

    const result = await resolver.resolve('motorsport', AUTH);

    expect(result).toEqual({ label: 'Motorsport', feeds: ['racing/f1'], cached: false });
    expect(resolver.sportsNews.upsertArticles).toHaveBeenCalledWith(
      [{ articleUrl: 'https://espn.com/a', headline: 'A' }],
      { feedSlug: 'racing/f1', label: 'Formula 1' }
    );
    // Second findOneAndUpdate call is the success save.
    const saveCall = SportResolution.findOneAndUpdate.mock.calls[1];
    expect(saveCall[0]).toEqual({ normalizedQuery: 'motorsport' });
    expect(saveCall[1].$set).toMatchObject({ resolved: true, label: 'Motorsport', feeds: ['racing/f1'], expiresAt: null });
    expect(saveCall[2]).toEqual({ upsert: true });
    // The whitelist and auth header went to ai-coach.
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toContain('/api/v1/news/league-map');
    expect(body.whitelist).toHaveLength(6);
    expect(body.whitelist[0]).toEqual({ slug: 'racing/f1', name: 'Formula 1', aliases: ['F1'] });
    expect(opts.headers.Authorization).toBe(AUTH);
  });

  test('a live-but-empty feed (off-season league) still counts as valid', async () => {
    const resolver = makeResolver();
    axios.post.mockReturnValueOnce(llmReply({ label: 'PGA', candidates: ['golf/pga'] }));
    resolver.sportsNews.fetchFeed.mockResolvedValueOnce({ status: 'ok', articles: [] });

    const result = await resolver.resolve('golf tour', AUTH);

    expect(result.feeds).toEqual(['golf/pga']);
    expect(resolver.sportsNews.upsertArticles).not.toHaveBeenCalled();
  });

  test('returns cached success without calling ai-coach', async () => {
    const resolver = makeResolver();
    SportResolution.findOneAndUpdate.mockResolvedValueOnce({
      resolved: true,
      label: 'Formula 1',
      feeds: ['racing/f1']
    });

    const result = await resolver.resolve('F1', AUTH);

    expect(result).toEqual({ label: 'Formula 1', feeds: ['racing/f1'], cached: true });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('a cached unexpired failure throws immediately with no LLM spend', async () => {
    const resolver = makeResolver();
    SportResolution.findOneAndUpdate.mockResolvedValueOnce({
      resolved: false,
      attempts: 3,
      expiresAt: new Date(Date.now() + 60000)
    });

    await expect(resolver.resolve('chess', AUTH)).rejects.toMatchObject({
      name: 'ResolutionError',
      httpStatus: 422,
      attempts: 3
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('an expired cached failure is treated as a miss (TTL sweep is lazy)', async () => {
    const resolver = makeResolver();
    SportResolution.findOneAndUpdate.mockResolvedValueOnce({
      resolved: false,
      expiresAt: new Date(Date.now() - 60000)
    });
    axios.post.mockReturnValueOnce(llmReply({ label: 'UFC', candidates: ['mma/ufc'] }));
    resolver.sportsNews.fetchFeed.mockResolvedValueOnce({ status: 'ok', articles: [] });

    const result = await resolver.resolve('ufc', AUTH);
    expect(result.feeds).toEqual(['mma/ufc']);
  });

  test('dead feeds are fed back to the LLM and the retry succeeds', async () => {
    const resolver = makeResolver();
    axios.post
      .mockReturnValueOnce(llmReply({ label: 'Motorsport', candidates: ['racing/f1'] }))
      .mockReturnValueOnce(llmReply({ label: 'Motorsport', candidates: ['racing/irl'] }));
    resolver.sportsNews.fetchFeed
      .mockResolvedValueOnce({ status: 'invalid', articles: [], error: 'HTTP 404' })
      .mockResolvedValueOnce({ status: 'ok', articles: [] });

    const result = await resolver.resolve('motorsport', AUTH);

    expect(result.feeds).toEqual(['racing/irl']);
    const secondBody = axios.post.mock.calls[1][1];
    expect(secondBody.tried_and_failed).toEqual([{ slug: 'racing/f1', error: 'HTTP 404' }]);
  });

  test('LLM unmatched caches the failure with a TTL and throws 422', async () => {
    const resolver = makeResolver();
    axios.post.mockReturnValueOnce(llmReply({ unmatched: true, reason: 'no coverage' }));

    await expect(resolver.resolve('competitive chess', AUTH)).rejects.toMatchObject({
      code: 'RESOLUTION_FAILED',
      httpStatus: 422
    });

    const saveCall = SportResolution.findOneAndUpdate.mock.calls[1];
    expect(saveCall[1].$set.resolved).toBe(false);
    expect(saveCall[1].$set.expiresAt).toBeInstanceOf(Date);
    expect(saveCall[1].$set.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('exhausting MAX_ATTEMPTS on dead feeds caches the failure', async () => {
    const resolver = makeResolver();
    const slugs = ['racing/f1', 'racing/irl', 'soccer/eng.1', 'soccer/esp.1', 'mma/ufc'];
    slugs.forEach((slug) => {
      axios.post.mockReturnValueOnce(llmReply({ label: 'X', candidates: [slug] }));
    });
    resolver.sportsNews.fetchFeed.mockResolvedValue({ status: 'invalid', articles: [], error: 'HTTP 404' });

    await expect(resolver.resolve('mystery sport', AUTH)).rejects.toMatchObject({
      code: 'RESOLUTION_FAILED',
      attempts: MAX_ATTEMPTS
    });

    expect(axios.post).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const saveCall = SportResolution.findOneAndUpdate.mock.calls[1];
    expect(saveCall[1].$set.resolved).toBe(false);
    expect(saveCall[1].$set.expiresAt).toBeInstanceOf(Date);
  });

  test('ESPN network trouble is NOT cached and bails after 2 network attempts', async () => {
    const resolver = makeResolver();
    axios.post
      .mockReturnValueOnce(llmReply({ label: 'F1', candidates: ['racing/f1'] }))
      .mockReturnValueOnce(llmReply({ label: 'F1', candidates: ['racing/irl'] }));
    resolver.sportsNews.fetchFeed.mockResolvedValue({ status: 'network', articles: [], error: 'timeout' });

    await expect(resolver.resolve('formula one', AUTH)).rejects.toMatchObject({
      code: 'RESOLUTION_FAILED'
    });

    expect(axios.post).toHaveBeenCalledTimes(2);
    // Only the initial cache lookup — no failure doc written.
    expect(SportResolution.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('ai-coach unreachable throws 502 AI_SERVICE_UNAVAILABLE without caching', async () => {
    const resolver = makeResolver();
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(resolver.resolve('motorsport', AUTH)).rejects.toMatchObject({
      code: 'AI_SERVICE_UNAVAILABLE',
      httpStatus: 502
    });

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(SportResolution.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  test('deadline abort throws without caching', async () => {
    const resolver = makeResolver();
    const start = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(start);
    axios.post.mockImplementation(() => {
      // The LLM call "takes" longer than the whole deadline.
      nowSpy.mockReturnValue(start + DEADLINE_MS + 1000);
      return llmReply({ label: 'F1', candidates: ['racing/f1'] });
    });
    resolver.sportsNews.fetchFeed.mockResolvedValue({ status: 'ok', articles: [] });

    try {
      await expect(resolver.resolve('formula one', AUTH)).rejects.toMatchObject({
        code: 'RESOLUTION_FAILED'
      });
      // Candidate validation never ran (deadline checked before each fetch),
      // and the abort was not cached as a failure.
      expect(resolver.sportsNews.fetchFeed).not.toHaveBeenCalled();
      expect(SportResolution.findOneAndUpdate).toHaveBeenCalledTimes(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('a lost save race (E11000) does not fail the request', async () => {
    const resolver = makeResolver();
    axios.post.mockReturnValueOnce(llmReply({ label: 'UFC', candidates: ['mma/ufc'] }));
    resolver.sportsNews.fetchFeed.mockResolvedValueOnce({ status: 'ok', articles: [] });
    const dup = new Error('E11000 duplicate key');
    dup.code = 11000;
    SportResolution.findOneAndUpdate
      .mockResolvedValueOnce(null) // cache lookup
      .mockRejectedValueOnce(dup); // concurrent resolve won the upsert

    const result = await resolver.resolve('ufc', AUTH);
    expect(result.feeds).toEqual(['mma/ufc']);
  });

  test('hallucinated slugs with no feedback to give are treated as unmatched', async () => {
    const resolver = makeResolver();
    axios.post.mockReturnValueOnce(llmReply({ label: 'X', candidates: ['fake/league'] }));

    await expect(resolver.resolve('imaginary sport', AUTH)).rejects.toMatchObject({
      code: 'RESOLUTION_FAILED'
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(resolver.sportsNews.fetchFeed).not.toHaveBeenCalled();
    // Cached: a hallucination the whitelist rejects is a fact about the query.
    const saveCall = SportResolution.findOneAndUpdate.mock.calls[1];
    expect(saveCall[1].$set.resolved).toBe(false);
  });

  test('empty query throws 400 before any work', async () => {
    const resolver = makeResolver();
    await expect(resolver.resolve('   ', AUTH)).rejects.toMatchObject({
      code: 'INVALID_QUERY',
      httpStatus: 400
    });
    expect(SportResolution.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
