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
// @access  Private
router.get('/', auth, getWorkouts);

// @route   GET /api/v1/workouts/stats
// @desc    Get user workout statistics
// @access  Private
router.get('/stats', auth, getWorkoutStats);

// @route   GET /api/v1/workouts/:id
// @desc    Get single workout by ID
// @access  Private
router.get('/:id', auth, getWorkout);

// @route   POST /api/v1/workouts
// @desc    Create new workout
// @access  Private
router.post('/', auth, validateWorkout, createWorkout);

// @route   PUT /api/v1/workouts/:id
// @desc    Update workout
// @access  Private
router.put('/:id', auth, validateWorkout, updateWorkout);

// @route   DELETE /api/v1/workouts/:id
// @desc    Delete workout
// @access  Private
router.delete('/:id', auth, deleteWorkout);

module.exports = router;