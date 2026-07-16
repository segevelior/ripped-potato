const SportsNewsService = require('../services/SportsNewsService');
const { SPORT_FEEDS } = require('../config/sportsNews');

/**
 * Sports News Job
 *
 * Fetches every configured ESPN news feed (per-sport feeds plus any
 * seasonally-active global top-event feeds) into the newsarticles cache
 * collection. Each feed is isolated: one failing feed is recorded in stats
 * and never aborts the run, so partial data still lands and previously
 * cached articles keep serving through source outages.
 */

class SportsNewsJob {
  constructor(logger = console) {
    this.logger = logger;
    this.stats = {
      feedsProcessed: 0,
      feedsFailed: 0,
      articlesUpserted: 0,
      errors: []
    };
  }

  async run() {
    this.logger.info('[SportsNewsJob] Starting news fetch...');
    const startTime = Date.now();

    this.stats = {
      feedsProcessed: 0,
      feedsFailed: 0,
      articlesUpserted: 0,
      errors: []
    };

    const service = new SportsNewsService(this.logger);

    const feeds = [];
    for (const [sportSlug, endpoints] of Object.entries(SPORT_FEEDS)) {
      for (const endpoint of endpoints) {
        feeds.push({ endpoint, sportSlug, isTopEvent: false });
      }
    }
    for (const feed of service.activeGlobalFeeds()) {
      feeds.push({ endpoint: feed.endpoint, sportSlug: null, isTopEvent: true });
    }

    for (const { endpoint, sportSlug, isTopEvent } of feeds) {
      try {
        const articles = await service.fetchFeed(endpoint);
        const upserted = await service.upsertArticles(articles, sportSlug, isTopEvent);
        this.stats.feedsProcessed++;
        this.stats.articlesUpserted += upserted;
      } catch (error) {
        this.stats.feedsFailed++;
        this.stats.errors.push({ endpoint, error: error.message });
        this.logger.error(`[SportsNewsJob] Feed failed: ${endpoint}`, { error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    this.logger.info('[SportsNewsJob] News fetch completed', {
      duration: `${duration}ms`,
      stats: this.stats
    });

    return {
      success: true,
      duration,
      stats: this.stats
    };
  }
}

module.exports = SportsNewsJob;
