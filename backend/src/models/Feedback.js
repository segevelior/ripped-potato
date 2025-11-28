const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: String,
    enum: ['thumbs_up', 'thumbs_down'],
    required: true
  },
  feedbackText: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  category: {
    type: String,
    enum: ['general', 'bug', 'feature_request', 'ui_ux', 'performance', 'other'],
    default: 'general'
  },
  page: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['new', 'reviewed', 'resolved', 'dismissed'],
    default: 'new'
  },
  adminNotes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Index for efficient queries
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ category: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
