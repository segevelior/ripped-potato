const Exercise = require('../models/Exercise');
const ExerciseService = require('../services/ExerciseService');
const { validationResult } = require('express-validator');

// Get all exercises with optional filtering
const getExercises = async (req, res) => {
  try {
    const { muscle, discipline, equipment, difficulty, search, page = 1, limit = 50 } = req.query;
    
    // If user is authenticated, get exercises with modifications applied
    let exercises;
    if (req.user) {
      exercises = await ExerciseService.getExercisesForUser(req.user.id);
    } else {
      // Non-authenticated users only see common exercises
      const commonExercises = await Exercise.find({ isCommon: true }).lean();
      exercises = commonExercises.map(ex => ({
        ...ex,
        isCommon: true,
        isPrivate: false,
        canEdit: false
      }));
    }
    
    // Apply filters in memory (since we need to filter after modifications are applied)
    let filteredExercises = exercises;
    
    if (muscle) {
      const muscles = muscle.split(',');
      filteredExercises = filteredExercises.filter(ex => 
        ex.muscles.some(m => muscles.includes(m)) ||
        (ex.secondaryMuscles && ex.secondaryMuscles.some(m => muscles.includes(m)))
      );
    }
    
    if (discipline) {
      const disciplines = discipline.split(',');
      filteredExercises = filteredExercises.filter(ex =>
        ex.discipline.some(d => disciplines.includes(d))
      );
    }
    
    if (difficulty) {
      filteredExercises = filteredExercises.filter(ex => ex.difficulty === difficulty);
    }
    
    if (equipment) {
      const equipmentList = equipment.split(',');
      if (equipmentList.includes('none')) {
        filteredExercises = filteredExercises.filter(ex => 
          !ex.equipment || ex.equipment.length === 0
        );
      } else {
        filteredExercises = filteredExercises.filter(ex =>
          ex.equipment && ex.equipment.some(e => equipmentList.includes(e))
        );
      }
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredExercises = filteredExercises.filter(ex =>
        ex.name.toLowerCase().includes(searchLower) ||
        (ex.description && ex.description.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort exercises
    filteredExercises.sort((a, b) => {
      // Favorites first if user is authenticated
      if (req.user) {
        const aFav = a.userMetadata?.isFavorite || false;
        const bFav = b.userMetadata?.isFavorite || false;
        if (aFav !== bFav) return bFav - aFav;
      }
      return a.name.localeCompare(b.name);
    });
    
    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedExercises = filteredExercises.slice(skip, skip + parseInt(limit));
    const total = filteredExercises.length;

    res.json({
      success: true,
      data: {
        exercises: paginatedExercises,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get exercises error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting exercises'
    });
  }
};

// Get single exercise by ID
const getExercise = async (req, res) => {
  try {
    let exercise;
    
    if (req.user) {
      // Get exercise with modifications for authenticated user
      exercise = await ExerciseService.getExerciseForUser(req.params.id, req.user.id);
    } else {
      // Non-authenticated users can only see common exercises
      exercise = await Exercise.findOne({
        _id: req.params.id,
        isCommon: true
      }).lean();
    }
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found'
      });
    }

    res.json({
      success: true,
      data: exercise
    });
  } catch (error) {
    console.error('Get exercise error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting exercise'
    });
  }
};

// Create new exercise
const createExercise = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const exerciseData = {
      ...req.body,
      createdBy: req.user.id,
      isCommon: false // User-created exercises are private by default
    };
    
    // Admin can create common exercises
    if (req.user.role === 'admin' && req.body.isCommon === true) {
      exerciseData.isCommon = true;
      exerciseData.createdBy = null; // Common exercises don't have a specific creator
    }

    const exercise = await Exercise.create(exerciseData);

    res.status(201).json({
      success: true,
      data: exercise
    });
  } catch (error) {
    console.error('Create exercise error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating exercise'
    });
  }
};

// Update exercise
const updateExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found'
      });
    }
    
    // Check if user can edit this exercise directly
    if (exercise.canUserEdit(req.user.id)) {
      // User owns this exercise - update directly
      Object.assign(exercise, req.body);
      await exercise.save();
      
      res.json({
        success: true,
        data: exercise
      });
    } else if (exercise.isCommon || exercise.createdBy.toString() !== req.user.id) {
      // This is a common exercise or another user's exercise
      // Should use modification endpoint instead
      return res.status(403).json({
        success: false,
        message: 'Cannot edit this exercise directly. Use modifications endpoint for common exercises.'
      });
    }
  } catch (error) {
    console.error('Update exercise error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating exercise'
    });
  }
};

// Delete exercise
const deleteExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found'
      });
    }

    // Only the owner can delete their private exercises
    if (!exercise.canUserEdit(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own exercises'
      });
    }

    await exercise.deleteOne();

    res.json({
      success: true,
      message: 'Exercise deleted successfully'
    });
  } catch (error) {
    console.error('Delete exercise error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting exercise'
    });
  }
};

module.exports = {
  getExercises,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise
};