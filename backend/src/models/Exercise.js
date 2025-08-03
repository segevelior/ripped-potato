const mongoose = require('mongoose');

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
    default: false // false means it's private to the user
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for common exercises
  }
}, {
  timestamps: true
});

// Indexes for performance
exerciseSchema.index({ name: 'text', description: 'text' });
exerciseSchema.index({ 'strain.intensity': 1, 'strain.load': 1 });

// Virtual for full muscle groups (primary + secondary)
exerciseSchema.virtual('allMuscles').get(function() {
  return [...new Set([...this.muscles, ...this.secondaryMuscles])];
});

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

module.exports = mongoose.model('Exercise', exerciseSchema);