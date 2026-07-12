const mongoose = require('mongoose');
const { inferMovementPattern } = require('../utils/movementPattern');
const EmbeddingService = require('../services/EmbeddingService');

const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Exercise name is required'],
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  muscles: {
    type: [String],
    required: [true, 'At least one muscle group is required'],
    index: true
  },
  secondaryMuscles: [String],
  discipline: {
    type: [String],
    required: [true, 'At least one discipline is required'],
    index: true
  },
  equipment: [String],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  // How the movement applies force. Optional — legacy docs and user-created
  // exercises may omit it.
  force: {
    type: String,
    enum: ['push', 'pull', 'static']
  },
  // Compound (multi-joint) vs isolation (single-joint). Optional.
  mechanic: {
    type: String,
    enum: ['compound', 'isolation']
  },
  instructions: [String],
  strain: {
    intensity: {
      type: String,
      enum: ['low', 'moderate', 'high', 'max']
    },
    load: {
      type: String,
      enum: ['bodyweight', 'light', 'moderate', 'heavy']
    },
    durationType: {
      type: String,
      enum: ['reps', 'time', 'distance']
    },
    typicalVolume: String // e.g., "3x12", "30 seconds"
  },
  mediaUrls: {
    image: String,
    video: String
  },
  isCommon: {
    type: Boolean,
    default: false, // false means it's private to the user
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.isCommon; // Required for user exercises, not for common
    },
    index: true
  },
  // Semantic-search vector for "similar exercises". select:false so the 1536
  // floats never bloat normal reads — opt in with .select('+embedding').
  embedding: {
    type: [Number],
    default: undefined,
    select: false
  },
  // The exact string we last embedded. select:false so it never leaks into API
  // responses (it's internal). The pre-save guard compares against it to decide
  // whether to re-embed, so the update controller must explicitly load it with
  // .select('+embeddingText') — otherwise the guard misfires and re-embeds on
  // every save.
  embeddingText: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

// Indexes for performance
exerciseSchema.index({ name: 'text', description: 'text' });
exerciseSchema.index({ 'strain.intensity': 1, 'strain.load': 1 });
// Compound index for efficient user queries
exerciseSchema.index({ isCommon: 1, createdBy: 1 });

// Virtual for full muscle groups (primary + secondary)
exerciseSchema.virtual('allMuscles').get(function() {
  return [...new Set([...this.muscles, ...this.secondaryMuscles])];
});

// Virtual to check if this is a user's private exercise
exerciseSchema.virtual('isPrivate').get(function() {
  return !this.isCommon && this.createdBy;
});

// Method to check if user can edit this exercise directly
exerciseSchema.methods.canUserEdit = function(userId) {
  return !this.isCommon && this.createdBy?.toString() === userId.toString();
};

// Static method to find exercises by muscle group
exerciseSchema.statics.findByMuscle = function(muscle) {
  return this.find({
    $or: [
      { muscles: muscle },
      { secondaryMuscles: muscle }
    ]
  });
};

// Static method to find exercises by equipment
exerciseSchema.statics.findByEquipment = function(equipment) {
  if (!equipment || equipment.length === 0) {
    return this.find({ equipment: { $size: 0 } });
  }
  return this.find({ equipment: { $in: equipment } });
};

// Build the composite text we embed for similarity. Concatenates the fields
// that define what an exercise *is* — name, muscles, discipline, equipment,
// difficulty — plus the inferred movement pattern so "Barbell Bench Press" and
// "Dumbbell Bench Press" land near each other in vector space.
function buildEmbedText(doc) {
  const parts = [];
  if (doc.name) parts.push(doc.name);
  const muscles = [...(doc.muscles || []), ...(doc.secondaryMuscles || [])];
  if (muscles.length) parts.push(`muscles: ${muscles.join(', ')}`);
  if (doc.discipline && doc.discipline.length) parts.push(`discipline: ${doc.discipline.join(', ')}`);
  if (doc.equipment && doc.equipment.length) parts.push(`equipment: ${doc.equipment.join(', ')}`);
  if (doc.difficulty) parts.push(`difficulty: ${doc.difficulty}`);
  // Conditional so docs without these fields (the pre-existing catalog) keep a
  // byte-identical embed text and never get needlessly re-embedded.
  if (doc.mechanic) parts.push(`mechanic: ${doc.mechanic}`);
  if (doc.force) parts.push(`force: ${doc.force}`);
  const pattern = inferMovementPattern(doc);
  if (pattern) parts.push(`movement: ${pattern}`);
  return parts.join(' | ');
}

// Expose so the backfill script can compute the same text.
exerciseSchema.statics.buildEmbedText = buildEmbedText;

// Generate/refresh the embedding on write — the "on-the-fly, not a job" path.
// Guard on embeddingText so unrelated saves (favorites, isCommon toggles) don't
// re-embed. Fail-soft: a failed embedding leaves the doc saveable without one.
exerciseSchema.pre('save', async function generateEmbedding() {
  const newText = buildEmbedText(this);
  if (!this.isNew && this.embeddingText === newText) return;

  const vector = await EmbeddingService.generateEmbedding(newText);
  if (vector) {
    this.embedding = vector;
    this.embeddingText = newText;
  }
  // If embedding failed, leave prior embedding/embeddingText untouched; the
  // backfill script (or the next successful save) will fill it in.
});

// buildEmbedText is exposed via exerciseSchema.statics (Exercise.buildEmbedText).
module.exports = mongoose.model('Exercise', exerciseSchema);
