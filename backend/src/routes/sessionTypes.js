const express = require('express');
const SessionType = require('../models/SessionType');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/workout-types - Get all workout types with filtering
router.get('/', async (req, res) => {
  try {
    const { fitnessLevel, goal, timeConstraint } = req.query;

    let workoutTypes;
    
    if (fitnessLevel) {
      workoutTypes = await SessionType.getByFitnessLevel(fitnessLevel);
    } else if (goal) {
      workoutTypes = await SessionType.getByGoal(goal);
    } else if (timeConstraint) {
      workoutTypes = await SessionType.getByTimeConstraint(timeConstraint);
    } else {
      workoutTypes = await SessionType.find({ isActive: true })
        .sort({ displayName: 1 });
    }

    res.json(workoutTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/recommendations/:userLevel - Get workout type recommendations
router.get('/recommendations/:userLevel', async (req, res) => {
  try {
    const { userLevel } = req.params;
    const { goals, timeConstraint, limit = 5 } = req.query;

    const goalsArray = goals ? goals.split(',') : [];
    
    const recommendations = await SessionType.getRecommendations(
      userLevel,
      goalsArray,
      timeConstraint
    ).limit(parseInt(limit));

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/fitness-level/:level - Get workout types by fitness level
router.get('/fitness-level/:level', async (req, res) => {
  try {
    const { level } = req.params;
    const workoutTypes = await SessionType.getByFitnessLevel(level);
    res.json(workoutTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/goal/:goal - Get workout types by goal
router.get('/goal/:goal', async (req, res) => {
  try {
    const { goal } = req.params;
    const workoutTypes = await SessionType.getByGoal(goal);
    res.json(workoutTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/stats/goals - Get workout type statistics by goals
router.get('/stats/goals', async (req, res) => {
  try {
    const stats = await SessionType.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $unwind: '$suitableFor.goals'
      },
      {
        $group: {
          _id: '$suitableFor.goals',
          count: { $sum: 1 },
          workoutTypes: {
            $push: {
              name: '$name',
              displayName: '$displayName'
            }
          }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/stats/fitness-levels - Get workout type statistics by fitness levels
router.get('/stats/fitness-levels', async (req, res) => {
  try {
    const stats = await SessionType.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $unwind: '$suitableFor.fitnessLevels'
      },
      {
        $group: {
          _id: '$suitableFor.fitnessLevels',
          count: { $sum: 1 },
          workoutTypes: {
            $push: {
              name: '$name',
              displayName: '$displayName',
              characteristics: '$characteristics'
            }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workout-types/:id - Get specific workout type
router.get('/:id', async (req, res) => {
  try {
    const workoutType = await SessionType.findById(req.params.id);

    if (!workoutType) {
      return res.status(404).json({ error: 'Workout type not found' });
    }

    res.json(workoutType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workout-types - Create new workout type (authenticated, admin only)
router.post('/', auth, async (req, res) => {
  try {
    const workoutType = new SessionType(req.body);
    await workoutType.save();

    res.status(201).json(workoutType);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Workout type name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/workout-types/:id - Update workout type (authenticated, admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const workoutType = await SessionType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!workoutType) {
      return res.status(404).json({ error: 'Workout type not found' });
    }

    res.json(workoutType);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Workout type name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/workout-types/:id - Delete workout type (authenticated, admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const workoutType = await SessionType.findByIdAndDelete(req.params.id);

    if (!workoutType) {
      return res.status(404).json({ error: 'Workout type not found' });
    }

    res.json({ message: 'Workout type deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/workout-types/:id/toggle-active - Toggle workout type active status (authenticated, admin only)
router.put('/:id/toggle-active', auth, async (req, res) => {
  try {
    const workoutType = await SessionType.findById(req.params.id);

    if (!workoutType) {
      return res.status(404).json({ error: 'Workout type not found' });
    }

    workoutType.isActive = !workoutType.isActive;
    await workoutType.save();

    res.json(workoutType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workout-types/:id/check-suitability - Check if workout type is suitable for user
router.post('/:id/check-suitability', async (req, res) => {
  try {
    const { userLevel, goals = [], timeConstraint } = req.body;
    
    const workoutType = await SessionType.findById(req.params.id);

    if (!workoutType) {
      return res.status(404).json({ error: 'Workout type not found' });
    }

    const isSuitable = workoutType.isSuitableFor(userLevel, goals, timeConstraint);

    res.json({
      suitable: isSuitable,
      workoutType: {
        name: workoutType.name,
        displayName: workoutType.displayName,
        suitableFor: workoutType.suitableFor
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;