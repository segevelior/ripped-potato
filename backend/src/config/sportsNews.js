/**
 * Sports News configuration
 *
 * Canonical sport slugs and the ESPN feed endpoints that back them.
 * Endpoints are relative to https://site.api.espn.com/apis/site/v2/sports/
 * (unofficial ESPN API — no key required, but undocumented and can change).
 *
 * Sports with an empty feed list (no reliable ESPN coverage) are still valid
 * user choices — they simply contribute no articles.
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

// Seasonal "everyone sees this" feeds. Entries outside their [from, to)
// window are skipped by the job, so stale config degrades to "no top
// stories" rather than wrong ones.
const GLOBAL_TOP_FEEDS = [
  {
    endpoint: 'soccer/fifa.world/news',
    label: 'World Cup',
    from: '2026-06-01',
    to: '2026-08-01'
  }
];

const NEWS_TTL_DAYS = 3;
const MAX_ARTICLES_PER_FEED = 10;

module.exports = {
  SPORT_FEEDS,
  GLOBAL_TOP_FEEDS,
  NEWS_TTL_DAYS,
  MAX_ARTICLES_PER_FEED
};
