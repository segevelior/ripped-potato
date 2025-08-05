const mongoose = require('mongoose');

const userGoalModificationSchema = new mongoose.Schema({
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
  modifications: {
    // Fields that users can customize
    name: String,
    description: String,
    personalNotes: String,
    estimatedWeeks: Number,
    targetMetrics: {
      weight: Number,
      reps: Number,
      time: Number,
      distance: Number,
      other: String
    }
  },
  metadata: {
    // User-specific metadata
    isFavorite: {
      type: Boolean,
      default: false
    },
    personalDeadline: Date,
    personalMilestones: [{
      originalMilestoneId: mongoose.Schema.Types.ObjectId,
      customName: String,
      customDescription: String,
      customCriteria: String,
      customEstimatedWeeks: Number,
      completed: {
        type: Boolean,
        default: false
      },
      completedDate: Date
    }],
    notes: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Compound index for efficient lookups
userGoalModificationSchema.index({ userId: 1, goalId: 1 }, { unique: true });

// Method to apply modifications to a goal
userGoalModificationSchema.methods.applyToGoal = function(goal) {
  const modifiedGoal = goal.toObject ? goal.toObject() : goal;
  
  // Apply modifications
  if (this.modifications) {
    Object.keys(this.modifications).forEach(key => {
      if (this.modifications[key] !== undefined && this.modifications[key] !== null) {
        modifiedGoal[key] = this.modifications[key];
      }
    });
  }
  
  // Add user metadata
  modifiedGoal.userMetadata = this.metadata;
  modifiedGoal.isModified = true;
  
  return modifiedGoal;
};

module.exports = mongoose.model('UserGoalModification', userGoalModificationSchema);