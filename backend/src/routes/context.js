const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const { invalidateTodaysPick } = require('../utils/invalidateTodaysPick');

// The coach's short-term working memory (dashboard check-ins + auto-generated
// conversation summaries). This collection is WRITTEN by the Python
// ai-coach-service (shortTermContext), not by this API, so we operate on the raw
// collection directly rather than via a Mongoose model. Users can delete entries
// here — it's the only way to make the coach drop a stale short-term note.

// GET /api/v1/context/recent
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

// DELETE /api/v1/context/:entryId - Remove one short-term context entry.
// Hard delete is fine: these are ephemeral 14-day notes and nothing dedups
// against them. Do NOT unset summarized_at on the source conversation — that
// would re-summarize it and resurrect the entry.
router.delete('/:entryId', auth, async (req, res) => {
  try {
    const { entryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid entry ID'
      });
    }

    // Compound filter is the user-scoping guard — never delete by _id alone
    const result = await mongoose.connection.db
      .collection('shortTermContext')
      .deleteOne({
        _id: new mongoose.Types.ObjectId(entryId),
        userId: new mongoose.Types.ObjectId(req.user.id)
      });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Context entry not found'
      });
    }

    // Summaries/check-ins can carry health info the day's cached pick was built on
    invalidateTodaysPick(req.user.id);

    res.json({
      success: true,
      message: 'Context entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting context entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete context entry',
      error: error.message
    });
  }
});

// DELETE /api/v1/context - Clear ALL of the user's short-term context
router.delete('/', auth, async (req, res) => {
  try {
    const result = await mongoose.connection.db
      .collection('shortTermContext')
      .deleteMany({ userId: new mongoose.Types.ObjectId(req.user.id) });

    invalidateTodaysPick(req.user.id);

    res.json({
      success: true,
      message: 'Recent context cleared successfully',
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    console.error('Error clearing context:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear recent context',
      error: error.message
    });
  }
});

module.exports = router;
