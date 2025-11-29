const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const WorkoutLog = require('../models/WorkoutLog');
const CalendarEvent = require('../models/CalendarEvent');
const { auth } = require('../middleware/auth');

// Validation for creating workout log
const validateWorkoutLog = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('type')
    .notEmpty()
    .withMessage('Workout type is required'),
  body('startedAt')
    .isISO8601()
    .withMessage('Please provide a valid start time'),
  body('exercises')
    .isArray()
    .withMessage('Exercises must be an array')
];

// @route   GET /api/v1/workout-logs
// @desc    Get user's workout logs
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { days = 30, type, limit = 20 } = req.query;

    const logs = await WorkoutLog.getHistory(req.user._id, {
      days: parseInt(days),
      type,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Get workout logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting workout logs'
    });
  }
});

// @route   GET /api/v1/workout-logs/stats
// @desc    Get user workout statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await WorkoutLog.getUserStats(req.user._id, parseInt(days));

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get workout stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting workout stats'
    });
  }
});

// @route   GET /api/v1/workout-logs/:id
// @desc    Get single workout log
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const log = await WorkoutLog.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('calendarEventId');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Workout log not found'
      });
    }

    res.json({
      success: true,
      data: { log }
    });
  } catch (error) {
    console.error('Get workout log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting workout log'
    });
  }
});

// @route   POST /api/v1/workout-logs
// @desc    Create workout log (from TrainNow completion)
// @access  Private
router.post('/', auth, validateWorkoutLog, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      title,
      type,
      startedAt,
      completedAt,
      actualDuration,
      exercises,
      perceivedDifficulty,
      mood,
      notes,
      createCalendarEvent = true
    } = req.body;

    // Create the workout log
    const workoutLog = new WorkoutLog({
      userId: req.user._id,
      title,
      type: type.toLowerCase(),
      startedAt: new Date(startedAt),
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      actualDuration: actualDuration || Math.round((new Date(completedAt || Date.now()) - new Date(startedAt)) / 60000),
      exercises: exercises.map((ex, i) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        order: i,
        sets: ex.sets || [],
        notes: ex.notes
      })),
      perceivedDifficulty,
      mood,
      notes
    });

    await workoutLog.save();

    // Create a calendar event to show this workout on the calendar
    let calendarEvent = null;
    if (createCalendarEvent) {
      calendarEvent = new CalendarEvent({
        userId: req.user._id,
        date: new Date(startedAt),
        title,
        type: 'workout',
        status: 'completed',
        workoutLogId: workoutLog._id,
        workoutDetails: {
          type: type.toLowerCase(),
          durationMinutes: workoutLog.actualDuration,
          exercises: exercises.map(ex => ({
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            sets: ex.sets
          })),
          // Include feedback from user
          mood,
          feedback: notes
        },
        completedAt: workoutLog.completedAt
      });

      await calendarEvent.save();

      // Link the calendar event back to the workout log
      workoutLog.calendarEventId = calendarEvent._id;
      await workoutLog.save();
    }

    res.status(201).json({
      success: true,
      message: 'Workout logged successfully',
      data: {
        log: workoutLog,
        calendarEvent
      }
    });
  } catch (error) {
    console.error('Create workout log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating workout log'
    });
  }
});

// @route   PUT /api/v1/workout-logs/:id
// @desc    Update workout log
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const log = await WorkoutLog.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Workout log not found'
      });
    }

    res.json({
      success: true,
      message: 'Workout log updated',
      data: { log }
    });
  } catch (error) {
    console.error('Update workout log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating workout log'
    });
  }
});

// @route   DELETE /api/v1/workout-logs/:id
// @desc    Delete workout log
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const log = await WorkoutLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Workout log not found'
      });
    }

    // Also delete the associated calendar event if exists
    if (log.calendarEventId) {
      await CalendarEvent.findByIdAndDelete(log.calendarEventId);
    }

    res.json({
      success: true,
      message: 'Workout log deleted'
    });
  } catch (error) {
    console.error('Delete workout log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting workout log'
    });
  }
});

module.exports = router;
