const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  moveEvent,
  startWorkout,
  completeWorkout,
  skipWorkout,
  getTodayEvents
} = require('../controllers/calendarController');
const { auth } = require('../middleware/auth');

// Validation middleware for creating events
const validateEvent = [
  body('date')
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('type')
    .optional()
    .isIn(['workout', 'rest', 'deload', 'event', 'milestone'])
    .withMessage('Invalid event type'),
  body('status')
    .optional()
    .isIn(['scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'])
    .withMessage('Invalid status')
];

// Validation middleware for updating events (all fields optional)
const validateEventUpdate = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be between 1 and 100 characters'),
  body('type')
    .optional()
    .isIn(['workout', 'rest', 'deload', 'event', 'milestone'])
    .withMessage('Invalid event type'),
  body('status')
    .optional()
    .isIn(['scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'])
    .withMessage('Invalid status')
];

// @route   GET /api/v1/calendar
// @desc    Get calendar events for date range
// @access  Private
router.get('/', auth, getEvents);

// @route   GET /api/v1/calendar/today
// @desc    Get today's calendar events
// @access  Private
router.get('/today', auth, getTodayEvents);

// @route   GET /api/v1/calendar/:id
// @desc    Get single calendar event
// @access  Private
router.get('/:id', auth, getEvent);

// @route   POST /api/v1/calendar
// @desc    Create calendar event
// @access  Private
router.post('/', auth, validateEvent, createEvent);

// @route   PUT /api/v1/calendar/:id
// @desc    Update calendar event
// @access  Private
router.put('/:id', auth, validateEventUpdate, updateEvent);

// @route   DELETE /api/v1/calendar/:id
// @desc    Delete calendar event
// @access  Private
router.delete('/:id', auth, deleteEvent);

// @route   PATCH /api/v1/calendar/:id/move
// @desc    Move event to different date (drag & drop)
// @access  Private
router.patch('/:id/move', auth, moveEvent);

// @route   POST /api/v1/calendar/:id/start
// @desc    Start a workout (creates workout log)
// @access  Private
router.post('/:id/start', auth, startWorkout);

// @route   POST /api/v1/calendar/:id/complete
// @desc    Complete a workout
// @access  Private
router.post('/:id/complete', auth, completeWorkout);

// @route   POST /api/v1/calendar/:id/skip
// @desc    Skip a workout
// @access  Private
router.post('/:id/skip', auth, skipWorkout);

module.exports = router;
