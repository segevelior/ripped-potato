const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Event date is required']
    // Note: indexed via compound index with userId below
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['session', 'rest', 'deload', 'event', 'milestone'],
    default: 'session'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  // For session events - reference to template
  sessionTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionTemplate'
  },
  // Display metadata for the event. Scheduled events must NOT embed
  // exercises — the linked sessionTemplateId is the source of truth
  // (see templateMaterializer / migrate-calendar-embedded-exercises).
  // The exercises path stays in the schema for two reasons: completed
  // events store ACTUAL performed sets here (session-log flow), and
  // legacy unmigrated events still hydrate their embedded copy.
  // NOTE: ai-coach-service (Python) writes this collection too — keep
  // its event shape (calendar_service.py, schedule_plan_skill.py) in sync.
  sessionDetails: {
    discipline: {
      type: String
      // No enum restriction - allow any discipline
    },
    estimatedDuration: Number, // in minutes
    durationMinutes: Number, // actual duration after completion
    exercises: [{
      exerciseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exercise'
      },
      exerciseName: String,
      targetSets: Number,
      targetReps: Number,
      targetWeight: Number,
      notes: String,
      // Actual session data (populated after completion)
      sets: [{
        weight: Number,
        actualReps: Number,
        targetReps: Number,
        isCompleted: Boolean
      }]
    }],
    // 'strava' = mirror event created for an unmatched external activity;
    // 'strava-matched' = pre-existing planned event a Strava activity was
    // merged into. The distinction drives unlink-vs-delete on activity
    // deletion (see activityMatchingService.unlinkOrDeleteStravaEvent).
    source: String,
    stravaData: {
      sportType: String,
      distance: Number,
      elevationGain: Number,
      avgHeartRate: Number,
      calories: Number,
      stravaUrl: String
    }
  },
  completedAt: Date,
  // Link to session log after completion (from TrainNow)
  sessionLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionLog'
  },
  // Link to external activity (from Strava, etc.)
  externalActivityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExternalActivity'
  },
  // For plan-based events
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planWeek: Number,
  planDay: Number,
  // General fields
  notes: String,
  color: String, // For UI customization
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    interval: Number, // Every X days/weeks/months
    endDate: Date
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
calendarEventSchema.index({ userId: 1, date: 1 });
calendarEventSchema.index({ userId: 1, date: 1, status: 1 });
calendarEventSchema.index({ userId: 1, planId: 1 });
calendarEventSchema.index({ userId: 1, externalActivityId: 1 }); // For Strava sync

// Static method to get events for a date range
calendarEventSchema.statics.getByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    },
    status: { $ne: 'cancelled' }
  })
  .sort({ date: 1 })
  // blocks included: events don't embed exercises, so range consumers
  // (calendar page, detail modal, MCP list) read them off the template.
  // isCommon included so session launches know a permanent swap will clone.
  .populate('sessionTemplateId', 'name goal primary_disciplines estimated_duration blocks isCommon');
};

// Static method to get today's events
calendarEventSchema.statics.getToday = function(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    userId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $ne: 'cancelled' }
  }).populate('sessionTemplateId', 'name goal primary_disciplines estimated_duration blocks isCommon');
};

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
