const mongoose = require('mongoose');

const memoryItemSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['health', 'preference', 'goal', 'lifestyle', 'general'],
    default: 'general'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  source: {
    type: String,
    enum: ['user', 'sensei'],
    default: 'user'
  },
  importance: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const userMemorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  memories: [memoryItemSchema]
}, {
  timestamps: true
});

// Index for efficient queries
userMemorySchema.index({ user: 1 });
userMemorySchema.index({ 'memories.category': 1 });
userMemorySchema.index({ 'memories.isActive': 1 });
userMemorySchema.index({ 'memories.importance': 1 });

module.exports = mongoose.model('UserMemory', userMemorySchema);
