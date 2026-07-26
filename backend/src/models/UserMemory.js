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
  },
  // Tombstone: deleted memories stay in the array (hidden everywhere) so the
  // auto-promotion dedup can see them and never re-learns a deleted fact
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  // Written by the Python ai-coach-service: provenance (meta.origin,
  // meta.retired from the rescore script) and the supersession audit trail.
  // Declared here so strict mode can't strip them when a Settings save
  // rewrites the array — meta.retired gates auto-revival of retired memories.
  meta: {
    type: mongoose.Schema.Types.Mixed
  },
  history: [{
    type: mongoose.Schema.Types.Mixed
  }]
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
