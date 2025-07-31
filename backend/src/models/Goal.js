const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  criteria: String, // how to measure completion
  order: {
    type: Number,
    required: true
  },
  estimatedWeeks: Number // how long this milestone should take
}, { _id: true }); // Keep _id for milestones

const goalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Goal name is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['strength', 'endurance', 'skill', 'weight', 'performance', 'health'],
    required: true,
    index: true
  },
  discipline: {
    type: [String],
    required: true,
    index: true
  },
  difficultyLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    required: true,
    index: true
  },
  estimatedWeeks: {
    type: Number,
    required: true,
    min: 1,
    max: 104 // max 2 years
  },
  milestones: [milestoneSchema],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal'
  }],
  progressionPaths: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProgressionPath'
  }],
  targetMetrics: {
    // For measurable goals
    weight: Number, // target weight in kg
    reps: Number, // target repetitions
    time: Number, // target time in seconds
    distance: Number, // target distance in meters
    other: String // custom metric description
  },
  requiredEquipment: [String],
  recommendedExercises: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  }],
  isPublic: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for system goals
  },
  tags: {
    type: [String],
    index: true
  },
  popularity: {
    type: Number,
    default: 0
  },
  successRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100 // percentage of users who completed this goal
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
goalSchema.index({ category: 1, difficultyLevel: 1 });
goalSchema.index({ discipline: 1, difficultyLevel: 1 });
goalSchema.index({ tags: 1, isPublic: 1 });
goalSchema.index({ popularity: -1, isPublic: 1 });

// Text search index
goalSchema.index({ 
  name: 'text', 
  description: 'text', 
  tags: 'text' 
});

// Virtual for milestone count
goalSchema.virtual('milestoneCount').get(function() {
  return this.milestones.length;
});

// Virtual for difficulty score (for sorting)
goalSchema.virtual('difficultyScore').get(function() {
  const scores = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4
  };
  return scores[this.difficultyLevel] || 1;
});

// Static method to find goals by category and difficulty
goalSchema.statics.findByCategoryAndDifficulty = function(category, difficulty) {
  const query = { isPublic: true };
  if (category) query.category = category;
  if (difficulty) query.difficultyLevel = difficulty;
  
  return this.find(query)
    .sort({ popularity: -1, successRate: -1 })
    .populate('prerequisites', 'name difficultyLevel')
    .populate('recommendedExercises', 'name muscles')
    .populate('createdBy', 'name');
};

// Static method to find goals by discipline
goalSchema.statics.findByDiscipline = function(disciplines) {
  return this.find({
    isPublic: true,
    discipline: { $in: disciplines }
  })
    .sort({ popularity: -1 })
    .populate('prerequisites', 'name difficultyLevel')
    .populate('recommendedExercises', 'name muscles')
    .populate('createdBy', 'name');
};

// Static method to find beginner-friendly goals
goalSchema.statics.findBeginnerFriendly = function() {
  return this.find({
    isPublic: true,
    difficultyLevel: 'beginner',
    prerequisites: { $size: 0 } // no prerequisites
  })
    .sort({ successRate: -1, popularity: -1 })
    .limit(10)
    .populate('recommendedExercises', 'name muscles')
    .populate('createdBy', 'name');
};

// Static method to find recommended next goals
goalSchema.statics.findRecommendedNext = function(completedGoalIds, userLevel = 'beginner') {
  const maxDifficulty = {
    beginner: ['beginner'],
    intermediate: ['beginner', 'intermediate'],
    advanced: ['beginner', 'intermediate', 'advanced'],
    expert: ['beginner', 'intermediate', 'advanced', 'expert']
  };
  
  return this.find({
    isPublic: true,
    _id: { $nin: completedGoalIds },
    difficultyLevel: { $in: maxDifficulty[userLevel] || ['beginner'] },
    $or: [
      { prerequisites: { $size: 0 } }, // no prerequisites
      { prerequisites: { $in: completedGoalIds } } // prerequisites met
    ]
  })
    .sort({ successRate: -1, popularity: -1 })
    .limit(5)
    .populate('prerequisites', 'name')
    .populate('recommendedExercises', 'name muscles');
};

// Method to increment popularity
goalSchema.methods.incrementPopularity = function() {
  this.popularity += 1;
  return this.save();
};

// Method to update success rate
goalSchema.methods.updateSuccessRate = function(completed, total) {
  if (total > 0) {
    this.successRate = Math.round((completed / total) * 100);
    return this.save();
  }
  return this;
};

// Method to check if prerequisites are met
goalSchema.methods.checkPrerequisites = function(completedGoalIds) {
  if (this.prerequisites.length === 0) return true;
  
  return this.prerequisites.every(prereqId => 
    completedGoalIds.some(completedId => 
      completedId.toString() === prereqId.toString()
    )
  );
};

module.exports = mongoose.model('Goal', goalSchema);