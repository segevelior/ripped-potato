const express = require('express');
const mongoose = require('mongoose');
const ExternalActivity = require('../models/ExternalActivity');
const CalendarEvent = require('../models/CalendarEvent');
const StravaIntegrationService = require('../services/StravaIntegrationService');
const ActivityMatchingService = require('../services/activityMatchingService');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/v1/external-activities
 * Get user's external activities with filters and pagination
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      source,
      sportType,
      startDate,
      endDate,
      limit = 20,
      page = 1,
      sort = '-startDate'
    } = req.query;

    // Build query
    const query = { userId: req.user.id };

    if (source) query.source = source;
    if (sportType) query.sportType = sportType;

    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const activities = await ExternalActivity.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-rawData'); // Exclude raw data for list view

    const total = await ExternalActivity.countDocuments(query);

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get external activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activities',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/external-activities/stats
 * Get activity statistics
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await ExternalActivity.getUserStats(req.user.id, parseInt(days));

    // Calculate totals
    const totals = await ExternalActivity.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          startDate: {
            $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          totalMovingTime: { $sum: '$movingTime' },
          totalDistance: { $sum: '$distance' },
          totalElevation: { $sum: '$elevationGain' },
          totalCalories: { $sum: '$calories' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        byType: stats,
        totals: totals[0] || {
          totalActivities: 0,
          totalMovingTime: 0,
          totalDistance: 0,
          totalElevation: 0,
          totalCalories: 0
        },
        period: {
          days: parseInt(days),
          startDate: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000),
          endDate: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Get activity stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity stats',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/external-activities/sport-types
 * Get list of sport types with counts
 */
router.get('/sport-types', auth, async (req, res) => {
  try {
    const sportTypes = await ExternalActivity.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: '$sportType',
          count: { $sum: 1 },
          lastActivity: { $max: '$startDate' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: sportTypes.map(st => ({
        sportType: st._id,
        count: st.count,
        lastActivity: st.lastActivity
      }))
    });

  } catch (error) {
    console.error('Get sport types error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sport types',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/external-activities/recent
 * Get recent activities (for AI context)
 */
router.get('/recent', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const activities = await ExternalActivity.getRecentForContext(
      req.user.id,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent activities',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/external-activities/:id
 * Get single activity by ID
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    res.json({
      success: true,
      data: activity
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/external-activities/:id/match
 * Merge this activity into a calendar event the user picked. Completed
 * events are allowed on purpose — attaching Strava evidence to an
 * app-logged session is the legitimate double-record resolution.
 */
router.post('/:id/match', auth, async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: 'eventId is required' });
    }

    const activity = await ExternalActivity.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    const event = await CalendarEvent.findOne({
      _id: eventId,
      userId: req.user.id,
      type: 'session'
    }).lean();
    if (!event) {
      return res.status(404).json({ success: false, message: 'Calendar event not found' });
    }
    if (event.externalActivityId && String(event.externalActivityId) !== String(activity._id)) {
      return res.status(409).json({
        success: false,
        message: 'That event is already linked to another activity'
      });
    }

    await ActivityMatchingService.mergeActivityIntoEvent(activity, event, {
      actor: 'user',
      matchStatus: 'confirmed',
      action: 'user_merge'
    });

    res.json({ success: true, message: 'Activity merged into event', data: { eventId: event._id } });
  } catch (error) {
    console.error('Match activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to merge activity',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/external-activities/:id/unmatch
 * Undo a merge: restore the planned event, put the activity back on the
 * calendar as its own entry, and pin it 'separate' so it is never re-matched.
 */
router.post('/:id/unmatch', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).lean();
    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    const linked = await CalendarEvent.findOne({
      userId: req.user.id,
      externalActivityId: activity._id
    }).lean();
    if (!linked || linked.sessionDetails?.source !== 'strava-matched') {
      return res.status(400).json({
        success: false,
        message: 'Activity is not merged into a planned event'
      });
    }

    const discipline = StravaIntegrationService.mapStravaTypeToDiscipline(activity.sportType);
    await ActivityMatchingService.unmergeActivity(activity, discipline, {
      actor: 'user',
      action: 'user_unmerge'
    });

    res.json({ success: true, message: 'Activity un-merged' });
  } catch (error) {
    console.error('Unmatch activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to un-merge activity',
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/external-activities/:id
 * Delete an activity
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const activity = await ExternalActivity.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    // Clean up the calendar side immediately (mirrors deleted, merged
    // planned events survive with the link severed) instead of waiting for
    // the consistency job.
    await StravaIntegrationService.deleteCalendarEventForActivity(activity._id, req.user.id, activity);

    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });

  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity',
      error: error.message
    });
  }
});

module.exports = router;
