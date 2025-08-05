const mongoose = require('mongoose');

const userExerciseModificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true,
    index: true
  },
  // Only store modified fields - all are optional
  modifications: {
    name: {
      type: String,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    personalNotes: {
      type: String,
      trim: true
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced']
    },
    // User might want different instructions
    instructions: [String],
    // User might adjust strain for their level
    strain: {
      intensity: {
        type: String,
        enum: ['low', 'moderate', 'high', 'max']
      },
      load: {
        type: String,
        enum: ['bodyweight', 'light', 'moderate', 'heavy']
      },
      typicalVolume: String
    }
  },
  // User-specific metadata
  metadata: {
    isFavorite: {
      type: Boolean,
      default: false
    },
    lastUsed: Date,
    personalBest: {
      value: Number,
      unit: String, // "reps", "kg", "seconds"
      date: Date
    },
    tags: [String] // User's personal categorization
  }
}, {
  timestamps: true
});

// Ensure one modification per user-exercise pair
userExerciseModificationSchema.index({ userId: 1, exerciseId: 1 }, { unique: true });

// Method to merge with base exercise
userExerciseModificationSchema.methods.applyTo = function(exercise) {
  const merged = exercise.toObject ? exercise.toObject() : { ...exercise };
  
  // Apply modifications
  if (this.modifications) {
    Object.keys(this.modifications).forEach(key => {
      if (this.modifications[key] !== undefined) {
        // Handle nested objects like strain
        if (typeof this.modifications[key] === 'object' && !Array.isArray(this.modifications[key])) {
          merged[key] = { ...merged[key], ...this.modifications[key] };
        } else {
          merged[key] = this.modifications[key];
        }
      }
    });
  }
  
  // Add metadata
  merged.userMetadata = this.metadata;
  merged.isModified = true;
  merged.modificationId = this._id;
  
  return merged;
};

const UserExerciseModification = mongoose.model('UserExerciseModification', userExerciseModificationSchema);

module.exports = UserExerciseModification;