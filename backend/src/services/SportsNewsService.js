const axios = require('axios');
const NewsArticle = require('../models/NewsArticle');
const {
  GLOBAL_TOP_FEEDS,
  NEWS_TTL_DAYS,
  MAX_ARTICLES_PER_FEED
} = require('../config/sportsNews');

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';
// Sports ESPN covers but doesn't expose as site/v2 leagues (MotoGP, cricket,
// Olympics, boxing…) live behind the oneFeed content API that powers hub
// pages like espn.com/motogp/. Whitelist slugs use an 'onefeed:' prefix to
// select this fetcher; everything downstream treats slugs as opaque strings.
const ONEFEED_BASE_URL = 'https://onefeed.fan.api.espn.com/apis/v3/cached/contentEngine/oneFeed/leagues';
const ONEFEED_PREFIX = 'onefeed:';

/**
 * Fetches sports news from ESPN's unofficial API and caches it in the
 * newsarticles collection. The API is undocumented, so parsing is defensive:
 * malformed articles are skipped, requests time out at 10s, and fetchFeed
 * never throws — callers branch on its returned status.
 */
class SportsNewsService {
  constructor(logger = console) {
    this.logger = logger;
  }

  // Both ESPN APIs use the same article field names. Filters out items
  // unusable as news cards: missing url/headline, ESPN+ premium (paywalled),
  // and video clips.
  mapArticles(rawArticles) {
    return rawArticles
      .map((a) => ({
        articleUrl: a.links?.web?.href,
        headline: a.headline,
        description: a.description,
        imageUrl: a.images?.[0]?.url,
        publishedAt: a.published ? new Date(a.published) : undefined,
        type: a.type,
        premium: a.premium
      }))
      .filter((a) => {
        if (!a.articleUrl || !a.headline) return false;
        if (a.premium === true) return false;
        // Video clips make bad reading cards (autoplay pages, no article body)
        if (a.articleUrl.includes('/video/')) return false;
        if (a.type === 'Media' || a.type === 'Clip') return false;
        return true;
      })
      .map(({ type, premium, ...article }) => article);
  }

  /**
   * Fetch one ESPN news feed and map it to NewsArticle-shaped objects.
   *
   * Never throws. `status` distinguishes what a failure means:
   *  - 'ok'      — feed exists (200 + expected shape); may still be empty
   *                for an off-season league
   *  - 'invalid' — the slug is wrong (HTTP 4xx or unexpected shape): a fact
   *                about the slug, safe to cache
   *  - 'network' — timeout / connection error / 5xx: transient, must not be
   *                cached as a failure
   * @param {string} slug - bare league slug ('racing/f1') or oneFeed slug
   *   ('onefeed:motogp')
   * @returns {Promise<{status: string, articles: Array, error?: string}>}
   */
  async fetchFeed(slug) {
    if (slug.startsWith(ONEFEED_PREFIX)) {
      return this.fetchOneFeed(slug.slice(ONEFEED_PREFIX.length));
    }

    let response;
    try {
      response = await axios.get(`${ESPN_BASE_URL}/${slug}/news`, {
        timeout: 10000,
        params: { limit: MAX_ARTICLES_PER_FEED }
      });
    } catch (error) {
      const httpStatus = error.response?.status;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        return { status: 'invalid', articles: [], error: `HTTP ${httpStatus}` };
      }
      return { status: 'network', articles: [], error: error.message };
    }

    if (!Array.isArray(response.data?.articles)) {
      return { status: 'invalid', articles: [], error: 'malformed response (no articles array)' };
    }

    return { status: 'ok', articles: this.mapArticles(response.data.articles) };
  }

  /**
   * Fetch a oneFeed league (articles nested in feed[].data.now[]).
   *
   * Caveat: unknown league keys return 200 with an empty feed rather than a
   * 4xx, so 'ok' here does NOT prove the key exists — whitelist membership
   * (espnLeagues.json, validated at bootstrap time) is the real gate for
   * oneFeed slugs, and the resolver only ever fetches whitelisted candidates.
   */
  async fetchOneFeed(league) {
    let response;
    try {
      response = await axios.get(`${ONEFEED_BASE_URL}/${league}`, {
        timeout: 10000,
        // Feed entries can hold several articles each; over-fetch, then
        // sort/slice below.
        params: { limit: MAX_ARTICLES_PER_FEED * 3 },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    } catch (error) {
      const httpStatus = error.response?.status;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        return { status: 'invalid', articles: [], error: `HTTP ${httpStatus}` };
      }
      return { status: 'network', articles: [], error: error.message };
    }

    const feed = response.data?.feed;
    if (!Array.isArray(feed)) {
      return { status: 'invalid', articles: [], error: 'malformed response (no feed array)' };
    }

    const raw = [];
    for (const entry of feed) {
      const now = entry?.data?.now;
      if (Array.isArray(now)) raw.push(...now);
    }

    const seen = new Set();
    const articles = this.mapArticles(raw)
      .filter((a) => {
        if (seen.has(a.articleUrl)) return false;
        seen.add(a.articleUrl);
        return true;
      })
      .sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0))
      .slice(0, MAX_ARTICLES_PER_FEED);

    return { status: 'ok', articles };
  }

  /**
   * Upsert a feed's articles, deduping on articleUrl. A story seen in
   * several feeds accumulates all their league slugs (feeds) and display
   * labels (sports); refetching refreshes expiresAt so the cache survives
   * source outages.
   * @param {Array} articles - articles from fetchFeed
   * @param {Object} opts
   * @param {string} opts.feedSlug - bare league slug the articles came from
   * @param {string} opts.label - league display label for the card badge
   * @param {boolean} opts.isTopEvent - whether the feed is an active global top feed
   * @returns {Promise<number>} number of articles upserted
   */
  async upsertArticles(articles, { feedSlug, label, isTopEvent = false }) {
    if (articles.length === 0) return 0;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + NEWS_TTL_DAYS * 24 * 60 * 60 * 1000);

    const ops = articles.map((article) => {
      const update = {
        $set: {
          headline: article.headline,
          description: article.description,
          imageUrl: article.imageUrl,
          ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
          fetchedAt: now,
          expiresAt
        }
      };
      const addToSet = {
        ...(feedSlug ? { feeds: feedSlug } : {}),
        ...(label ? { sports: label } : {})
      };
      if (Object.keys(addToSet).length > 0) {
        update.$addToSet = addToSet;
      }
      if (isTopEvent) {
        // A top-feed sighting flips the flag and it stays flipped
        update.$set.isTopEvent = true;
      } else {
        // $setOnInsert (not $set) so a regular-feed sighting of the same
        // story never un-flips an earlier top-event flag
        update.$setOnInsert = { isTopEvent: false };
      }
      return {
        updateOne: {
          filter: { articleUrl: article.articleUrl },
          update,
          upsert: true
        }
      };
    });

    const result = await NewsArticle.bulkWrite(ops, { ordered: false });
    return (result.upsertedCount || 0) + (result.modifiedCount || 0);
  }

  /**
   * Global top-event feeds whose seasonal window contains `now`.
   */
  activeGlobalFeeds(now = new Date()) {
    return GLOBAL_TOP_FEEDS.filter((feed) => {
      const from = new Date(feed.from);
      const to = new Date(feed.to);
      return now >= from && now < to;
    });
  }
}

module.exports = SportsNewsService;
