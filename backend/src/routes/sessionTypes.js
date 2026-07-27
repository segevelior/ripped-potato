const express = require('express');
const SessionType = require('../models/SessionType');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/v1/session-types - Get all session types with filtering
router.get('/', async (req, res) => {
  try {
    const { fitnessLevel, goal, timeConstraint } = req.query;

    let sessionTypes;
    
    if (fitnessLevel) {
      sessionTypes = await SessionType.getByFitnessLevel(fitnessLevel);
    } else if (goal) {
      sessionTypes = await SessionType.getByGoal(goal);
    } else if (timeConstraint) {
      sessionTypes = await SessionType.getByTimeConstraint(timeConstraint);
    } else {
      sessionTypes = await SessionType.find({ isActive: true })
        .sort({ displayName: 1 });
    }

    res.json(sessionTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/session-types/recommendations/:userLevel - Get session type recommendations
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

// GET /api/v1/session-types/fitness-level/:level - Get session types by fitness level
router.get('/fitness-level/:level', async (req, res) => {
  try {
    const { level } = req.params;
    const sessionTypes = await SessionType.getByFitnessLevel(level);
    res.json(sessionTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/session-types/goal/:goal - Get session types by goal
router.get('/goal/:goal', async (req, res) => {
  try {
    const { goal } = req.params;
    const sessionTypes = await SessionType.getByGoal(goal);
    res.json(sessionTypes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/session-types/stats/goals - Get session type statistics by goals
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
          sessionTypes: {
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

// GET /api/v1/session-types/stats/fitness-levels - Get session type statistics by fitness levels
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
          sessionTypes: {
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

// GET /api/v1/session-types/:id - Get specific session type
router.get('/:id', async (req, res) => {
  try {
    const sessionType = await SessionType.findById(req.params.id);

    if (!sessionType) {
      return res.status(404).json({ error: 'Session type not found' });
    }

    res.json(sessionType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/session-types - Create new session type (authenticated, admin only)
router.post('/', auth, async (req, res) => {
  try {
    const sessionType = new SessionType(req.body);
    await sessionType.save();

    res.status(201).json(sessionType);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Session type name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/session-types/:id - Update session type (authenticated, admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const sessionType = await SessionType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!sessionType) {
      return res.status(404).json({ error: 'Session type not found' });
    }

    res.json(sessionType);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Session type name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/session-types/:id - Delete session type (authenticated, admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const sessionType = await SessionType.findByIdAndDelete(req.params.id);

    if (!sessionType) {
      return res.status(404).json({ error: 'Session type not found' });
    }

    res.json({ message: 'Session type deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/session-types/:id/toggle-active - Toggle session type active status (authenticated, admin only)
router.put('/:id/toggle-active', auth, async (req, res) => {
  try {
    const sessionType = await SessionType.findById(req.params.id);

    if (!sessionType) {
      return res.status(404).json({ error: 'Session type not found' });
    }

    sessionType.isActive = !sessionType.isActive;
    await sessionType.save();

    res.json(sessionType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/session-types/:id/check-suitability - Check if session type is suitable for user
router.post('/:id/check-suitability', async (req, res) => {
  try {
    const { userLevel, goals = [], timeConstraint } = req.body;
    
    const sessionType = await SessionType.findById(req.params.id);

    if (!sessionType) {
      return res.status(404).json({ error: 'Session type not found' });
    }

    const isSuitable = sessionType.isSuitableFor(userLevel, goals, timeConstraint);

    res.json({
      suitable: isSuitable,
      sessionType: {
        name: sessionType.name,
        displayName: sessionType.displayName,
        suitableFor: sessionType.suitableFor
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;