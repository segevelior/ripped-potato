const express = require('express');
const ExternalActivity = require('../models/ExternalActivity');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/external-activities - Get user's external activities (authenticated)
router.get('/', auth, async (req, res) => {
  try {
    const { 
      activityType, 
      source, 
      startDate, 
      endDate,
      limit = 20,
      page = 1 
    } = req.query;

    let query = { userId: req.user.id };

    // Apply filters
    if (activityType) query.activityType = activityType;
    if (source) query.source = source;
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const activities = await ExternalActivity.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await ExternalActivity.countDocuments(query);

    res.json({
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/external-activities/stats/overview - Get user's activity statistics (authenticated)
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const stats = await ExternalActivity.getUserStats(req.user.id, parseInt(days));
    
    // Calculate additional summary stats
    const totalStats = await ExternalActivity.aggregate([
      {
        $match: {
          userId: req.user.id,
          date: { 
            $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) 
          }
        }
      },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalDistance: { $sum: '$distance' },
          avgCalories: { $avg: '$metrics.calories' }
        }
      }
    ]);

    res.json({
      byType: stats,
      summary: totalStats[0] || {
        totalActivities: 0,
        totalDuration: 0,
        totalDistance: 0,
        avgCalories: 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/external-activities/date-range/:startDate/:endDate - Get activities by date range (authenticated)
router.get('/date-range/:startDate/:endDate', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    
    const activities = await ExternalActivity.getByDateRange(
      req.user.id,
      new Date(startDate),
      new Date(endDate)
    );

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/external-activities/types/summary - Get activity types summary (authenticated)
router.get('/types/summary', auth, async (req, res) => {
  try {
    const { days = 90 } = req.query;
    
    const summary = await ExternalActivity.aggregate([
      {
        $match: {
          userId: req.user.id,
          date: { 
            $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) 
          }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          totalDistance: { $sum: '$distance' },
          avgDuration: { $avg: '$duration' },
          lastActivity: { $max: '$date' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/external-activities/:id - Get specific external activity (authenticated)
router.get('/:id', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!activity) {
      return res.status(404).json({ error: 'External activity not found' });
    }

    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/external-activities - Create new external activity (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    // Check for duplicates if not manual entry
    if (req.body.source !== 'manual' && req.body.externalId) {
      const existing = await ExternalActivity.findDuplicate(
        req.body.source,
        req.body.externalId,
        req.user.id,
        new Date(req.body.date)
      );

      if (existing) {
        return res.status(400).json({ error: 'Activity already exists' });
      }
    }

    const activityData = {
      ...req.body,
      userId: req.user.id
    };

    const activity = new ExternalActivity(activityData);
    await activity.save();

    res.status(201).json(activity);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/external-activities/:id - Update external activity (authenticated)
router.put('/:id', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!activity) {
      return res.status(404).json({ error: 'External activity not found' });
    }

    res.json(activity);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/external-activities/:id - Delete external activity (authenticated)
router.delete('/:id', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!activity) {
      return res.status(404).json({ error: 'External activity not found' });
    }

    res.json({ message: 'External activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/external-activities/:id/sync - Mark activity for sync (authenticated)
router.post('/:id/sync', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!activity) {
      return res.status(404).json({ error: 'External activity not found' });
    }

    if (activity.source === 'manual') {
      return res.status(400).json({ error: 'Manual activities cannot be synced' });
    }

    await activity.markForSync();
    res.json({ message: 'Activity marked for sync', activity });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;