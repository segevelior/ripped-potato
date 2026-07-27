const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const SessionLog = require('../models/SessionLog');
const CalendarEvent = require('../models/CalendarEvent');
const Exercise = require('../models/Exercise');

// Helper to validate MongoDB ObjectId format
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
};

// Helper to normalize exercise name for matching
const normalizeExerciseName = (name) => {
  if (!name) return '';
  return name.toLowerCase().trim();
};

/**
 * Resolves exerciseId for a given exercise.
 * - If valid ObjectId is provided and exists in DB, use it
 * - Otherwise, try to find exercise by name (case-insensitive)
 * - Returns the ObjectId or null if not found
 */
const resolveExerciseId = async (exerciseId, exerciseName) => {
  if (isValidObjectId(exerciseId)) {
    const exists = await Exercise.exists({ _id: exerciseId });
    if (exists) {
      return new mongoose.Types.ObjectId(exerciseId);
    }
  }

  if (exerciseName) {
    const exercise = await Exercise.findOne({
      name: { $regex: new RegExp(`^${normalizeExerciseName(exerciseName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).select('_id');

    if (exercise) {
      return exercise._id;
    }
  }

  return null;
};

// Validation for creating session log
const validateSessionLog = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('discipline')
    .notEmpty()
    .withMessage('Session discipline is required'),
  body('startedAt')
    .isISO8601()
    .withMessage('Please provide a valid start time'),
  body('exercises')
    .isArray()
    .withMessage('Exercises must be an array')
];

// @desc    Get user's session logs
const getSessionLogs = async (req, res) => {
  try {
    const { days = 30, discipline, limit = 20 } = req.query;

    const logs = await SessionLog.getHistory(req.user._id, {
      days: parseInt(days),
      discipline,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('Get session logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting session logs'
    });
  }
};

// @desc    Get user session statistics
const getSessionLogStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await SessionLog.getUserStats(req.user._id, parseInt(days));

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get session stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting session stats'
    });
  }
};

// @desc    Get single session log
const getSessionLog = async (req, res) => {
  try {
    const log = await SessionLog.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('calendarEventId');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Session log not found'
      });
    }

    res.json({
      success: true,
      data: { log }
    });
  } catch (error) {
    console.error('Get session log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting session log'
    });
  }
};

// @desc    Create session log (TrainNow completion, MCP create tool)
const createSessionLog = async (req, res) => {
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
      discipline,
      startedAt,
      completedAt,
      actualDuration,
      exercises,
      perceivedDifficulty,
      mood,
      notes,
      createCalendarEvent = true
    } = req.body;

    // Resolve exercise IDs - lookup by name if ID is missing/invalid
    const resolvedExercises = await Promise.all(
      exercises.map(async (ex, i) => {
        const resolvedId = await resolveExerciseId(ex.exerciseId, ex.exerciseName);
        return {
          exerciseId: resolvedId, // Will be null if not found (that's OK)
          exerciseName: ex.exerciseName,
          order: i,
          sets: ex.sets || [],
          notes: ex.notes
        };
      })
    );

    const sessionLog = new SessionLog({
      userId: req.user._id,
      title,
      discipline: discipline.toLowerCase(),
      startedAt: new Date(startedAt),
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      actualDuration: actualDuration || Math.round((new Date(completedAt || Date.now()) - new Date(startedAt)) / 60000),
      exercises: resolvedExercises,
      perceivedDifficulty,
      mood,
      notes
    });

    await sessionLog.save();

    // Create a calendar event to show this session on the calendar
    let calendarEvent = null;
    if (createCalendarEvent) {
      calendarEvent = new CalendarEvent({
        userId: req.user._id,
        date: new Date(startedAt),
        title,
        type: 'session',
        status: 'completed',
        sessionLogId: sessionLog._id,
        sessionDetails: {
          discipline: discipline.toLowerCase(),
          durationMinutes: sessionLog.actualDuration,
          exercises: resolvedExercises.map(ex => ({
            exerciseId: ex.exerciseId, // Already resolved
            exerciseName: ex.exerciseName,
            sets: ex.sets
          })),
          mood,
          feedback: notes
        },
        completedAt: sessionLog.completedAt
      });

      await calendarEvent.save();

      // Link the calendar event back to the session log
      sessionLog.calendarEventId = calendarEvent._id;
      await sessionLog.save();
    }

    res.status(201).json({
      success: true,
      message: 'Session logged successfully',
      data: {
        log: sessionLog,
        calendarEvent
      }
    });
  } catch (error) {
    console.error('Create session log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating session log'
    });
  }
};

// @desc    Update session log (partial)
const updateSessionLog = async (req, res) => {
  try {
    const log = await SessionLog.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Session log not found'
      });
    }

    res.json({
      success: true,
      message: 'Session log updated',
      data: { log }
    });
  } catch (error) {
    console.error('Update session log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating session log'
    });
  }
};

// @desc    Delete session log (cascades its calendar event)
const deleteSessionLog = async (req, res) => {
  try {
    const log = await SessionLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Session log not found'
      });
    }

    if (log.calendarEventId) {
      await CalendarEvent.findByIdAndDelete(log.calendarEventId);
    }

    res.json({
      success: true,
      message: 'Session log deleted'
    });
  } catch (error) {
    console.error('Delete session log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting session log'
    });
  }
};

module.exports = {
  getSessionLogs,
  getSessionLogStats,
  getSessionLog,
  createSessionLog,
  updateSessionLog,
  deleteSessionLog,
  validateSessionLog
};
