const express = require('express');
const router = express.Router();
const {
  getWorkouts,
  getWorkout,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  getWorkoutStats
} = require('../controllers/workoutController');
const { auth } = require('../middleware/auth');
const { validateWorkout } = require('../middleware/validation');

// @route   GET /api/v1/workouts
// @desc    Get user's workouts with optional filtering
// @access  Private (temporarily disabled for testing)
router.get('/', getWorkouts);

// @route   GET /api/v1/workouts/stats
// @desc    Get user workout statistics
// @access  Private (temporarily disabled for testing)
router.get('/stats', getWorkoutStats);

// @route   GET /api/v1/workouts/:id
// @desc    Get single workout by ID
// @access  Private (temporarily disabled for testing)
router.get('/:id', getWorkout);

// @route   POST /api/v1/workouts
// @desc    Create new workout
// @access  Private (temporarily disabled for testing)
router.post('/', validateWorkout, createWorkout);

// @route   PUT /api/v1/workouts/:id
// @desc    Update workout
// @access  Private (temporarily disabled for testing)
router.put('/:id', validateWorkout, updateWorkout);

// @route   DELETE /api/v1/workouts/:id
// @desc    Delete workout
// @access  Private (temporarily disabled for testing)
router.delete('/:id', deleteWorkout);

module.exports = router;