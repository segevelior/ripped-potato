const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');

// GET /api/v1/context/recent - Read-only view of the coach's short-term working
// memory (dashboard check-ins + auto-generated conversation summaries). This
// collection is WRITTEN by the Python ai-coach-service (shortTermContext), not by
// this API, so we read the raw collection directly rather than via a Mongoose model.
router.get('/recent', auth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Filter out entries whose TTL has passed but that Mongo's TTL sweeper (which
    // lags, running ~once a minute) hasn't reaped yet — otherwise expired notes
    // could still render to the user.
    const entries = await mongoose.connection.db
      .collection('shortTermContext')
      .find({ userId, expiresAt: { $gt: new Date() } })
      .project({ content: 1, kind: 1, createdAt: 1, meta: 1, expiresAt: 1 })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    res.json({
      success: true,
      data: {
        entries,
        count: entries.length
      }
    });
  } catch (error) {
    console.error('Error fetching recent context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent context',
      error: error.message
    });
  }
});

module.exports = router;
