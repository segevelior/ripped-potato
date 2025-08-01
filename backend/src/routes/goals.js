const express = require('express');
const Goal = require('../models/Goal');
const UserGoalProgress = require('../models/UserGoalProgress');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/goals - Get all goals with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      difficulty, 
      discipline, 
      beginner,
      maxWeeks,
      minWeeks,
      limit = 20,
      page = 1 
    } = req.query;

    let query = {};

    // Apply filters
    if (category) query.category = category;
    if (difficulty) query.difficultyLevel = difficulty;
    if (discipline) query.discipline = { $in: discipline.split(',') };
    if (maxWeeks) query.estimatedWeeks = { ...query.estimatedWeeks, $lte: parseInt(maxWeeks) };
    if (minWeeks) query.estimatedWeeks = { ...query.estimatedWeeks, $gte: parseInt(minWeeks) };

    let goalsQuery;
    
    if (beginner === 'true') {
      goalsQuery = Goal.findBeginnerFriendly();
    } else {
      goalsQuery = Goal.find(query)
        .populate('recommendedExercises', 'name muscles equipment')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));
    }

    const goals = await goalsQuery;
    
    const total = beginner === 'true' ? goals.length : await Goal.countDocuments(query);

    res.json({
      goals,
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

// GET /api/goals/user/progress - Get user's goal progress (authenticated)
router.get('/user/progress', auth, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = { userId: req.user.id };
    if (status) query.status = status;

    const progress = await UserGoalProgress.find(query)
      .populate('goalId', 'name description category difficultyLevel estimatedWeeks milestones')
      .sort({ startedAt: -1 });

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/goals/user/stats - Get user's goal statistics (authenticated)
router.get('/user/stats', auth, async (req, res) => {
  try {
    const stats = await UserGoalProgress.getUserStats(req.user.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/goals/search/:term - Search goals
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { limit = 10 } = req.query;

    const goals = await Goal.search(term)
      .populate('recommendedExercises', 'name muscles')
      .limit(parseInt(limit));

    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/goals/:id - Get specific goal
router.get('/:id', async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id)
      .populate('recommendedExercises', 'name description muscles equipment difficulty');

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/goals - Create new goal (authenticated, admin only for now)
router.post('/', auth, async (req, res) => {
  try {
    const goal = new Goal(req.body);
    await goal.save();

    await goal.populate('recommendedExercises', 'name muscles equipment');

    res.status(201).json(goal);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/goals/:id - Update goal (authenticated, admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('recommendedExercises', 'name muscles equipment');

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json(goal);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/goals/:id - Delete goal (authenticated, admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findByIdAndDelete(req.params.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Also delete any user progress for this goal
    await UserGoalProgress.deleteMany({ goalId: req.params.id });

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/goals/:id/start - Start pursuing a goal (authenticated)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const { targetDate, motivation } = req.body;
    
    const goal = await Goal.findById(req.params.id);
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Check if user already has this goal active
    const existingProgress = await UserGoalProgress.findOne({
      userId: req.user.id,
      goalId: req.params.id,
      status: { $in: ['active', 'paused'] }
    });

    if (existingProgress) {
      return res.status(400).json({ error: 'Goal already active for this user' });
    }

    // Create milestone progress entries
    const milestoneProgress = goal.milestones.map((milestone, index) => ({
      milestoneId: milestone._id,
      milestoneIndex: index,
      status: index === 0 ? 'in_progress' : 'pending'
    }));

    const goalProgress = new UserGoalProgress({
      userId: req.user.id,
      goalId: req.params.id,
      status: 'active',
      targetDate: targetDate || new Date(Date.now() + goal.estimatedWeeks * 7 * 24 * 60 * 60 * 1000),
      milestoneProgress,
      motivation
    });

    await goalProgress.save();
    await goalProgress.populate('goalId', 'name description milestones');

    res.status(201).json(goalProgress);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/goals/progress/:progressId/milestone/:milestoneIndex - Update milestone progress (authenticated)
router.put('/progress/:progressId/milestone/:milestoneIndex', auth, async (req, res) => {
  try {
    const { progressId, milestoneIndex } = req.params;
    const { status, completedAt, notes } = req.body;

    const progress = await UserGoalProgress.findOne({
      _id: progressId,
      userId: req.user.id
    });

    if (!progress) {
      return res.status(404).json({ error: 'Goal progress not found' });
    }

    const milestoneProgressIndex = progress.milestoneProgress.findIndex(
      mp => mp.milestoneIndex === parseInt(milestoneIndex)
    );

    if (milestoneProgressIndex === -1) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Update milestone progress
    progress.milestoneProgress[milestoneProgressIndex].status = status;
    if (completedAt) progress.milestoneProgress[milestoneProgressIndex].completedAt = completedAt;
    if (notes) progress.milestoneProgress[milestoneProgressIndex].notes = notes;

    // If milestone completed, activate next one
    if (status === 'completed') {
      const nextMilestoneIndex = milestoneProgressIndex + 1;
      if (nextMilestoneIndex < progress.milestoneProgress.length) {
        progress.milestoneProgress[nextMilestoneIndex].status = 'in_progress';
      } else {
        // All milestones completed, mark goal as completed
        progress.status = 'completed';
        progress.completedAt = new Date();
      }
    }

    await progress.save();
    await progress.populate('goalId', 'name milestones');

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/goals/progress/:progressId - Update goal progress status (authenticated)
router.put('/progress/:progressId', auth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const progress = await UserGoalProgress.findOneAndUpdate(
      { _id: req.params.progressId, userId: req.user.id },
      { 
        status, 
        notes,
        ...(status === 'completed' && { completedAt: new Date() }),
        ...(status === 'abandoned' && { abandonedAt: new Date() })
      },
      { new: true, runValidators: true }
    ).populate('goalId', 'name description milestones');

    if (!progress) {
      return res.status(404).json({ error: 'Goal progress not found' });
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;