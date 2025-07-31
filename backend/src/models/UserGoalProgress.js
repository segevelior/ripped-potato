const mongoose = require('mongoose');

const milestoneProgressSchema = new mongoose.Schema({
  milestoneId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  milestoneIndex: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending'
  },
  startDate: Date,
  completedDate: Date,
  notes: String,
  evidence: {
    // For tracking proof of completion
    photos: [String], // URLs to photos
    videos: [String], // URLs to videos
    metrics: {
      weight: Number,
      reps: Number,
      time: Number,
      distance: Number,
      other: String
    }
  }
}, { _id: true });

const userGoalProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'abandoned'],
    default: 'active',
    index: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  targetDate: Date, // user's target completion date
  completedDate: Date,
  pausedDate: Date,
  currentMilestone: {
    type: Number,
    default: 0 // index of current milestone
  },
  milestoneProgress: [milestoneProgressSchema],
  relatedWorkouts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workout'
  }],
  progressMetrics: {
    // Current measurements
    weight: Number,
    reps: Number,
    time: Number,
    distance: Number,
    other: String
  },
  personalNotes: String,
  challenges: [String], // user-reported challenges
  motivation: String, // why user wants to achieve this goal
  reminders: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'never'],
      default: 'weekly'
    },
    lastSent: Date,
    enabled: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Compound indexes for performance
userGoalProgressSchema.index({ userId: 1, status: 1 });
userGoalProgressSchema.index({ goalId: 1, status: 1 });
userGoalProgressSchema.index({ userId: 1, goalId: 1 }, { unique: true });

// Virtual for completion percentage
userGoalProgressSchema.virtual('completionPercentage').get(function() {
  if (!this.milestoneProgress || this.milestoneProgress.length === 0) {
    return 0;
  }
  
  const completedMilestones = this.milestoneProgress.filter(
    m => m.status === 'completed'
  ).length;
  
  return Math.round((completedMilestones / this.milestoneProgress.length) * 100);
});

// Virtual for days active
userGoalProgressSchema.virtual('daysActive').get(function() {
  const startDate = this.startDate;
  const endDate = this.completedDate || new Date();
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
});

// Virtual for days until target
userGoalProgressSchema.virtual('daysUntilTarget').get(function() {
  if (!this.targetDate || this.status === 'completed') return null;
  
  const today = new Date();
  const target = this.targetDate;
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
userGoalProgressSchema.virtual('isOverdue').get(function() {
  if (!this.targetDate || this.status === 'completed') return false;
  return new Date() > this.targetDate;
});

// Static method to get user's active goals
userGoalProgressSchema.statics.getUserActiveGoals = function(userId) {
  return this.find({
    userId,
    status: 'active'
  })
    .populate('goalId', 'name category difficultyLevel estimatedWeeks milestones')
    .sort({ startDate: -1 });
};

// Static method to get user's goal statistics
userGoalProgressSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    total: 0,
    active: 0,
    completed: 0,
    paused: 0,
    abandoned: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });
  
  return result;
};

// Method to start next milestone
userGoalProgressSchema.methods.startNextMilestone = function() {
  if (this.currentMilestone < this.milestoneProgress.length - 1) {
    this.currentMilestone += 1;
    
    // Update milestone status
    if (this.milestoneProgress[this.currentMilestone]) {
      this.milestoneProgress[this.currentMilestone].status = 'in_progress';
      this.milestoneProgress[this.currentMilestone].startDate = new Date();
    }
    
    return this.save();
  }
  return this;
};

// Method to complete current milestone
userGoalProgressSchema.methods.completeMilestone = function(milestoneIndex, evidence = {}) {
  if (this.milestoneProgress[milestoneIndex]) {
    this.milestoneProgress[milestoneIndex].status = 'completed';
    this.milestoneProgress[milestoneIndex].completedDate = new Date();
    
    if (evidence) {
      this.milestoneProgress[milestoneIndex].evidence = {
        ...this.milestoneProgress[milestoneIndex].evidence,
        ...evidence
      };
    }
    
    // Check if all milestones are completed
    const allCompleted = this.milestoneProgress.every(m => m.status === 'completed');
    if (allCompleted) {
      this.status = 'completed';
      this.completedDate = new Date();
    } else {
      // Start next milestone
      this.startNextMilestone();
    }
    
    return this.save();
  }
  return this;
};

// Method to pause goal
userGoalProgressSchema.methods.pauseGoal = function(reason) {
  this.status = 'paused';
  this.pausedDate = new Date();
  if (reason) {
    this.personalNotes = (this.personalNotes || '') + `\nPaused on ${new Date().toLocaleDateString()}: ${reason}`;
  }
  return this.save();
};

// Method to resume goal
userGoalProgressSchema.methods.resumeGoal = function() {
  this.status = 'active';
  this.pausedDate = null;
  this.personalNotes = (this.personalNotes || '') + `\nResumed on ${new Date().toLocaleDateString()}`;
  return this.save();
};

// Method to add workout
userGoalProgressSchema.methods.addWorkout = function(workoutId) {
  if (!this.relatedWorkouts.includes(workoutId)) {
    this.relatedWorkouts.push(workoutId);
    return this.save();
  }
  return this;
};

module.exports = mongoose.model('UserGoalProgress', userGoalProgressSchema);