const mongoose = require('mongoose');

const disciplineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Discipline name is required'],
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
  category: {
    type: String,
    enum: ['strength', 'cardio', 'flexibility', 'skill', 'recovery', 'sport'],
    required: true,
    index: true
  },
  characteristics: {
    primaryFocus: String, // what this discipline primarily develops
    benefits: [String], // key benefits
    skillLevel: {
      type: String,
      enum: ['beginner-friendly', 'requires-experience', 'advanced-only'],
      default: 'beginner-friendly'
    }
  },
  equipment: {
    required: [String], // equipment that's always needed
    optional: [String], // equipment that's sometimes used
    alternatives: [String] // alternative equipment options
  },
  metrics: {
    // How progress is typically measured in this discipline
    primaryMetrics: [String], // e.g., ['weight', 'reps'] for strength
    secondaryMetrics: [String] // e.g., ['time', 'form'] for strength
  },
  relatedDisciplines: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Discipline'
  }],
  popularExercises: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise'
  }], // most common exercises in this discipline
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
disciplineSchema.index({ 
  name: 'text', 
  displayName: 'text',
  description: 'text',
  tags: 'text'
});

// Virtual for exercise count
disciplineSchema.virtual('exerciseCount', {
  ref: 'Exercise',
  localField: '_id',
  foreignField: 'discipline',
  count: true
});

// Static method to get active disciplines by category
disciplineSchema.statics.getByCategory = function(category) {
  const query = { isActive: true };
  if (category) query.category = category;
  
  return this.find(query)
    .sort({ displayName: 1 })
    .populate('relatedDisciplines', 'name displayName')
    .populate('popularExercises', 'name');
};

// Static method to get beginner-friendly disciplines
disciplineSchema.statics.getBeginnerFriendly = function() {
  return this.find({
    isActive: true,
    'characteristics.skillLevel': 'beginner-friendly'
  })
    .sort({ displayName: 1 })
    .populate('popularExercises', 'name muscles');
};

// Static method to search disciplines
disciplineSchema.statics.search = function(searchTerm) {
  return this.find({
    isActive: true,
    $text: { $search: searchTerm }
  }, {
    score: { $meta: 'textScore' }
  })
    .sort({ score: { $meta: 'textScore' } });
};

module.exports = mongoose.model('Discipline', disciplineSchema);