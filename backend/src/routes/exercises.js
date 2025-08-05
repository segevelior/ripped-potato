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
// @access  Private
router.post('/', auth, validateExercise, createExercise);

// @route   PUT /api/v1/exercises/:id
// @desc    Update exercise
// @access  Private (only owner can update)
router.put('/:id', auth, validateExercise, updateExercise);

// @route   DELETE /api/v1/exercises/:id
// @desc    Delete exercise
// @access  Private (only owner can delete)
router.delete('/:id', auth, deleteExercise);

// Modification endpoints

// @route   PUT /api/v1/exercises/:id/modifications
// @desc    Create or update exercise modification
// @access  Private
router.put('/:id/modifications', auth, async (req, res) => {
  try {
    const ExerciseService = require('../services/ExerciseService');
    const { modifications, metadata } = req.body;
    
    const modification = await ExerciseService.saveModification(
      req.user.id,
      req.params.id,
      modifications,
      metadata
    );
    
    // Return the exercise with modifications applied
    const exercise = await ExerciseService.getExerciseForUser(req.params.id, req.user.id);
    
    res.json({
      success: true,
      data: exercise
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/v1/exercises/:id/modifications
// @desc    Remove exercise modification (revert to original)
// @access  Private
router.delete('/:id/modifications', auth, async (req, res) => {
  try {
    const ExerciseService = require('../services/ExerciseService');
    
    await ExerciseService.removeModification(req.user.id, req.params.id);
    
    // Return the original exercise
    const exercise = await ExerciseService.getExerciseForUser(req.params.id, req.user.id);
    
    res.json({
      success: true,
      data: exercise
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/v1/exercises/:id/favorite
// @desc    Toggle favorite status
// @access  Private
router.put('/:id/favorite', auth, async (req, res) => {
  try {
    const ExerciseService = require('../services/ExerciseService');
    const { isFavorite } = req.body;
    
    await ExerciseService.toggleFavorite(req.user.id, req.params.id, isFavorite);
    
    res.json({
      success: true,
      data: { isFavorite }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;