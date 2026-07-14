/**
 * Invalidate the user's cached "Today's Pick" daily recommendation.
 *
 * The pick is generated once per local day (Python ai-coach-service,
 * dailyRecommendations collection) and its reasoning bakes in the health
 * context available at generation time. When that context changes — a health
 * memory is deleted, profile injuries are edited, short-term context is
 * cleared — the cached pick can keep citing stale injuries for the rest of
 * the day, so we delete it and let the next dashboard load regenerate it.
 *
 * Fire-and-forget: callers must never fail their own request because of this.
 */

const mongoose = require('mongoose');
const User = require('../models/User');

function localDateString(timeZone) {
  try {
    // en-CA formats as YYYY-MM-DD, matching dailyRecommendations.localDate
    return new Date().toLocaleDateString('en-CA', { timeZone });
  } catch (e) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
  }
}

function invalidateTodaysPick(userId) {
  (async () => {
    const user = await User.findById(userId).select('settings.timezone').lean();
    const timezone = user?.settings?.timezone || 'UTC';
    // $in with the UTC date too — covers the timezone-edge ambiguity cheaply
    const dates = [...new Set([localDateString(timezone), localDateString('UTC')])];
    const result = await mongoose.connection.db
      .collection('dailyRecommendations')
      .deleteMany({
        userId: new mongoose.Types.ObjectId(userId),
        localDate: { $in: dates }
      });
    if (result.deletedCount > 0) {
      console.log(`Invalidated today's pick for user ${userId} (${dates.join(', ')})`);
    }
  })().catch(err => console.error('Failed to invalidate today\'s pick:', err));
}

module.exports = { invalidateTodaysPick };
