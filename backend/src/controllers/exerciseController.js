const Exercise = require('../models/Exercise');
const { validationResult } = require('express-validator');

// Get all exercises with optional filtering
const getExercises = async (req, res) => {
  try {
    const { muscle, discipline, equipment, difficulty, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Filter by ownership and common exercises
    if (req.user) {
      // Authenticated users see common exercises + their own
      query.$or = [
        { isCommon: true },
        { createdBy: req.user.id }
      ];
    } else {
      // Non-authenticated users only see common exercises
      query.isCommon = true;
    }
    
    // Build query filters
    if (muscle) {
      const muscleFilter = {
        $or: [
          { muscles: { $in: muscle.split(',') } },
          { secondaryMuscles: { $in: muscle.split(',') } }
        ]
      };
      // Combine with ownership filter
      query = { $and: [query, muscleFilter] };
    }
    
    if (discipline) {
      query.discipline = { $in: discipline.split(',') };
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (equipment) {
      const equipmentList = equipment.split(',');
      if (equipmentList.includes('none')) {
        query.equipment = { $size: 0 };
      } else {
        query.equipment = { $in: equipmentList };
      }
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const exercises = await Exercise.find(query)
      .sort(search ? { score: { $meta: 'textScore' } } : { name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name');

    const total = await Exercise.countDocuments(query);

    res.json({
      success: true,
      data: {
        exercises,
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
    const exercise = await Exercise.findById(req.params.id).populate('createdBy', 'name');
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Exercise not found'
      });
    }

    res.json({
      success: true,
      data: { exercise }
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const exerciseData = {
      ...req.body,
      isCustom: true,
      createdBy: req.user ? req.user.id || req.user._id : null // Handle both id formats
    };

    const exercise = new Exercise(exerciseData);
    await exercise.save();
    await exercise.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Exercise created successfully',
      data: { exercise }
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

    // Check if user owns the exercise or it's a system exercise
    // Skip ownership check if exercise has no owner (created when auth was disabled)
    if (exercise.createdBy && req.user && exercise.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this exercise'
      });
    }

    const updatedExercise = await Exercise.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name');

    res.json({
      success: true,
      message: 'Exercise updated successfully',
      data: { exercise: updatedExercise }
    });
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

    // Check if user owns the exercise
    // Skip ownership check if exercise has no owner (created when auth was disabled)
    if (exercise.createdBy && req.user && exercise.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this exercise'
      });
    }

    await Exercise.findByIdAndDelete(req.params.id);

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