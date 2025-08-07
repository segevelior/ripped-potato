const express = require('express');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const WorkoutService = require('../services/WorkoutService');
const { auth, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/predefined-workouts - Get all predefined workouts with filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      type, 
      difficulty, 
      maxDuration, 
      minDuration, 
      equipment, 
      targetMuscles, 
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
        .populate({
          path: 'exercises.exerciseId',
          select: 'name muscles equipment description difficulty'
        })
        .lean();
    }

    // Apply filters in memory (since we need to filter after modifications are applied)
    let filteredWorkouts = workouts;
    
    if (type) {
      filteredWorkouts = filteredWorkouts.filter(w => w.type === type);
    }
    if (difficulty) {
      filteredWorkouts = filteredWorkouts.filter(w => w.difficulty === difficulty);
    }
    if (maxDuration) {
      filteredWorkouts = filteredWorkouts.filter(w => w.durationMinutes <= parseInt(maxDuration));
    }
    if (minDuration) {
      filteredWorkouts = filteredWorkouts.filter(w => w.durationMinutes >= parseInt(minDuration));
    }
    if (equipment) {
      const equipmentList = equipment.split(',');
      filteredWorkouts = filteredWorkouts.filter(w => 
        w.equipment && w.equipment.some(e => equipmentList.includes(e))
      );
    }
    if (targetMuscles) {
      const muscleList = targetMuscles.split(',');
      filteredWorkouts = filteredWorkouts.filter(w => 
        w.targetMuscles.some(m => muscleList.includes(m))
      );
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
    const total = filteredWorkouts.length;

    // Transform workouts to match frontend expected format
    const transformedWorkouts = paginatedWorkouts.map(workout => {
      // Transform exercises to include populated data
      const transformedExercises = (workout.exercises || []).map(ex => ({
        id: ex.exerciseId?._id || ex.exerciseId,
        exercise_name: ex.exerciseId?.name || ex.exerciseName || 'Unknown Exercise',
        name: ex.exerciseId?.name || ex.exerciseName || 'Unknown Exercise',
        muscles: ex.exerciseId?.muscles || [],
        equipment: ex.exerciseId?.equipment || [],
        discipline: ex.exerciseId?.discipline || [],
        strain: ex.exerciseId?.strain || {},
        description: ex.exerciseId?.description || '',
        sets: ex.sets || [],
        order: ex.order,
        notes: ex.notes,
        volume: ex.sets && ex.sets.length > 0 ? 
          `${ex.sets.length}x${ex.sets[0].reps || ex.sets[0].time || 10}` : '3x10',
        rest: ex.sets && ex.sets[0] ? `${ex.sets[0].restSeconds || 60}s` : '60s',
        // Include the full exercise object if populated
        exercise: ex.exerciseId
      }));

      return {
        id: workout._id,
        name: workout.title,
        goal: workout.description,
        difficulty_level: workout.difficulty,
        duration_minutes: workout.durationMinutes,
        primary_disciplines: workout.targetMuscles,
        blocks: transformedExercises.length > 0 ? [{
          name: "Main Block",
          exercises: transformedExercises
        }] : [],
        // Keep original fields for backward compatibility
        ...workout,
        exercises: transformedExercises
      };
    });

    // Return just the array for compatibility with the frontend SDK
    res.json(transformedWorkouts);
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
      .populate('exercises.exerciseId', 'name muscles')
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
      .populate('exercises.exerciseId', 'name description muscles equipment difficulty')
      .lean();
    }

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

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
    
    // Admin can create common workouts
    if (req.user.role === 'admin' && req.body.isCommon === true) {
      workoutData.isCommon = true;
      workoutData.createdBy = null; // Common workouts don't have a specific creator
    }

    const workout = new PredefinedWorkout(workoutData);
    await workout.save();

    await workout.populate('createdBy', 'name');
    await workout.populate('exercises.exerciseId', 'name muscles equipment');

    res.status(201).json(workout);
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

    // Check if user can edit this workout directly
    if (workout.canUserEdit(req.user.id)) {
      // User owns this workout - update directly
      Object.assign(workout, req.body);
      await workout.save();
      
      await workout.populate('createdBy', 'name');
      await workout.populate('exercises.exerciseId', 'name muscles equipment');
      
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

    // Only the owner can delete their private workouts
    if (!workout.canUserEdit(req.user.id)) {
      return res.status(403).json({ 
        error: 'You can only delete your own workouts' 
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