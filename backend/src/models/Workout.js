const mongoose = require('mongoose');

const setSchema = new mongoose.Schema({
  targetReps: Number,
  actualReps: Number,
  weight: Number, // in kg
  time: Number, // in seconds
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

const exerciseSetSchema = new mongoose.Schema({
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  exerciseName: String, // denormalized for performance
  order: {
    type: Number,
    required: true
  },
  sets: [setSchema],
  notes: String
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Workout title is required'],
    trim: true
  },
  date: {
    type: Date,
    required: [true, 'Workout date is required'],
    index: true
  },
  type: {
    type: String,
    enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit'],
    required: true
  },
  status: {
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'skipped'],
    default: 'planned',
    index: true
  },
  durationMinutes: Number,
  exercises: [exerciseSetSchema],
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
  notes: String,
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
workoutSchema.index({ userId: 1, date: -1 });
workoutSchema.index({ userId: 1, status: 1 });
workoutSchema.index({ planId: 1 });

// Calculate total strain before saving
workoutSchema.pre('save', function(next) {
  if (!this.isModified('muscleStrain')) return next();
  
  this.totalStrain = Object.values(this.muscleStrain).reduce((sum, strain) => sum + strain, 0);
  next();
});

// Virtual for completion percentage
workoutSchema.virtual('completionPercentage').get(function() {
  const totalSets = this.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  if (totalSets === 0) return 0;
  
  const completedSets = this.exercises.reduce((sum, ex) => 
    sum + ex.sets.filter(set => set.isCompleted).length, 0
  );
  
  return Math.round((completedSets / totalSets) * 100);
});

// Static method to get workouts for a date range
workoutSchema.statics.getByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

// Static method to get user's workout stats
workoutSchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalWorkouts: { $sum: 1 },
        totalDuration: { $sum: '$durationMinutes' },
        avgStrain: { $avg: '$totalStrain' },
        workoutTypes: { $push: '$type' }
      }
    }
  ]);
  
  return stats[0] || {
    totalWorkouts: 0,
    totalDuration: 0,
    avgStrain: 0,
    workoutTypes: []
  };
};

module.exports = mongoose.model('Workout', workoutSchema);