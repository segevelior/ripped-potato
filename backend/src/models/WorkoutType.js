const mongoose = require('mongoose');

const workoutTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Workout type name is required'],
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  characteristics: {
    primaryFocus: {
      type: String,
      required: true // e.g., "muscle building", "cardiovascular fitness"
    },
    intensityRange: {
      min: {
        type: String,
        enum: ['low', 'moderate', 'high', 'max'],
        default: 'low'
      },
      max: {
        type: String,
        enum: ['low', 'moderate', 'high', 'max'],
        default: 'high'
      }
    },
    typicalDuration: {
      min: Number, // minutes
      max: Number, // minutes
      average: Number // minutes
    },
    restBetweenSets: {
      type: String,
      enum: ['short', 'moderate', 'long', 'variable'],
      default: 'moderate'
    },
    restBetweenExercises: {
      type: String,
      enum: ['minimal', 'short', 'moderate', 'long'],
      default: 'short'
    }
  },
  structure: {
    // How workouts of this type are typically structured
    commonFormats: [String], // e.g., ["circuits", "straight sets", "supersets"]
    setRepRanges: {
      strength: String, // e.g., "3-5 sets of 5-8 reps"
      endurance: String, // e.g., "2-3 sets of 15-20 reps"
      power: String // e.g., "5-8 sets of 1-3 reps"
    },
    progressionMethods: [String] // how to progress in this workout type
  },
  suitableFor: {
    goals: [String], // e.g., ["muscle_building", "fat_loss", "strength"]
    fitnessLevels: [{
      type: String,
      enum: ['beginner', 'intermediate', 'advanced']
    }],
    timeConstraints: [String] // e.g., ["quick_session", "full_workout"]
  },
  commonEquipment: [String], // equipment typically used
  muscleGroupFocus: {
    primary: [String], // muscle groups this type primarily targets
    secondary: [String] // muscle groups this type secondarily targets
  },
  metabolicDemand: {
    type: String,
    enum: ['low', 'moderate', 'high', 'very_high'],
    default: 'moderate'
  },
  recoveryRequirement: {
    type: String,
    enum: ['minimal', 'moderate', 'high', 'extensive'],
    default: 'moderate'
  },
  frequency: {
    recommended: {
      beginner: String, // e.g., "2-3 times per week"
      intermediate: String,
      advanced: String
    },
    maximum: String // max frequency per week
  },
  contraindications: [String], // when not to do this workout type
  benefits: [String], // key benefits of this workout type
  tags: [String],
  color: {
    type: String,
    default: '#6B7280' // hex color for UI
  },
  icon: String, // icon name or URL
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Text search index
workoutTypeSchema.index({ 
  name: 'text', 
  displayName: 'text',
  description: 'text',
  tags: 'text'
});

// Compound indexes for common queries
workoutTypeSchema.index({ 'suitableFor.goals': 1, isActive: 1 });
workoutTypeSchema.index({ 'suitableFor.fitnessLevels': 1, isActive: 1 });

// Virtual for workout count
workoutTypeSchema.virtual('workoutCount', {
  ref: 'Workout',
  localField: 'name',
  foreignField: 'type',
  count: true
});

// Virtual for predefined workout count
workoutTypeSchema.virtual('predefinedWorkoutCount', {
  ref: 'PredefinedWorkout',
  localField: 'name',
  foreignField: 'type',
  count: true
});

// Static method to get by fitness level
workoutTypeSchema.statics.getByFitnessLevel = function(level) {
  return this.find({
    isActive: true,
    'suitableFor.fitnessLevels': level
  }).sort({ displayName: 1 });
};

// Static method to get by goal
workoutTypeSchema.statics.getByGoal = function(goal) {
  return this.find({
    isActive: true,
    'suitableFor.goals': goal
  }).sort({ displayName: 1 });
};

// Static method to get by time constraint
workoutTypeSchema.statics.getByTimeConstraint = function(timeConstraint) {
  return this.find({
    isActive: true,
    'suitableFor.timeConstraints': timeConstraint
  }).sort({ displayName: 1 });
};

// Static method to get recommendations
workoutTypeSchema.statics.getRecommendations = function(userLevel, goals, timeAvailable) {
  const query = {
    isActive: true,
    'suitableFor.fitnessLevels': userLevel
  };
  
  if (goals && goals.length > 0) {
    query['suitableFor.goals'] = { $in: goals };
  }
  
  if (timeAvailable) {
    query['suitableFor.timeConstraints'] = timeAvailable;
  }
  
  return this.find(query)
    .sort({ displayName: 1 })
    .limit(5);
};

// Method to check if suitable for user
workoutTypeSchema.methods.isSuitableFor = function(userLevel, goals = [], timeConstraint = null) {
  // Check fitness level
  if (!this.suitableFor.fitnessLevels.includes(userLevel)) {
    return false;
  }
  
  // Check goals (if provided)
  if (goals.length > 0) {
    const hasMatchingGoal = goals.some(goal => 
      this.suitableFor.goals.includes(goal)
    );
    if (!hasMatchingGoal) return false;
  }
  
  // Check time constraint (if provided)
  if (timeConstraint && !this.suitableFor.timeConstraints.includes(timeConstraint)) {
    return false;
  }
  
  return true;
};

module.exports = mongoose.model('WorkoutType', workoutTypeSchema);