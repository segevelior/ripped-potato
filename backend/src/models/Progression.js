const mongoose = require('mongoose');

/**
 * Step in a progression path
 * Each step represents an exercise milestone on the way to mastering the goal exercise
 */
const progressionStepSchema = new mongoose.Schema({
  order: {
    type: Number,
    required: true
  },
  // Level for parallel paths - steps with same level can be done in parallel
  // Steps at level 0 -> then level 1 -> then level 2, etc.
  // Multiple steps at the same level = parallel alternatives
  level: {
    type: Number,
    default: function() { return this.order; } // Default to order if not specified
  },
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  },
  // Denormalized exercise data for quick display without joins
  exerciseName: {
    type: String,
    required: true
  },
  exerciseDifficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced']
  },
  // Visual positioning for graph display (optional - can be auto-calculated)
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  // Step-specific notes/tips
  notes: String,
  // Target metrics to achieve before moving to next step
  targetMetrics: {
    reps: Number,      // e.g., "Achieve 10 reps"
    sets: Number,      // e.g., "3 sets"
    holdTime: Number,  // seconds, for static holds
    weight: Number     // kg, for weighted progressions
  },
  // For parallel paths: which step(s) need to be completed before this one unlocks
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId
  }]
}, { _id: true });

/**
 * User's progress on a specific step
 */
const userStepProgressSchema = new mongoose.Schema({
  stepId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  status: {
    type: String,
    enum: ['locked', 'available', 'in_progress', 'completed'],
    default: 'locked'
  },
  unlockedAt: Date,
  completedAt: Date,
  // Best performance achieved at this step
  bestPerformance: {
    reps: Number,
    sets: Number,
    holdTime: Number,
    weight: Number,
    date: Date
  },
  notes: String
}, { _id: false });

/**
 * Progression Path Schema
 * Represents a path from beginner to goal exercise
 * Can be common (shared) or user-created
 */
const progressionSchema = new mongoose.Schema({
  // The ultimate goal exercise this progression leads to
  goalExercise: {
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise'
    },
    name: {
      type: String,
      required: [true, 'Goal exercise name is required']
    },
    // Optional image/icon for visual representation
    imageUrl: String
  },

  // Progression metadata
  name: {
    type: String,
    required: [true, 'Progression name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // The ordered steps in this progression
  steps: [progressionStepSchema],

  // Difficulty and categorization
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  },
  discipline: {
    type: [String],
    default: ['calisthenics']
  },

  // Primary muscle groups targeted by this progression
  muscles: [String],

  // Estimated time to complete (in weeks)
  estimatedWeeks: {
    type: Number,
    min: 1
  },

  // Visibility and ownership
  isCommon: {
    type: Boolean,
    default: false,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  // Tags for filtering
  tags: [String]
}, {
  timestamps: true
});

/**
 * User Progression Progress Schema
 * Tracks a user's progress through a specific progression path
 */
const userProgressionProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  progressionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Progression',
    required: true,
    index: true
  },

  // Current step the user is working on (0-indexed)
  currentStepIndex: {
    type: Number,
    default: 0
  },

  // Status of the entire progression
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'paused'],
    default: 'not_started',
    index: true
  },

  // Progress on individual steps
  stepProgress: [userStepProgressSchema],

  // Timeline
  startedAt: Date,
  completedAt: Date,
  lastActivityAt: {
    type: Date,
    default: Date.now
  },

  // Notes and customizations
  notes: String
}, {
  timestamps: true
});

// Indexes for Progression
progressionSchema.index({ name: 'text', description: 'text' });
progressionSchema.index({ 'goalExercise.name': 1 });
progressionSchema.index({ discipline: 1 });
progressionSchema.index({ muscles: 1 });
progressionSchema.index({ isCommon: 1, createdBy: 1 });

// Indexes for UserProgressionProgress
userProgressionProgressSchema.index({ userId: 1, progressionId: 1 }, { unique: true });
userProgressionProgressSchema.index({ userId: 1, status: 1 });
userProgressionProgressSchema.index({ userId: 1, lastActivityAt: -1 });

// Virtual for progress percentage
userProgressionProgressSchema.virtual('progressPercentage').get(function() {
  if (!this.stepProgress || this.stepProgress.length === 0) return 0;
  const completed = this.stepProgress.filter(s => s.status === 'completed').length;
  return Math.round((completed / this.stepProgress.length) * 100);
});

// Method to unlock next step
userProgressionProgressSchema.methods.unlockNextStep = function() {
  const nextIndex = this.currentStepIndex + 1;
  if (nextIndex < this.stepProgress.length) {
    this.stepProgress[nextIndex].status = 'available';
    this.stepProgress[nextIndex].unlockedAt = new Date();
    this.currentStepIndex = nextIndex;
    this.lastActivityAt = new Date();
  }
  return this;
};

// Method to complete a step
userProgressionProgressSchema.methods.completeStep = function(stepIndex, performance) {
  if (stepIndex >= 0 && stepIndex < this.stepProgress.length) {
    this.stepProgress[stepIndex].status = 'completed';
    this.stepProgress[stepIndex].completedAt = new Date();
    if (performance) {
      this.stepProgress[stepIndex].bestPerformance = {
        ...performance,
        date: new Date()
      };
    }
    this.lastActivityAt = new Date();

    // Check if all steps are completed
    const allCompleted = this.stepProgress.every(s => s.status === 'completed');
    if (allCompleted) {
      this.status = 'completed';
      this.completedAt = new Date();
    }
  }
  return this;
};

// Static method to get progressions for a user (including common ones)
progressionSchema.statics.getForUser = function(userId) {
  return this.find({
    $or: [
      { isCommon: true },
      { createdBy: userId }
    ]
  }).sort({ name: 1 });
};

// Ensure virtuals are included in JSON
userProgressionProgressSchema.set('toJSON', { virtuals: true });
userProgressionProgressSchema.set('toObject', { virtuals: true });

const Progression = mongoose.model('Progression', progressionSchema);
const UserProgressionProgress = mongoose.model('UserProgressionProgress', userProgressionProgressSchema);

module.exports = { Progression, UserProgressionProgress };
