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

// Validation for creating workout log
const validateSessionLog = [
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

// @desc    Get user's workout logs
const getSessionLogs = async (req, res) => {
  try {
    const { days = 30, type, limit = 20 } = req.query;

    const logs = await SessionLog.getHistory(req.user._id, {
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
};

// @desc    Get user workout statistics
const getSessionLogStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await SessionLog.getUserStats(req.user._id, parseInt(days));

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
};

// @desc    Get single workout log
const getSessionLog = async (req, res) => {
  try {
    const log = await SessionLog.findOne({
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
};

// @desc    Create workout log (TrainNow completion, MCP create tool)
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

    // Derive the session interval honestly: never fall back to "now", which
    // would turn a session logged after the fact (e.g. yesterday's) into a
    // multi-hour workout.
    const startedAtDate = new Date(startedAt);
    let completedAtDate;
    let resolvedDuration = actualDuration;
    if (completedAt) {
      completedAtDate = new Date(completedAt);
      if (resolvedDuration === undefined || resolvedDuration === null) {
        resolvedDuration = Math.round((completedAtDate - startedAtDate) / 60000);
      }
    } else if (resolvedDuration !== undefined && resolvedDuration !== null) {
      completedAtDate = new Date(startedAtDate.getTime() + resolvedDuration * 60000);
    } else {
      // Nothing to go on — record a zero-length session rather than invent one.
      completedAtDate = startedAtDate;
      resolvedDuration = undefined;
    }

    const workoutLog = new SessionLog({
      userId: req.user._id,
      title,
      type: type.toLowerCase(),
      startedAt: startedAtDate,
      completedAt: completedAtDate,
      actualDuration: resolvedDuration,
      exercises: resolvedExercises,
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
        date: startedAtDate,
        title,
        type: 'workout',
        status: 'completed',
        workoutLogId: workoutLog._id,
        workoutDetails: {
          type: type.toLowerCase(),
          durationMinutes: workoutLog.actualDuration,
          exercises: resolvedExercises.map(ex => ({
            exerciseId: ex.exerciseId, // Already resolved
            exerciseName: ex.exerciseName,
            sets: ex.sets
          })),
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
};

// @desc    Update workout log (partial)
// Fields a client may change on a log. Everything else (userId,
// calendarEventId, _id, ...) is server-owned — spreading req.body verbatim
// into findOneAndUpdate would be a mass-assignment hole.
const UPDATABLE_LOG_FIELDS = [
  'title', 'type', 'startedAt', 'completedAt', 'actualDuration',
  'exercises', 'notes', 'perceivedDifficulty', 'mood'
];

const updateSessionLog = async (req, res) => {
  try {
    const update = {};
    for (const field of UPDATABLE_LOG_FIELDS) {
      if (req.body[field] !== undefined) update[field] = req.body[field];
    }

    // Same exercise-id resolution the create path does, so an update coming
    // from the MCP tool (names, maybe no ids) doesn't null out exerciseIds.
    if (Array.isArray(update.exercises)) {
      update.exercises = await Promise.all(
        update.exercises.map(async (ex, i) => ({
          exerciseId: await resolveExerciseId(ex.exerciseId, ex.exerciseName),
          exerciseName: ex.exerciseName,
          order: ex.order !== undefined ? ex.order : i,
          sets: ex.sets || [],
          notes: ex.notes
        }))
      );
    }

    const log = await SessionLog.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update,
      { new: true, runValidators: true }
    );

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Workout log not found'
      });
    }

    // Keep the linked calendar entry in step with the log; best-effort, the
    // event may have been deleted independently.
    if (log.calendarEventId) {
      const eventUpdate = {};
      if (update.title !== undefined) eventUpdate.title = log.title;
      if (update.startedAt !== undefined) eventUpdate.date = log.startedAt;
      if (update.completedAt !== undefined) eventUpdate.completedAt = log.completedAt;
      if (update.type !== undefined) eventUpdate['workoutDetails.type'] = log.type;
      if (update.actualDuration !== undefined) {
        eventUpdate['workoutDetails.durationMinutes'] = log.actualDuration;
      }
      if (update.exercises !== undefined) {
        eventUpdate['workoutDetails.exercises'] = (log.exercises || []).map(ex => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          sets: ex.sets
        }));
      }

      if (Object.keys(eventUpdate).length > 0) {
        try {
          // Scoped to the owner: the log's calendarEventId is server-set, but
          // never issue a cross-user write even if it were tampered with.
          await CalendarEvent.findOneAndUpdate(
            { _id: log.calendarEventId, userId: req.user._id },
            { $set: eventUpdate }
          );
        } catch (syncError) {
          console.error('Calendar event sync error:', syncError);
        }
      }
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
};

// @desc    Delete workout log (cascades its calendar event)
const deleteSessionLog = async (req, res) => {
  try {
    const log = await SessionLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Workout log not found'
      });
    }

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
