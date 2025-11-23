const mongoose = require('mongoose');

const userWorkoutModificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  workoutId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PredefinedWorkout',
    required: true,
    index: true
  },
  modifications: {
    // Fields that users can customize
    title: String,
    description: String,
    durationMinutes: Number,
    exercises: [{
      originalExerciseId: mongoose.Schema.Types.ObjectId,
      order: Number,
      customSets: [{
        reps: Number,
        time: Number,
        weight: Number,
        restSeconds: Number,
        notes: String
      }],
      customNotes: String,
      isRemoved: {
        type: Boolean,
        default: false
      }
    }],
    // Additional exercises user added
    addedExercises: [{
      exerciseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exercise'
      },
      order: Number,
      sets: [{
        reps: Number,
        time: Number,
        weight: Number,
        restSeconds: Number,
        notes: String
      }],
      notes: String
    }]
  },
  metadata: {
    // User-specific metadata
    isFavorite: {
      type: Boolean,
      default: false
    },
    lastUsed: Date,
    timesCompleted: {
      type: Number,
      default: 0
    },
    personalRecord: {
      totalWeight: Number,
      completionTime: Number,
      date: Date
    },
    notes: String,
    tags: [String],
    customRestBetweenExercises: Number // in seconds
  }
}, {
  timestamps: true
});

// Compound index for efficient lookups
userWorkoutModificationSchema.index({ userId: 1, workoutId: 1 }, { unique: true });

// Method to apply modifications to a workout
userWorkoutModificationSchema.methods.applyToWorkout = function(workout) {
  const modifiedWorkout = workout.toObject ? workout.toObject() : workout;

  // Apply basic modifications
  if (this.modifications) {
    ['title', 'description', 'durationMinutes'].forEach(key => {
      if (this.modifications[key] !== undefined && this.modifications[key] !== null) {
        modifiedWorkout[key] = this.modifications[key];
      }
    });

    // NEW SCHEMA: Workouts now use blocks structure
    // For now, we'll skip applying exercise-level modifications since the schema changed
    // TODO: Migrate UserWorkoutModification to support block-based structure
    // The old modifications model was designed for flat exercise arrays
    // We need to redesign this for the new block-based structure
  }

  // Add user metadata (this still works)
  modifiedWorkout.userMetadata = this.metadata;
  modifiedWorkout.isModified = this.modifications && Object.keys(this.modifications).length > 0;

  return modifiedWorkout;
};

// Method to increment times completed
userWorkoutModificationSchema.methods.incrementTimesCompleted = function() {
  this.metadata.timesCompleted = (this.metadata.timesCompleted || 0) + 1;
  this.metadata.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('UserWorkoutModification', userWorkoutModificationSchema);