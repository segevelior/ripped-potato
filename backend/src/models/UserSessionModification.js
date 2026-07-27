const mongoose = require('mongoose');

const userSessionModificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SessionTemplate',
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
userSessionModificationSchema.index({ userId: 1, sessionTemplateId: 1 }, { unique: true });

// Method to apply modifications to a session template
userSessionModificationSchema.methods.applyToSessionTemplate = function(sessionTemplate) {
  const modifiedTemplate = sessionTemplate.toObject ? sessionTemplate.toObject() : sessionTemplate;

  // Apply basic modifications
  if (this.modifications) {
    ['title', 'description', 'durationMinutes'].forEach(key => {
      if (this.modifications[key] !== undefined && this.modifications[key] !== null) {
        modifiedTemplate[key] = this.modifications[key];
      }
    });

    // NEW SCHEMA: session templates now use a blocks structure
    // For now, we'll skip applying exercise-level modifications since the schema changed
    // TODO: Migrate UserSessionModification to support block-based structure
    // The old modifications model was designed for flat exercise arrays
    // We need to redesign this for the new block-based structure
  }

  // Add user metadata (this still works)
  modifiedTemplate.userMetadata = this.metadata;
  modifiedTemplate.isModified = this.modifications && Object.keys(this.modifications).length > 0;

  return modifiedTemplate;
};

// Method to increment times completed
userSessionModificationSchema.methods.incrementTimesCompleted = function() {
  this.metadata.timesCompleted = (this.metadata.timesCompleted || 0) + 1;
  this.metadata.lastUsed = new Date();
  return this.save();
};

// Collection name pinned explicitly (renamed from the legacy
// 'userworkoutmodifications' by scripts/migrate-workout-to-session.js).
module.exports = mongoose.model('UserSessionModification', userSessionModificationSchema, 'usersessionmodifications');