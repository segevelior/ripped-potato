const mongoose = require('mongoose');

/**
 * Audit trail for Strava-activity ↔ planned-event matching decisions.
 *
 * Every automatic classification AND every manual correction is recorded, so
 * matcher quality is measurable: a user_unmerge/coach_unmerge following an
 * auto_merge on the same activity means the matcher got it wrong; the auto_*
 * rows are the denominator. Rows expire after ~180 days.
 */
const activityMatchAuditSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  activityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExternalActivity',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CalendarEvent'
  },
  action: {
    type: String,
    enum: [
      'auto_merge', 'auto_pending', 'auto_unmatched',
      'user_merge', 'user_unmerge', 'user_event_delete',
      'coach_merge', 'coach_separate', 'coach_unmerge', 'coach_event_delete'
    ],
    required: true
  },
  actor: {
    type: String,
    enum: ['system', 'user', 'coach'],
    required: true
  },
  // Activity match state before this action
  previous: {
    matchStatus: String,
    matchedEventId: mongoose.Schema.Types.ObjectId
  },
  // Classifier inputs/outputs at decision time
  context: {
    candidateIds: [mongoose.Schema.Types.ObjectId],
    discipline: String,
    localDay: String,
    decision: String
  },
  expiresAt: Date
}, {
  timestamps: true
});

activityMatchAuditSchema.index({ userId: 1, createdAt: -1 });
activityMatchAuditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ActivityMatchAudit', activityMatchAuditSchema);
