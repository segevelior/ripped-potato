const express = require('express');
const NewsArticle = require('../models/NewsArticle');
const { SPORT_FEEDS } = require('../config/sportsNews');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/v1/news - Sports news feed for the authenticated user:
// seasonal top-event stories (shown to everyone) interleaved with articles
// matching the sports the user follows (settings.sportsNews.sports).
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);

    const sportsNews = req.user.settings?.sportsNews || {};
    if (sportsNews.enabled === false) {
      return res.json({ success: true, data: { enabled: false, articles: [] } });
    }

    const followedSports = Array.isArray(sportsNews.sports) ? sportsNews.sports : [];

    // Two queries instead of one isTopEvent-first sort: the swipe stack is
    // strictly sequential, so uncapped top events (up to a whole feed's
    // worth) would bury the user's own sports behind them.
    const TOP_EVENT_CAP = 4;
    const topEvents = await NewsArticle.find({ isTopEvent: true })
      .sort({ publishedAt: -1 })
      .limit(TOP_EVENT_CAP)
      .lean();

    let personal = [];
    if (followedSports.length > 0) {
      personal = await NewsArticle.find({
        _id: { $nin: topEvents.map((a) => a._id) },
        sports: { $in: followedSports }
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

    // Only feed-backed sports count: a user following only sports with no
    // configured feed should get the "pick sports" nudge, not silence.
    const followsSports = followedSports.some((s) => (SPORT_FEEDS[s] || []).length > 0);
    res.json({
      success: true,
      data: { enabled: true, followsSports, articles }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
