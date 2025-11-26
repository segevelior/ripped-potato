const mongoose = require('mongoose');

const setLogSchema = new mongoose.Schema({
  setNumber: Number,
  targetReps: Number,
  actualReps: Number,
  weight: Number, // in kg
  time: Number, // in seconds (for timed exercises)
  distance: Number, // in meters
  rpe: {
    type: Number,
    min: 1,
    max: 10
  },
  restSeconds: Number,
  notes: String,
  isCompleted: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const exerciseLogSchema = new mongoose.Schema({
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  },
  exerciseName: {
    type: String,
    required: true
  },
  order: Number,
  sets: [setLogSchema],
  notes: String,
  // Performance metrics
  totalVolume: Number, // reps * weight
  maxWeight: Number,
  avgRpe: Number
}, { _id: false });

const workoutLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Link back to calendar event
  calendarEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CalendarEvent',
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit', 'flexibility', 'calisthenics', 'mobility'],
    required: true
  },
  // Timing
  startedAt: {
    type: Date,
    required: true
  },
  completedAt: Date,
  actualDuration: Number, // in minutes
  // Exercises performed
  exercises: [exerciseLogSchema],
  // Strain/intensity metrics
  totalStrain: {
    type: Number,
    default: 0
  },
  muscleStrain: {
    chest: { type: Number, default: 0 },
    back: { type: Number, default: 0 },
    shoulders: { type: Number, default: 0 },
    arms: { type: Number, default: 0 },
    legs: { type: Number, default: 0 },
    core: { type: Number, default: 0 }
  },
  // User feedback
  perceivedDifficulty: {
    type: String,
    enum: ['too_easy', 'easy', 'just_right', 'hard', 'too_hard']
  },
  mood: {
    type: String,
    enum: ['great', 'good', 'okay', 'tired', 'exhausted']
  },
  notes: String,
  // Plan reference
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingPlan'
  }
}, {
  timestamps: true
});

// Indexes
workoutLogSchema.index({ userId: 1, startedAt: -1 });
workoutLogSchema.index({ userId: 1, type: 1 });
workoutLogSchema.index({ calendarEventId: 1 });

// Calculate metrics before saving
workoutLogSchema.pre('save', function(next) {
  // Calculate total strain from muscle strain
  if (this.muscleStrain) {
    this.totalStrain = Object.values(this.muscleStrain).reduce((sum, strain) => sum + (strain || 0), 0);
  }

  // Calculate exercise-level metrics
  if (this.exercises) {
    this.exercises.forEach(ex => {
      if (ex.sets && ex.sets.length > 0) {
        const completedSets = ex.sets.filter(s => s.isCompleted);

        // Total volume
        ex.totalVolume = completedSets.reduce((sum, s) => {
          const reps = s.actualReps || s.targetReps || 0;
          const weight = s.weight || 0;
          return sum + (reps * weight);
        }, 0);

        // Max weight
        ex.maxWeight = Math.max(...completedSets.map(s => s.weight || 0), 0);

        // Average RPE
        const rpeSets = completedSets.filter(s => s.rpe);
        if (rpeSets.length > 0) {
          ex.avgRpe = rpeSets.reduce((sum, s) => sum + s.rpe, 0) / rpeSets.length;
        }
      }
    });
  }

  next();
});

// Virtual for completion percentage
workoutLogSchema.virtual('completionPercentage').get(function() {
  const totalSets = this.exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
  if (totalSets === 0) return 0;

  const completedSets = this.exercises.reduce((sum, ex) =>
    sum + (ex.sets?.filter(set => set.isCompleted).length || 0), 0
  );

  return Math.round((completedSets / totalSets) * 100);
});

// Static method to get user's workout history
workoutLogSchema.statics.getHistory = function(userId, options = {}) {
  const { days = 30, type, limit = 20 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let query = {
    userId,
    startedAt: { $gte: startDate }
  };

  if (type) {
    query.type = type;
  }

  return this.find(query)
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('calendarEventId', 'date title');
};

// Static method to get user stats
workoutLogSchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        startedAt: { $gte: startDate },
        completedAt: { $ne: null }
      }
    },
    {
      $group: {
        _id: null,
        totalWorkouts: { $sum: 1 },
        totalDuration: { $sum: '$actualDuration' },
        avgDuration: { $avg: '$actualDuration' },
        avgStrain: { $avg: '$totalStrain' },
        workoutTypes: { $push: '$type' }
      }
    }
  ]);

  return stats[0] || {
    totalWorkouts: 0,
    totalDuration: 0,
    avgDuration: 0,
    avgStrain: 0,
    workoutTypes: []
  };
};

module.exports = mongoose.model('WorkoutLog', workoutLogSchema);
