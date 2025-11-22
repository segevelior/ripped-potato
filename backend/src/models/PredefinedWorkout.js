const mongoose = require('mongoose');

// Exercise within a block (simple volume/rest format like frontend)
const blockExerciseSchema = new mongoose.Schema({
  exercise_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  exercise_name: String, // denormalized for performance
  volume: String, // e.g., "3x8", "30s", "AMRAP"
  rest: String, // e.g., "60s", "90-120s"
  notes: String
}, { _id: false });

// Block schema (like "Warm-up", "Main Work", etc.)
const blockSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  exercises: [blockExerciseSchema]
}, { _id: false });

const predefinedWorkoutSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Workout name is required'],
    trim: true,
    index: true
  },
  goal: {
    type: String,
    trim: true
  },
  primary_disciplines: {
    type: [String],
    default: []
  },
  estimated_duration: {
    type: Number,
    required: true
  },
  difficulty_level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true,
    index: true
  },
  blocks: [blockSchema],
  tags: {
    type: [String],
    default: [],
    index: true
  },
  isCommon: {
    type: Boolean,
    default: false,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  popularity: {
    type: Number,
    default: 0
  },
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});


// Compound indexes for common queries
predefinedWorkoutSchema.index({ primary_disciplines: 1, difficulty_level: 1 });
predefinedWorkoutSchema.index({ tags: 1, isCommon: 1 });
predefinedWorkoutSchema.index({ popularity: -1, isCommon: 1 });

// Text search index
predefinedWorkoutSchema.index({
  name: 'text',
  goal: 'text',
  tags: 'text'
});

// Virtual for total exercises count
predefinedWorkoutSchema.virtual('totalExercises').get(function () {
  return this.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
});

// Virtual for estimated calories (rough calculation)
predefinedWorkoutSchema.virtual('estimatedCalories').get(function () {
  const baseCaloriesPerMinute = 6; // Default for strength training
  return Math.round(this.estimated_duration * baseCaloriesPerMinute);
});

// Static method to find popular workouts
predefinedWorkoutSchema.statics.findPopular = function (limit = 10) {
  return this.find({ isCommon: true })
    .sort({ popularity: -1, 'ratings.average': -1 })
    .limit(limit)
    .populate('createdBy', 'name');
};

// Static method to find by difficulty
predefinedWorkoutSchema.statics.findByDifficulty = function (difficulty) {
  const query = { isCommon: true };
  if (difficulty) query.difficulty_level = difficulty;

  return this.find(query)
    .sort({ popularity: -1 })
    .populate('createdBy', 'name');
};

// Method to increment popularity
predefinedWorkoutSchema.methods.incrementPopularity = function () {
  this.popularity += 1;
  return this.save();
};

// Method to add rating
predefinedWorkoutSchema.methods.addRating = function (rating) {
  const currentTotal = this.ratings.average * this.ratings.count;
  this.ratings.count += 1;
  this.ratings.average = (currentTotal + rating) / this.ratings.count;
  return this.save();
};

// Method to check if user can edit this workout
predefinedWorkoutSchema.methods.canUserEdit = function (userId) {
  return !this.isCommon && this.createdBy?.toString() === userId.toString();
};

// Virtual for isPrivate
predefinedWorkoutSchema.virtual('isPrivate').get(function () {
  return !this.isCommon;
});

module.exports = mongoose.model('PredefinedWorkout', predefinedWorkoutSchema);