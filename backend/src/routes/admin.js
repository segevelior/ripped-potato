const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { adminAuth } = require('../middleware/admin');
const Exercise = require('../models/Exercise');
const Goal = require('../models/Goal');
const PredefinedWorkout = require('../models/PredefinedWorkout');

// All routes require authentication and admin role
router.use(auth);
router.use(adminAuth);

// @route   POST /api/v1/admin/exercises
// @desc    Create common exercise
// @access  Admin only
router.post('/exercises', async (req, res) => {
  try {
    const exercise = await Exercise.create({
      ...req.body,
      isCommon: true,
      createdBy: null // Common exercises don't have a specific creator
    });
    
    res.status(201).json({
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

// @route   PUT /api/v1/admin/exercises/:id
// @desc    Update common exercise
// @access  Admin only
router.put('/exercises/:id', async (req, res) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Common exercise not found'
      });
    }
    
    Object.assign(exercise, req.body);
    await exercise.save();
    
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

// @route   DELETE /api/v1/admin/exercises/:id
// @desc    Delete common exercise
// @access  Admin only
router.delete('/exercises/:id', async (req, res) => {
  try {
    const exercise = await Exercise.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: 'Common exercise not found'
      });
    }
    
    await exercise.deleteOne();
    
    res.json({
      success: true,
      message: 'Common exercise deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/v1/admin/goals
// @desc    Create common goal
// @access  Admin only
router.post('/goals', async (req, res) => {
  try {
    const goal = await Goal.create({
      ...req.body,
      isCommon: true,
      createdBy: null
    });
    
    res.status(201).json({
      success: true,
      data: goal
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/v1/admin/goals/:id
// @desc    Update common goal
// @access  Admin only
router.put('/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Common goal not found'
      });
    }
    
    Object.assign(goal, req.body);
    await goal.save();
    
    res.json({
      success: true,
      data: goal
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/v1/admin/goals/:id
// @desc    Delete common goal
// @access  Admin only
router.delete('/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Common goal not found'
      });
    }
    
    await goal.deleteOne();
    
    res.json({
      success: true,
      message: 'Common goal deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/v1/admin/predefined-workouts
// @desc    Create common predefined workout
// @access  Admin only
router.post('/predefined-workouts', async (req, res) => {
  try {
    const workout = await PredefinedWorkout.create({
      ...req.body,
      isCommon: true,
      createdBy: null
    });
    
    res.status(201).json({
      success: true,
      data: workout
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/v1/admin/predefined-workouts/:id
// @desc    Update common predefined workout
// @access  Admin only
router.put('/predefined-workouts/:id', async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Common predefined workout not found'
      });
    }
    
    Object.assign(workout, req.body);
    await workout.save();
    
    res.json({
      success: true,
      data: workout
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/v1/admin/predefined-workouts/:id
// @desc    Delete common predefined workout
// @access  Admin only
router.delete('/predefined-workouts/:id', async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findOne({
      _id: req.params.id,
      isCommon: true
    });
    
    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Common predefined workout not found'
      });
    }
    
    await workout.deleteOne();
    
    res.json({
      success: true,
      message: 'Common predefined workout deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/v1/admin/users/:userId/role
// @desc    Update user role
// @access  Admin only
router.post('/users/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be "user" or "admin"'
      });
    }
    
    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { role },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;