const Workout = require('../models/Workout');
const Exercise = require('../models/Exercise');
const { validationResult } = require('express-validator');

// Get user's workouts with optional date filtering
const getWorkouts = async (req, res) => {
  try {
    const { startDate, endDate, status, type, page = 1, limit = 20 } = req.query;
    
    let query = { userId: req.user._id };
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    // Type filter
    if (type) {
      query.type = type;
    }

    const skip = (page - 1) * limit;
    const workouts = await Workout.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('exercises.exerciseId', 'name muscles');

    const total = await Workout.countDocuments(query);

    res.json({
      success: true,
      data: {
        workouts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get workouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting workouts'
    });
  }
};

// Get single workout by ID
const getWorkout = async (req, res) => {
  try {
    const workout = await Workout.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('exercises.exerciseId', 'name muscles equipment strain');
    
    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    res.json({
      success: true,
      data: { workout }
    });
  } catch (error) {
    console.error('Get workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting workout'
    });
  }
};

// Create new workout
const createWorkout = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    // Validate exercise references and populate exercise names
    if (req.body.exercises && req.body.exercises.length > 0) {
      for (let exerciseSet of req.body.exercises) {
        const exercise = await Exercise.findById(exerciseSet.exerciseId);
        if (!exercise) {
          return res.status(400).json({
            success: false,
            message: `Exercise not found: ${exerciseSet.exerciseId}`
          });
        }
        exerciseSet.exerciseName = exercise.name;
      }
    }

    const workoutData = {
      ...req.body,
      userId: req.user._id
    };

    const workout = new Workout(workoutData);
    await workout.save();
    await workout.populate('exercises.exerciseId', 'name muscles');

    res.status(201).json({
      success: true,
      message: 'Workout created successfully',
      data: { workout }
    });
  } catch (error) {
    console.error('Create workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating workout'
    });
  }
};

// Update workout
const updateWorkout = async (req, res) => {
  try {
    const workout = await Workout.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    // Validate exercise references if exercises are being updated
    if (req.body.exercises && req.body.exercises.length > 0) {
      for (let exerciseSet of req.body.exercises) {
        if (exerciseSet.exerciseId) {
          const exercise = await Exercise.findById(exerciseSet.exerciseId);
          if (!exercise) {
            return res.status(400).json({
              success: false,
              message: `Exercise not found: ${exerciseSet.exerciseId}`
            });
          }
          exerciseSet.exerciseName = exercise.name;
        }
      }
    }

    const updatedWorkout = await Workout.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('exercises.exerciseId', 'name muscles');

    res.json({
      success: true,
      message: 'Workout updated successfully',
      data: { workout: updatedWorkout }
    });
  } catch (error) {
    console.error('Update workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating workout'
    });
  }
};

// Delete workout
const deleteWorkout = async (req, res) => {
  try {
    const workout = await Workout.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Workout not found'
      });
    }

    res.json({
      success: true,
      message: 'Workout deleted successfully'
    });
  } catch (error) {
    console.error('Delete workout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting workout'
    });
  }
};

// Get user workout stats
const getWorkoutStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await Workout.getUserStats(req.user._id, parseInt(days));

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

module.exports = {
  getWorkouts,
  getWorkout,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  getWorkoutStats
};