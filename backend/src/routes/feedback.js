const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { auth } = require('../middleware/auth');

// POST /api/v1/feedback - Submit new feedback
router.post('/', auth, async (req, res) => {
  try {
    const { rating, feedbackText, category, page } = req.body;

    if (!rating || !['thumbs_up', 'thumbs_down'].includes(rating)) {
      return res.status(400).json({
        success: false,
        message: 'Rating is required and must be thumbs_up or thumbs_down'
      });
    }

    const feedback = new Feedback({
      user: req.user.id,
      rating,
      feedbackText: feedbackText?.slice(0, 1000),
      category: category || 'general',
      page,
      userAgent: req.headers['user-agent']
    });

    await feedback.save();

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
});

// GET /api/v1/feedback - Get all feedback (admin only)
router.get('/', auth, async (req, res) => {
  try {
    // Only superAdmin can view all feedback
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const {
      status,
      rating,
      category,
      limit = 50,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (rating) filter.rating = rating;
    if (category) filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [feedbacks, total] = await Promise.all([
      Feedback.find(filter)
        .populate('user', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Feedback.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        feedbacks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: error.message
    });
  }
});

// GET /api/v1/feedback/stats - Get feedback statistics (admin only)
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const [
      totalCount,
      thumbsUpCount,
      thumbsDownCount,
      statusCounts,
      categoryCounts,
      recentFeedback
    ] = await Promise.all([
      Feedback.countDocuments(),
      Feedback.countDocuments({ rating: 'thumbs_up' }),
      Feedback.countDocuments({ rating: 'thumbs_down' }),
      Feedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Feedback.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      Feedback.find()
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        total: totalCount,
        thumbsUp: thumbsUpCount,
        thumbsDown: thumbsDownCount,
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byCategory: categoryCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recent: recentFeedback
      }
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback statistics',
      error: error.message
    });
  }
});

// PATCH /api/v1/feedback/:id - Update feedback status (admin only)
router.patch('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { status, adminNotes } = req.body;

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    if (status) feedback.status = status;
    if (adminNotes !== undefined) feedback.adminNotes = adminNotes;

    await feedback.save();

    res.json({
      success: true,
      message: 'Feedback updated successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update feedback',
      error: error.message
    });
  }
});

// DELETE /api/v1/feedback/:id - Delete feedback (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    res.json({
      success: true,
      message: 'Feedback deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete feedback',
      error: error.message
    });
  }
});

module.exports = router;
