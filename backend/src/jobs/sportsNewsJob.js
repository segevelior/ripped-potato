const SportsNewsService = require('../services/SportsNewsService');
const User = require('../models/User');
const NewsArticle = require('../models/NewsArticle');
const { SPORT_FEEDS, legacySlugFeeds, getLeagueBySlug } = require('../config/sportsNews');

/**
 * Sports News Job
 *
 * Fetches every league feed any user follows (union across users, so a feed
 * is fetched once no matter how many users follow it), plus seasonally-active
 * global top-event feeds, into the newsarticles cache collection. Each feed
 * is isolated: one failing feed is recorded in stats and never aborts the
 * run, so partial data still lands and previously cached articles keep
 * serving through source outages.
 */

// Small pause between ESPN fetches — the feed list is user-driven now, so
// runs can be larger than the old fixed config.
const FEED_DELAY_MS = 200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  async collectFeeds(service) {
    // slug -> { label, isTopEvent }; global top feeds win so their label and
    // flag apply even when a user also follows the same league.
    const feeds = new Map();

    const users = await User.find(
      { 'settings.sportsNews.enabled': { $ne: false } },
      { 'settings.sportsNews': 1 }
    ).lean();

    for (const user of users) {
      const sportsNews = user.settings?.sportsNews || {};
      for (const follow of sportsNews.follows || []) {
        for (const slug of follow.feeds || []) {
          if (!feeds.has(slug)) {
            feeds.set(slug, {
              label: getLeagueBySlug(slug)?.name || follow.label,
              isTopEvent: false
            });
          }
        }
      }
      // Legacy pre-migration shape; removed in the cleanup PR.
      for (const sport of sportsNews.sports || []) {
        for (const slug of legacySlugFeeds(sport)) {
          if (!feeds.has(slug)) {
            feeds.set(slug, { label: getLeagueBySlug(slug)?.name || sport, isTopEvent: false });
          }
        }
      }
    }

    for (const feed of service.activeGlobalFeeds()) {
      feeds.set(feed.slug, { label: feed.label, isTopEvent: true });
    }

    return feeds;
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
    const feeds = await this.collectFeeds(service);

    let first = true;
    for (const [slug, { label, isTopEvent }] of feeds) {
      if (!first) await sleep(FEED_DELAY_MS);
      first = false;

      const { status, articles, error } = await service.fetchFeed(slug);
      if (status !== 'ok') {
        this.stats.feedsFailed++;
        this.stats.errors.push({ endpoint: slug, error });
        this.logger.error(`[SportsNewsJob] Feed failed: ${slug}`, { error });
        continue;
      }
      try {
        const upserted = await service.upsertArticles(articles, { feedSlug: slug, label, isTopEvent });
        this.stats.feedsProcessed++;
        this.stats.articlesUpserted += upserted;
      } catch (dbError) {
        this.stats.feedsFailed++;
        this.stats.errors.push({ endpoint: slug, error: dbError.message });
        this.logger.error(`[SportsNewsJob] Upsert failed: ${slug}`, { error: dbError.message });
      }
    }

    // Transition cleanup (removed with SPORT_FEEDS in the cleanup PR):
    // pre-v2 articles carry legacy sport slugs in `sports`; now that labels
    // are added, retire the slugs so card badges show "Formula 1", not
    // "motorsport". Separate pass because $addToSet and $pull can't touch
    // the same field in one update.
    try {
      const legacySlugs = Object.keys(SPORT_FEEDS);
      await NewsArticle.updateMany(
        { sports: { $in: legacySlugs } },
        { $pull: { sports: { $in: legacySlugs } } }
      );
    } catch (cleanupError) {
      this.logger.error('[SportsNewsJob] Legacy slug cleanup failed', { error: cleanupError.message });
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
