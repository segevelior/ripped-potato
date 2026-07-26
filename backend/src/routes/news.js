const express = require('express');
const NewsArticle = require('../models/NewsArticle');
const SportResolution = require('../models/SportResolution');
const User = require('../models/User');
const SportResolverService = require('../services/SportResolverService');
const { ResolutionError } = require('../services/SportResolverService');
const { legacySlugFeeds, DEFAULT_SUGGESTIONS, GLOBAL_TOP_FEEDS } = require('../config/sportsNews');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Resolving costs an LLM call + up to ~20 ESPN fetches, so budget it tighter
// than general AI chat. Keyed per user; mounted after auth on the one route
// that needs it (req.user isn't set router-wide).
const resolveRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sport lookups, please try again later.',
  keyGenerator: (req) => req.user?.id || req.ip
});

const resolver = new SportResolverService();

// Feeds the user follows: v2 follows entries, plus legacy sport slugs for
// users the migration hasn't converted yet (removed in the cleanup PR).
const followedFeeds = (sportsNews) => {
  const fromFollows = (sportsNews.follows || []).flatMap((f) => f.feeds || []);
  const fromLegacy = (Array.isArray(sportsNews.sports) ? sportsNews.sports : [])
    .flatMap(legacySlugFeeds);
  return [...new Set([...fromFollows, ...fromLegacy])];
};

const TOP_EVENT_CAP = 2;
const TOP_EVENT_POOL = 12;

const globalTopSlugs = new Set(GLOBAL_TOP_FEEDS.map((f) => f.slug));

// One article per global top feed, newest first, capped. Articles keep their
// isTopEvent flag for NEWS_TTL_DAYS after a feed leaves GLOBAL_TOP_FEEDS, so
// fall back to the article's first feed slug as the group key.
const pickTopEvents = (articles, cap) => {
  const seenGroups = new Set();
  const picked = [];
  for (const article of articles) {
    if (picked.length >= cap) break;
    const feeds = article.feeds || [];
    const group = feeds.find((slug) => globalTopSlugs.has(slug)) || feeds[0] || 'unknown';
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    picked.push(article);
  }
  return picked;
};

// GET /api/v1/news - Sports news feed for the authenticated user:
// seasonal top-event stories (shown to everyone) interleaved with articles
// from the league feeds the user follows.
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);

    const sportsNews = req.user.settings?.sportsNews || {};
    if (sportsNews.enabled === false) {
      return res.json({ success: true, data: { enabled: false, articles: [] } });
    }

    const userFeeds = followedFeeds(sportsNews);

    // Two queries instead of one isTopEvent-first sort: the swipe stack is
    // strictly sequential, so uncapped top events (up to a whole feed's
    // worth) would bury the user's own sports behind them. Top events are
    // further deduped to one article per global feed (see pickTopEvents),
    // so a single event like the World Cup can't flood the stack.
    const topEventPool = await NewsArticle.find({ isTopEvent: true })
      .sort({ publishedAt: -1 })
      .limit(TOP_EVENT_POOL)
      .lean();
    const topEvents = pickTopEvents(topEventPool, TOP_EVENT_CAP);

    let personal = [];
    if (userFeeds.length > 0) {
      personal = await NewsArticle.find({
        _id: { $nin: topEvents.map((a) => a._id) },
        feeds: { $in: userFeeds }
      })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .lean();
    }

    // Interleave 1 top : 2 personal, remainder appended
    const merged = [];
    let t = 0;
    let p = 0;
    while (merged.length < limit && (t < topEvents.length || p < personal.length)) {
      if (t < topEvents.length) merged.push(topEvents[t++]);
      for (let i = 0; i < 2 && merged.length < limit && p < personal.length; i++) {
        merged.push(personal[p++]);
      }
    }

    const articles = merged.map((a) => ({
      id: a._id,
      headline: a.headline,
      description: a.description,
      imageUrl: a.imageUrl,
      articleUrl: a.articleUrl,
      sports: a.sports,
      isTopEvent: a.isTopEvent,
      source: a.source,
      publishedAt: a.publishedAt
    }));

    res.json({
      success: true,
      data: { enabled: true, followsSports: userFeeds.length > 0, articles }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v1/news/follows - resolve free text ("MotoGP") to validated ESPN
// league feeds and follow them. This is the ONLY writer of
// settings.sportsNews.follows: feeds are LLM-proposed (ai-coach) and
// live-validated here, never accepted from the client.
router.post('/follows', auth, resolveRateLimit, async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      return res.status(400).json({ success: false, message: 'query is required' });
    }
    if (query.length > 100) {
      return res.status(400).json({ success: false, message: 'query too long (max 100 chars)' });
    }

    const { label, feeds, cached } = await resolver.resolve(query, req.headers.authorization);

    const currentFollows = req.user.settings?.sportsNews?.follows || [];

    // Already covered: keep the entry the user knows (its label is the
    // DELETE key), just report it back.
    const superset = currentFollows.find((f) => feeds.every((slug) => (f.feeds || []).includes(slug)));
    if (superset) {
      return res.json({
        success: true,
        data: { follow: { label: superset.label, feeds: superset.feeds }, cached, follows: currentFollows }
      });
    }

    // Guarded push: never create a second entry with the same label
    // (labels key DELETE), even under concurrent requests.
    const pushResult = await User.updateOne(
      { _id: req.user._id, 'settings.sportsNews.follows.label': { $ne: label } },
      { $push: { 'settings.sportsNews.follows': { label, feeds } } }
    );

    const fresh = await User.findById(req.user._id).select('settings.sportsNews.follows').lean();
    const follows = fresh?.settings?.sportsNews?.follows || [];

    if (pushResult.modifiedCount === 0) {
      // Label already taken with a different feed set — return the existing
      // entry as the outcome instead of a confusing empty success.
      const existing = follows.find((f) => f.label === label);
      return res.json({
        success: true,
        data: { follow: existing || { label, feeds }, cached, follows }
      });
    }

    res.json({ success: true, data: { follow: { label, feeds }, cached, follows } });
  } catch (error) {
    if (error instanceof ResolutionError) {
      return res.status(error.httpStatus).json({
        success: false,
        code: error.code,
        message: error.message,
        attempts: error.attempts
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/v1/news/follows - unfollow by label
router.delete('/follows', auth, async (req, res) => {
  try {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!label) {
      return res.status(400).json({ success: false, message: 'label is required' });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { 'settings.sportsNews.follows': { label } } },
      { new: true }
    ).select('settings.sportsNews.follows').lean();

    res.json({
      success: true,
      data: { follows: updated?.settings?.sportsNews?.follows || [] }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v1/news/suggestions - starter chips for the Settings add flow.
// Defaults plus migration-seeded resolutions only — user-typed queries from
// the shared LLM cache are never promoted to other users' suggestions.
router.get('/suggestions', auth, async (req, res) => {
  try {
    const seedLabels = await SportResolution.distinct('label', { source: 'seed', resolved: true });
    const followedLabels = new Set(
      (req.user.settings?.sportsNews?.follows || []).map((f) => (f.label || '').toLowerCase())
    );

    const suggestions = [...new Set([...DEFAULT_SUGGESTIONS, ...seedLabels])]
      .filter((label) => label && !followedLabels.has(label.toLowerCase()))
      .slice(0, 12);

    res.json({ success: true, data: { suggestions } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.pickTopEvents = pickTopEvents;
