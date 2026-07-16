const axios = require('axios');
const NewsArticle = require('../models/NewsArticle');
const {
  GLOBAL_TOP_FEEDS,
  NEWS_TTL_DAYS,
  MAX_ARTICLES_PER_FEED
} = require('../config/sportsNews');

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

/**
 * Fetches sports news from ESPN's unofficial API and caches it in the
 * newsarticles collection. The API is undocumented, so parsing is defensive:
 * malformed articles are skipped, requests time out at 10s, and a failed
 * feed never throws past its caller's per-feed error isolation.
 */
class SportsNewsService {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Fetch one ESPN news feed and map it to NewsArticle-shaped objects.
   * Filters out items unusable as news cards: missing url/headline,
   * ESPN+ premium (paywalled), and video clips.
   * @param {string} endpoint - e.g. 'racing/f1/news'
   * @returns {Promise<Array>} mapped articles (possibly empty)
   */
  async fetchFeed(endpoint) {
    const response = await axios.get(`${ESPN_BASE_URL}/${endpoint}`, {
      timeout: 10000,
      params: { limit: MAX_ARTICLES_PER_FEED }
    });

    const articles = Array.isArray(response.data?.articles) ? response.data.articles : [];

    return articles
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
   * Upsert a feed's articles, deduping on articleUrl. A story seen in
   * several feeds accumulates all their sport slugs; refetching refreshes
   * expiresAt so the cache survives source outages.
   * @param {Array} articles - output of fetchFeed
   * @param {string|null} sportSlug - canonical slug, or null for global feeds
   * @param {boolean} isTopEvent - whether the feed is an active global top feed
   * @returns {Promise<number>} number of articles upserted
   */
  async upsertArticles(articles, sportSlug, isTopEvent) {
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
      if (sportSlug) {
        update.$addToSet = { sports: sportSlug };
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
