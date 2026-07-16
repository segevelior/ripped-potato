const mongoose = require('mongoose');

/**
 * Cached sports-news article fetched from an external feed (ESPN) by the
 * SportsNewsFetch job. The collection is the cache: refetching an article
 * refreshes `expiresAt`, so articles that stay in the source's feed outlive
 * outages, and articles that drop out expire via the TTL index.
 *
 * The same story can appear in multiple league feeds; it is deduped on
 * `articleUrl` and accumulates all matching sport slugs in `sports`.
 */
const newsArticleSchema = new mongoose.Schema({
  articleUrl: {
    type: String,
    required: true,
    unique: true
  },
  headline: {
    type: String,
    required: true
  },
  description: String,
  imageUrl: String,
  // Canonical sport slugs from config/sportsNews.js SPORT_FEEDS
  sports: {
    type: [String],
    default: []
  },
  // Seen in an active GLOBAL_TOP_FEED (e.g. World Cup) — shown to everyone.
  // Once true it is never un-flipped within the article's cache lifetime.
  isTopEvent: {
    type: Boolean,
    default: false
  },
  source: {
    type: String,
    default: 'ESPN'
  },
  publishedAt: Date,
  fetchedAt: Date,
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index: articles no longer refreshed by the job are removed automatically.
newsArticleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
newsArticleSchema.index({ sports: 1, publishedAt: -1 });
newsArticleSchema.index({ isTopEvent: 1, publishedAt: -1 });

module.exports = mongoose.model('NewsArticle', newsArticleSchema);
