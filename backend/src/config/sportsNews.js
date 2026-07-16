/**
 * Sports News configuration
 *
 * League feeds are identified by bare ESPN slugs (e.g. 'soccer/eng.1');
 * SportsNewsService appends '/news' when fetching. The full catalog of
 * followable leagues lives in espnLeagues.json (bootstrapped by
 * scripts/bootstrap-espn-leagues.js and committed; the resolve flow's live
 * fetch is the final validity gate, so staleness costs a retry, not a bug).
 */

const ESPN_LEAGUES = require('./espnLeagues.json');

const leagueBySlug = new Map(ESPN_LEAGUES.map((league) => [league.slug, league]));

const getLeagueBySlug = (slug) => leagueBySlug.get(slug) || null;
const isWhitelistedSlug = (slug) => leagueBySlug.has(slug);

// Starter chips shown in Settings before/alongside the user's own follows.
// Each must resolve instantly via the seeded resolution cache or the LLM.
const DEFAULT_SUGGESTIONS = [
  'Premier League',
  'NBA',
  'NFL',
  'Champions League',
  'Formula 1',
  'UFC',
  'Tennis',
  'Golf'
];

/**
 * LEGACY (pre-v2): canonical sport slugs → feed endpoints with '/news'
 * suffixes. Still consulted for users not yet migrated to
 * settings.sportsNews.follows; removed in the cleanup PR along with
 * legacySlugFeeds().
 */
const SPORT_FEEDS = {
  soccer: ['soccer/eng.1/news', 'soccer/uefa.champions/news'],
  basketball: ['basketball/nba/news'],
  football: ['football/nfl/news'], // American football
  baseball: ['baseball/mlb/news'],
  hockey: ['hockey/nhl/news'],
  tennis: ['tennis/atp/news', 'tennis/wta/news'],
  golf: ['golf/pga/news'],
  motorsport: ['racing/f1/news'],
  mma: ['mma/ufc/news'],
  cycling: [],
  running: []
};

// Legacy sport slug → bare league slugs (strips the '/news' suffix).
const legacySlugFeeds = (sport) =>
  (SPORT_FEEDS[sport] || []).map((endpoint) => endpoint.replace(/\/news$/, ''));

// Seasonal "everyone sees this" feeds (bare league slugs). Entries outside
// their [from, to) window are skipped by the job, so stale config degrades
// to "no top stories" rather than wrong ones.
const GLOBAL_TOP_FEEDS = [
  {
    slug: 'soccer/fifa.world',
    label: 'World Cup',
    from: '2026-06-01',
    to: '2026-08-01'
  }
];

const NEWS_TTL_DAYS = 3;
const MAX_ARTICLES_PER_FEED = 10;

module.exports = {
  ESPN_LEAGUES,
  getLeagueBySlug,
  isWhitelistedSlug,
  DEFAULT_SUGGESTIONS,
  SPORT_FEEDS,
  legacySlugFeeds,
  GLOBAL_TOP_FEEDS,
  NEWS_TTL_DAYS,
  MAX_ARTICLES_PER_FEED
};
