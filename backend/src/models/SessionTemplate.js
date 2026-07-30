const mongoose = require('mongoose');
const { DISCIPLINES, normalizeDisciplines } = require('../config/disciplines');

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

// Structured block types. Missing `type` (all pre-existing docs) is treated
// as 'straight_sets' by every reader. There is deliberately no 'distance'
// type: distance targets live in the exercise `volume` string ("400m @ 5k
// pace") and run with duration/interval semantics.
const BLOCK_TYPES = [
  'straight_sets', // classic sets x reps; rounds ignored
  'circuit',       // exercise list repeats `rounds` times, `rest_seconds` between rounds
  'tabata',        // `rounds` x `work_seconds` on / `rest_seconds` off (convention 8x20/10)
  'amrap',         // as many rounds as possible within `duration_seconds`
  'emom',          // `rounds` minute-slots, `work_seconds` of work per slot
  'interval',      // run/bike/climb repeats: `rounds` x work bout with `rest_seconds` recovery
  'duration',      // one continuous effort of `duration_seconds` (tempo run, endurance ride, ARC)
];

// Block schema (like "Warm-up", "Main Work", etc.)
const blockSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: BLOCK_TYPES,
    default: 'straight_sets'
  },
  rounds: {
    type: Number,
    min: 1,
    default: 1
  },
  work_seconds: {
    type: Number,
    min: 1
  },
  rest_seconds: {
    type: Number,
    min: 0
  },
  duration_seconds: {
    type: Number,
    min: 1
  },
  instructions: String, // block-level coaching text
  exercises: [blockExerciseSchema]
}, { _id: false });

const sessionTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Session name is required'],
    trim: true,
    index: true
  },
  goal: {
    type: String,
    trim: true
  },
  // Canonical vocabulary only — same normalization + enum story as
  // Exercise.discipline (see config/disciplines.js).
  primary_disciplines: {
    type: [{ type: String, enum: DISCIPLINES }],
    set: normalizeDisciplines,
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
sessionTemplateSchema.index({ primary_disciplines: 1, difficulty_level: 1 });
sessionTemplateSchema.index({ tags: 1, isCommon: 1 });
sessionTemplateSchema.index({ popularity: -1, isCommon: 1 });

// Text search index
sessionTemplateSchema.index({
  name: 'text',
  goal: 'text',
  tags: 'text'
});

// Virtual for total exercises count
sessionTemplateSchema.virtual('totalExercises').get(function () {
  return this.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
});

// Static method to search workouts
sessionTemplateSchema.statics.search = function (term) {
  return this.find(
    { $text: { $search: term } },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } });
};

// Virtual for estimated calories (rough calculation)
sessionTemplateSchema.virtual('estimatedCalories').get(function () {
  const baseCaloriesPerMinute = 6; // Default for strength training
  return Math.round(this.estimated_duration * baseCaloriesPerMinute);
});

// Static method to find popular workouts
sessionTemplateSchema.statics.findPopular = function (limit = 10) {
  return this.find({ isCommon: true })
    .sort({ popularity: -1, 'ratings.average': -1 })
    .limit(limit)
    .populate('createdBy', 'name');
};

// Static method to find by difficulty
sessionTemplateSchema.statics.findByDifficulty = function (difficulty) {
  const query = { isCommon: true };
  if (difficulty) query.difficulty_level = difficulty;

  return this.find(query)
    .sort({ popularity: -1 })
    .populate('createdBy', 'name');
};

// Method to increment popularity
sessionTemplateSchema.methods.incrementPopularity = function () {
  this.popularity += 1;
  return this.save();
};

// Method to add rating
sessionTemplateSchema.methods.addRating = function (rating) {
  const currentTotal = this.ratings.average * this.ratings.count;
  this.ratings.count += 1;
  this.ratings.average = (currentTotal + rating) / this.ratings.count;
  return this.save();
};

// Method to check if user can edit this workout
sessionTemplateSchema.methods.canUserEdit = function (userId) {
  return !this.isCommon && this.createdBy?.toString() === userId.toString();
};

// Virtual for isPrivate
sessionTemplateSchema.virtual('isPrivate').get(function () {
  return !this.isCommon;
});

// Collection name pinned explicitly (renamed from the legacy
// 'predefinedworkouts' by scripts/migrate-workout-to-session.js).
module.exports = mongoose.model('SessionTemplate', sessionTemplateSchema, 'sessiontemplates');
module.exports.BLOCK_TYPES = BLOCK_TYPES;