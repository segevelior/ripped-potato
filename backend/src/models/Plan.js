const mongoose = require('mongoose');

const weeklyWorkoutSchema = new mongoose.Schema({
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6 // 0 = Sunday, 6 = Saturday
  },
  workoutType: {
    type: String,
    enum: ['predefined', 'custom'],
    required: true
  },
  predefinedWorkoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PredefinedWorkout'
  },
  customWorkout: {
    title: String,
    type: {
      type: String,
      enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit']
    },
    durationMinutes: Number,
    exercises: [{
      exerciseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exercise'
      },
      exerciseName: String,
      sets: [{
        reps: Number,
        time: Number,
        weight: Number,
        restSeconds: Number
      }]
    }]
  },
  notes: String,
  isOptional: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const weekSchema = new mongoose.Schema({
  weekNumber: {
    type: Number,
    required: true,
    min: 1
  },
  focus: String, // weekly training focus
  description: String,
  workouts: [weeklyWorkoutSchema],
  restDays: [{
    type: Number,
    min: 0,
    max: 6
  }],
  notes: String,
  deloadWeek: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const planSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true
  },
  description: String,
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal'
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'abandoned'],
    default: 'draft',
    index: true
  },
  startDate: Date,
  endDate: Date,
  actualEndDate: Date,
  schedule: {
    weeksTotal: {
      type: Number,
      required: true,
      min: 1,
      max: 52 // max 1 year
    },
    workoutsPerWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 7
    },
    restDays: [{
      type: Number,
      min: 0,
      max: 6
    }],
    preferredWorkoutDays: [{
      type: Number,
      min: 0,
      max: 6
    }]
  },
  weeks: [weekSchema],
  progress: {
    currentWeek: {
      type: Number,
      default: 1,
      min: 1
    },
    completedWorkouts: {
      type: Number,
      default: 0
    },
    totalWorkouts: {
      type: Number,
      default: 0
    },
    skippedWorkouts: {
      type: Number,
      default: 0
    },
    adherencePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  settings: {
    autoAdvance: {
      type: Boolean,
      default: true // automatically advance to next week
    },
    allowModifications: {
      type: Boolean,
      default: true // allow user to modify workouts
    },
    sendReminders: {
      type: Boolean,
      default: true
    },
    difficultyAdjustment: {
      type: String,
      enum: ['auto', 'manual', 'none'],
      default: 'manual'
    }
  },
  tags: [String],
  isTemplate: {
    type: Boolean,
    default: false,
    index: true
  },
  templateName: String, // if this plan can be used as template
  createdFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan' // if created from another plan template
  }
}, {
  timestamps: true
});

// Compound indexes for performance
planSchema.index({ userId: 1, status: 1 });
planSchema.index({ goalId: 1 });
planSchema.index({ isTemplate: 1, templateName: 1 });

// Virtual for plan duration in days
planSchema.virtual('durationDays').get(function() {
  return this.schedule.weeksTotal * 7;
});

// Virtual for completion percentage
planSchema.virtual('completionPercentage').get(function() {
  if (this.progress.totalWorkouts === 0) return 0;
  return Math.round((this.progress.completedWorkouts / this.progress.totalWorkouts) * 100);
});

// Virtual for current week progress
planSchema.virtual('currentWeekProgress').get(function() {
  if (!this.weeks || this.weeks.length === 0) return null;
  
  const currentWeek = this.weeks.find(w => w.weekNumber === this.progress.currentWeek);
  if (!currentWeek) return null;
  
  return {
    weekNumber: currentWeek.weekNumber,
    focus: currentWeek.focus,
    totalWorkouts: currentWeek.workouts.length,
    workouts: currentWeek.workouts
  };
});

// Virtual for days until completion
planSchema.virtual('daysUntilCompletion').get(function() {
  if (!this.endDate || this.status === 'completed') return null;
  
  const today = new Date();
  const end = this.endDate;
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
});

// Static method to get user's active plans
planSchema.statics.getUserActivePlans = function(userId) {
  return this.find({
    userId,
    status: { $in: ['active', 'paused'] }
  })
    .populate('goalId', 'name category difficultyLevel')
    .sort({ startDate: -1 });
};

// Static method to get plan templates
planSchema.statics.getTemplates = function() {
  return this.find({
    isTemplate: true
  })
    .select('templateName description schedule tags createdAt')
    .sort({ templateName: 1 });
};

// Method to start plan
planSchema.methods.startPlan = function(startDate = new Date()) {
  this.status = 'active';
  this.startDate = startDate;
  this.endDate = new Date(startDate.getTime() + (this.schedule.weeksTotal * 7 * 24 * 60 * 60 * 1000));
  
  // Calculate total workouts
  this.progress.totalWorkouts = this.weeks.reduce((sum, week) => sum + week.workouts.length, 0);
  
  return this.save();
};

// Method to complete workout
planSchema.methods.completeWorkout = function(weekNumber, workoutIndex) {
  this.progress.completedWorkouts += 1;
  this.updateAdherence();
  
  // Check if week is completed
  const week = this.weeks.find(w => w.weekNumber === weekNumber);
  if (week) {
    const completedInWeek = /* would need to track per workout */ 1;
    
    // Auto advance to next week if all workouts completed
    if (this.settings.autoAdvance && completedInWeek >= week.workouts.length) {
      this.advanceToNextWeek();
    }
  }
  
  return this.save();
};

// Method to skip workout
planSchema.methods.skipWorkout = function(reason) {
  this.progress.skippedWorkouts += 1;
  this.updateAdherence();
  return this.save();
};

// Method to update adherence percentage
planSchema.methods.updateAdherence = function() {
  const totalScheduled = this.progress.completedWorkouts + this.progress.skippedWorkouts;
  if (totalScheduled > 0) {
    this.progress.adherencePercentage = Math.round(
      (this.progress.completedWorkouts / totalScheduled) * 100
    );
  }
};

// Method to advance to next week
planSchema.methods.advanceToNextWeek = function() {
  if (this.progress.currentWeek < this.schedule.weeksTotal) {
    this.progress.currentWeek += 1;
  } else {
    // Plan completed
    this.status = 'completed';
    this.actualEndDate = new Date();
  }
  return this.save();
};

// Method to pause plan
planSchema.methods.pausePlan = function(reason) {
  this.status = 'paused';
  // Could add pause reason to notes or separate field
  return this.save();
};

// Method to resume plan
planSchema.methods.resumePlan = function() {
  this.status = 'active';
  
  // Optionally adjust end date based on pause duration
  // This would require tracking pause start date
  
  return this.save();
};

// Method to create template from plan
planSchema.methods.createTemplate = function(templateName, description) {
  const templateData = {
    ...this.toObject(),
    _id: undefined,
    userId: undefined,
    isTemplate: true,
    templateName,
    description,
    status: 'draft',
    startDate: undefined,
    endDate: undefined,
    actualEndDate: undefined,
    progress: {
      currentWeek: 1,
      completedWorkouts: 0,
      totalWorkouts: 0,
      skippedWorkouts: 0,
      adherencePercentage: 0
    },
    createdFrom: this._id
  };
  
  return new this.constructor(templateData);
};

module.exports = mongoose.model('Plan', planSchema);