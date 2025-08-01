const express = require('express');
const router = express.Router();
const {
  getExercises,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise
} = require('../controllers/exerciseController');
const { auth, optionalAuth } = require('../middleware/auth');
const { validateExercise } = require('../middleware/validation');

// @route   GET /api/v1/exercises
// @desc    Get all exercises with optional filtering
// @access  Public (but can show user-specific data if authenticated)
router.get('/', optionalAuth, getExercises);

// @route   GET /api/v1/exercises/:id
// @desc    Get single exercise by ID
// @access  Public
router.get('/:id', getExercise);

// @route   POST /api/v1/exercises
// @desc    Create new exercise
// @access  Private (temporarily disabled for testing)
router.post('/', validateExercise, createExercise);

// @route   PUT /api/v1/exercises/:id
// @desc    Update exercise
// @access  Private (temporarily disabled for testing)
router.put('/:id', validateExercise, updateExercise);

// @route   DELETE /api/v1/exercises/:id
// @desc    Delete exercise
// @access  Private (temporarily disabled for testing)
router.delete('/:id', deleteExercise);

module.exports = router;