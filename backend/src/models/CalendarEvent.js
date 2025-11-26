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
    enum: ['workout', 'rest', 'deload', 'event', 'milestone'],
    default: 'workout'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  // For workout events - reference to template
  workoutTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PredefinedWorkout'
  },
  // Workout details (can be from template or custom)
  workoutDetails: {
    type: {
      type: String,
      enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit', 'flexibility', 'calisthenics', 'mobility']
    },
    estimatedDuration: Number, // in minutes
    exercises: [{
      exerciseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exercise'
      },
      exerciseName: String,
      targetSets: Number,
      targetReps: Number,
      targetWeight: Number,
      notes: String
    }]
  },
  // Link to workout log after completion
  workoutLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkoutLog'
  },
  // For plan-based events
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingPlan'
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
  .populate('workoutTemplateId', 'name goal primary_disciplines estimated_duration');
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
  }).populate('workoutTemplateId', 'name goal primary_disciplines estimated_duration blocks');
};

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
