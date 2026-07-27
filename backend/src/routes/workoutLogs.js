const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getWorkoutLogs,
  getWorkoutLogStats,
  getWorkoutLog,
  createWorkoutLog,
  updateWorkoutLog,
  deleteWorkoutLog,
  validateWorkoutLog
} = require('../controllers/workoutLogController');

// @route   GET /api/v1/workout-logs
router.get('/', auth, getWorkoutLogs);

// @route   GET /api/v1/workout-logs/stats
router.get('/stats', auth, getWorkoutLogStats);

// @route   GET /api/v1/workout-logs/:id
router.get('/:id', auth, getWorkoutLog);

// @route   POST /api/v1/workout-logs
router.post('/', auth, validateWorkoutLog, createWorkoutLog);

// @route   PUT /api/v1/workout-logs/:id
router.put('/:id', auth, updateWorkoutLog);

// @route   DELETE /api/v1/workout-logs/:id
router.delete('/:id', auth, deleteWorkoutLog);

module.exports = router;
