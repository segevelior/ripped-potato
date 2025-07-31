const mongoose = require('mongoose');

const predefinedSetSchema = new mongoose.Schema({
  reps: Number,
  time: Number, // for time-based exercises
  weight: Number, // suggested weight
  restSeconds: Number,
  notes: String
}, { _id: false });

const predefinedExerciseSchema = new mongoose.Schema({
  exerciseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  exerciseName: String, // denormalized for performance
  order: {
    type: Number,
    required: true
  },
  sets: [predefinedSetSchema],
  notes: String
}, { _id: false });

const predefinedWorkoutSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Workout title is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit'],
    required: true,
    index: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true,
    index: true
  },
  durationMinutes: {
    type: Number,
    required: true
  },
  targetMuscles: {
    type: [String],
    required: true,
    index: true
  },
  equipment: [String],
  exercises: [predefinedExerciseSchema],
  isPublic: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for system templates
  },
  tags: {
    type: [String],
    index: true
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
predefinedWorkoutSchema.index({ type: 1, difficulty: 1 });
predefinedWorkoutSchema.index({ targetMuscles: 1, difficulty: 1 });
predefinedWorkoutSchema.index({ tags: 1, isPublic: 1 });
predefinedWorkoutSchema.index({ popularity: -1, isPublic: 1 });

// Text search index
predefinedWorkoutSchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text' 
});

// Virtual for total sets count
predefinedWorkoutSchema.virtual('totalSets').get(function() {
  return this.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
});

// Virtual for estimated calories (rough calculation)
predefinedWorkoutSchema.virtual('estimatedCalories').get(function() {
  const baseCaloriesPerMinute = {
    strength: 6,
    cardio: 8,
    hiit: 10,
    hybrid: 7,
    recovery: 3
  };
  
  return Math.round(this.durationMinutes * (baseCaloriesPerMinute[this.type] || 6));
});

// Static method to find popular workouts
predefinedWorkoutSchema.statics.findPopular = function(limit = 10) {
  return this.find({ isPublic: true })
    .sort({ popularity: -1, 'ratings.average': -1 })
    .limit(limit)
    .populate('exercises.exerciseId', 'name muscles')
    .populate('createdBy', 'name');
};

// Static method to find by difficulty and type
predefinedWorkoutSchema.statics.findByDifficultyAndType = function(difficulty, type) {
  const query = { isPublic: true };
  if (difficulty) query.difficulty = difficulty;
  if (type) query.type = type;
  
  return this.find(query)
    .sort({ popularity: -1 })
    .populate('exercises.exerciseId', 'name muscles')
    .populate('createdBy', 'name');
};

// Static method to find by equipment
predefinedWorkoutSchema.statics.findByEquipment = function(availableEquipment = []) {
  let query = { isPublic: true };
  
  if (availableEquipment.length === 0) {
    // Find bodyweight workouts
    query.equipment = { $size: 0 };
  } else {
    // Find workouts that use only available equipment
    query.equipment = { $not: { $elemMatch: { $nin: availableEquipment } } };
  }
  
  return this.find(query)
    .sort({ popularity: -1 })
    .populate('exercises.exerciseId', 'name muscles')
    .populate('createdBy', 'name');
};

// Method to increment popularity
predefinedWorkoutSchema.methods.incrementPopularity = function() {
  this.popularity += 1;
  return this.save();
};

// Method to add rating
predefinedWorkoutSchema.methods.addRating = function(rating) {
  const currentTotal = this.ratings.average * this.ratings.count;
  this.ratings.count += 1;
  this.ratings.average = (currentTotal + rating) / this.ratings.count;
  return this.save();
};

module.exports = mongoose.model('PredefinedWorkout', predefinedWorkoutSchema);