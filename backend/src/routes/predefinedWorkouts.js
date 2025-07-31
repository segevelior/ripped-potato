const express = require('express');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/predefined-workouts - Get all predefined workouts with filtering
router.get('/', async (req, res) => {
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

    let query = {};

    // Apply filters
    if (type) query.type = type;
    if (difficulty) query.difficulty = difficulty;
    if (maxDuration) query.durationMinutes = { ...query.durationMinutes, $lte: parseInt(maxDuration) };
    if (minDuration) query.durationMinutes = { ...query.durationMinutes, $gte: parseInt(minDuration) };
    if (equipment) query.equipment = { $in: equipment.split(',') };
    if (targetMuscles) query.targetMuscles = { $in: targetMuscles.split(',') };
    if (tags) query.tags = { $in: tags.split(',') };

    let workoutsQuery;
    
    if (popular === 'true') {
      workoutsQuery = PredefinedWorkout.findPopular(parseInt(limit));
    } else {
      workoutsQuery = PredefinedWorkout.find(query)
        .populate('createdBy', 'name')
        .populate('exercises.exerciseId', 'name muscles equipment')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));
    }

    const workouts = await workoutsQuery;
    
    const total = popular === 'true' ? workouts.length : await PredefinedWorkout.countDocuments(query);

    res.json({
      workouts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
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
router.get('/:id', async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findById(req.params.id)
      .populate('createdBy', 'name profile')
      .populate('exercises.exerciseId', 'name description muscles equipment difficulty');

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
      createdBy: req.user.id
    };

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

// PUT /api/predefined-workouts/:id - Update predefined workout (authenticated, only creator)
router.put('/:id', auth, async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // Check if user is the creator
    if (workout.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this workout' });
    }

    Object.assign(workout, req.body);
    await workout.save();

    await workout.populate('createdBy', 'name');
    await workout.populate('exercises.exerciseId', 'name muscles equipment');

    res.json(workout);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/predefined-workouts/:id - Delete predefined workout (authenticated, only creator)
router.delete('/:id', auth, async (req, res) => {
  try {
    const workout = await PredefinedWorkout.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Predefined workout not found' });
    }

    // Check if user is the creator
    if (workout.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this workout' });
    }

    await PredefinedWorkout.findByIdAndDelete(req.params.id);
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

    // Check if user already rated
    const existingRatingIndex = workout.ratings.findIndex(
      r => r.userId.toString() === req.user.id
    );

    if (existingRatingIndex > -1) {
      // Update existing rating
      workout.ratings[existingRatingIndex].rating = rating;
      workout.ratings[existingRatingIndex].date = new Date();
    } else {
      // Add new rating
      workout.ratings.push({
        userId: req.user.id,
        rating,
        date: new Date()
      });
    }

    await workout.save();
    res.json({ message: 'Rating submitted successfully', averageRating: workout.averageRating });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;