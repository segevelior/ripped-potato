const express = require('express');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const WorkoutService = require('../services/WorkoutService');
const { auth, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/predefined-workouts - Get all predefined workouts with filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      difficulty,
      tags,
      popular,
      limit = 20,
      page = 1
    } = req.query;

    let workouts;

    if (req.user) {
      // Get workouts with user modifications applied
      workouts = await WorkoutService.getWorkoutsForUser(req.user.id);
    } else {
      // Non-authenticated users only see common workouts
      workouts = await PredefinedWorkout.find({ isCommon: true })
        .populate('createdBy', 'name')
        .lean();
    }

    // Apply filters
    let filteredWorkouts = workouts;

    if (difficulty) {
      filteredWorkouts = filteredWorkouts.filter(w => w.difficulty_level === difficulty);
    }
    if (tags) {
      const tagList = tags.split(',');
      filteredWorkouts = filteredWorkouts.filter(w =>
        w.tags && w.tags.some(t => tagList.includes(t))
      );
    }

    // Sort workouts
    filteredWorkouts.sort((a, b) => {
      // Favorites first if user is authenticated
      if (req.user) {
        const aFav = a.userMetadata?.isFavorite || false;
        const bFav = b.userMetadata?.isFavorite || false;
        if (aFav !== bFav) return bFav - aFav;
      }
      // Then by popularity and ratings
      if (popular === 'true') {
        if (a.popularity !== b.popularity) return b.popularity - a.popularity;
        if (a.ratings?.average !== b.ratings?.average) {
          return (b.ratings?.average || 0) - (a.ratings?.average || 0);
        }
      }
      // Default to newest first
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedWorkouts = filteredWorkouts.slice(skip, skip + parseInt(limit));

    // Add 'id' field for frontend compatibility
    const workoutsWithId = paginatedWorkouts.map(w => ({
      ...w,
      id: w._id
    }));

    res.json(workoutsWithId);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/predefined-workouts/search/:term - Search predefined workouts
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { limit = 10 } = req.query;

    const workouts = await PredefinedWorkout.search(term)
      .populate('createdBy', 'name')
      .populate('blocks.exercises.exercise_id', 'name muscles')
      .limit(parseInt(limit));

    res.json(workouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/predefined-workouts/:id - Get specific predefined workout
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    let workout;

    if (req.user) {
      // Get workout with modifications for authenticated user
      workout = await WorkoutService.getWorkoutForUser(req.params.id, req.user.id);
    } else {
      // Non-authenticated users can only see common workouts
      workout = await PredefinedWorkout.findOne({
        _id: req.params.id,
        isCommon: true
      })
        .populate('createdBy', 'name profile')
        .lean();

      // Populate exercise details
      if (workout && workout.blocks) {
        const Exercise = require('../models/Exercise');
        for (let block of workout.blocks) {
          for (let ex of block.exercises) {
            const exerciseDetails = await Exercise.findById(ex.exercise_id);
            if (exerciseDetails) {
              ex.exercise = exerciseDetails;
              ex.exercise_name = exerciseDetails.name;
            }
          }
        }
      }
    }

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // Add 'id' field
    workout.id = workout._id;
    res.json(workout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/predefined-workouts - Create new predefined workout (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const workoutData = {
      ...req.body,
      createdBy: req.user.id,
      isCommon: false // User-created workouts are private by default
    };

    // Only superAdmin can create common workouts
    if (req.user.role === 'superAdmin' && req.body.isCommon === true) {
      workoutData.isCommon = true;
      workoutData.createdBy = null; // Common workouts don't have a specific creator
    }

    const workout = new PredefinedWorkout(workoutData);
    await workout.save();

    await workout.populate('createdBy', 'name');

    // Add 'id' field
    const workoutObj = workout.toObject();
    workoutObj.id = workoutObj._id;

    res.status(201).json(workoutObj);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/predefined-workouts/:id - Update predefined workout (authenticated)
router.put('/:id', auth, async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // SuperAdmin can edit any workout, including common ones
    if (req.user.role === 'superAdmin') {
      Object.assign(workout, req.body);
      await workout.save();

      await workout.populate('createdBy', 'name');
      await workout.populate('blocks.exercises.exercise_id', 'name muscles equipment');

      return res.json(workout);
    }

    // Check if user can edit this workout directly
    if (workout.canUserEdit(req.user.id)) {
      // User owns this workout - update directly
      Object.assign(workout, req.body);
      await workout.save();

      await workout.populate('createdBy', 'name');
      await workout.populate('blocks.exercises.exercise_id', 'name muscles equipment');

      res.json(workout);
    } else if (workout.isCommon || workout.createdBy?.toString() !== req.user.id) {
      // This is a common workout or another user's workout
      // Should use modification endpoint instead
      return res.status(403).json({
        error: 'Cannot edit this workout directly. Use modifications endpoint for common workouts.'
      });
    }
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/predefined-workouts/:id - Delete predefined workout (authenticated)
router.delete('/:id', auth, async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // SuperAdmin can delete any workout, including common ones
    if (req.user.role === 'superAdmin') {
      await workout.deleteOne();
      return res.json({ message: 'Predefined workout deleted successfully' });
    }

    // Regular users can only delete their own private workouts
    if (!workout.canUserEdit(req.user.id)) {
      return res.status(403).json({
        error: 'You can only delete your own workouts'
      });
    }

    // Prevent regular users from deleting common workouts
    if (workout.isCommon) {
      return res.status(403).json({
        error: 'Only superAdmin can delete common workouts'
      });
    }

    await workout.deleteOne();
    res.json({ message: 'Predefined workout deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/predefined-workouts/:id/rate - Rate a predefined workout (authenticated)
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const workout = await PredefinedWorkout.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // Use the model method to add rating
    await workout.addRating(rating);

    res.json({
      message: 'Rating submitted successfully',
      averageRating: workout.ratings.average,
      totalRatings: workout.ratings.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modification endpoints

// PUT /api/predefined-workouts/:id/modifications - Create or update workout modification
router.put('/:id/modifications', auth, async (req, res) => {
  try {
    const { modifications, metadata } = req.body;

    const modification = await WorkoutService.saveModification(
      req.user.id,
      req.params.id,
      modifications,
      metadata
    );

    // Return the workout with modifications applied
    const workout = await WorkoutService.getWorkoutForUser(req.params.id, req.user.id);

    res.json(workout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/predefined-workouts/:id/modifications - Remove workout modification (revert to original)
router.delete('/:id/modifications', auth, async (req, res) => {
  try {
    await WorkoutService.removeModification(req.user.id, req.params.id);

    // Return the original workout
    const workout = await WorkoutService.getWorkoutForUser(req.params.id, req.user.id);

    res.json(workout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/predefined-workouts/:id/favorite - Toggle favorite status
router.put('/:id/favorite', auth, async (req, res) => {
  try {
    const { isFavorite } = req.body;

    await WorkoutService.toggleFavorite(req.user.id, req.params.id, isFavorite);

    res.json({ success: true, isFavorite });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/predefined-workouts/:id/complete - Record workout completion
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const { totalWeight, completionTime } = req.body;

    const modification = await WorkoutService.recordCompletion(
      req.user.id,
      req.params.id,
      { totalWeight, completionTime }
    );

    res.json({
      success: true,
      timesCompleted: modification.metadata.timesCompleted,
      personalRecord: modification.metadata.personalRecord
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;