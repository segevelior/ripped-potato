const express = require('express');
const Goal = require('../models/Goal');
const UserGoalProgress = require('../models/UserGoalProgress');
const GoalService = require('../services/GoalService');
const { auth, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/goals - Get all goals with filtering
router.get('/', optionalAuth, async (req, res) => {
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

    let goals;
    
    if (req.user) {
      // Get goals with user modifications applied
      goals = await GoalService.getGoalsForUser(req.user.id);
    } else {
      // Non-authenticated users only see common goals
      goals = await Goal.find({ isCommon: true })
        .populate('recommendedExercises', 'name muscles equipment')
        .lean();
    }

    // Apply filters in memory (since we need to filter after modifications are applied)
    let filteredGoals = goals;
    
    if (category) {
      filteredGoals = filteredGoals.filter(g => g.category === category);
    }
    if (difficulty) {
      filteredGoals = filteredGoals.filter(g => g.difficultyLevel === difficulty);
    }
    if (discipline) {
      const disciplines = discipline.split(',');
      filteredGoals = filteredGoals.filter(g => 
        g.discipline.some(d => disciplines.includes(d))
      );
    }
    if (maxWeeks) {
      filteredGoals = filteredGoals.filter(g => g.estimatedWeeks <= parseInt(maxWeeks));
    }
    if (minWeeks) {
      filteredGoals = filteredGoals.filter(g => g.estimatedWeeks >= parseInt(minWeeks));
    }
    
    if (beginner === 'true') {
      // Filter for beginner-friendly goals
      filteredGoals = filteredGoals.filter(g => 
        g.difficultyLevel === 'beginner' && 
        (!g.prerequisites || g.prerequisites.length === 0)
      );
    }
    
    // Sort goals
    filteredGoals.sort((a, b) => {
      // Favorites first if user is authenticated
      if (req.user) {
        const aFav = a.userMetadata?.isFavorite || false;
        const bFav = b.userMetadata?.isFavorite || false;
        if (aFav !== bFav) return bFav - aFav;
      }
      // Then by popularity and success rate
      if (a.popularity !== b.popularity) return b.popularity - a.popularity;
      if (a.successRate !== b.successRate) return b.successRate - a.successRate;
      return 0;
    });
    
    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedGoals = filteredGoals.slice(skip, skip + parseInt(limit));
    const total = filteredGoals.length;

    res.json({
      goals: paginatedGoals,
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
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    let goal;
    
    if (req.user) {
      // Get goal with modifications for authenticated user
      goal = await GoalService.getGoalForUser(req.params.id, req.user.id);
    } else {
      // Non-authenticated users can only see common goals
      goal = await Goal.findOne({
        _id: req.params.id,
        isCommon: true
      })
      .populate('recommendedExercises', 'name description muscles equipment difficulty')
      .lean();
    }

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/goals - Create new goal (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const goalData = {
      ...req.body,
      createdBy: req.user.id,
      isCommon: false // User-created goals are private by default
    };
    
    // Admin can create common goals
    if (req.user.role === 'admin' && req.body.isCommon === true) {
      goalData.isCommon = true;
      goalData.createdBy = null; // Common goals don't have a specific creator
    }
    
    const goal = new Goal(goalData);
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

// PUT /api/goals/:id - Update goal (authenticated)
router.put('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Check if user can edit this goal directly
    if (goal.canUserEdit(req.user.id)) {
      // User owns this goal - update directly
      Object.assign(goal, req.body);
      await goal.save();
      await goal.populate('recommendedExercises', 'name muscles equipment');
      
      res.json(goal);
    } else if (goal.isCommon || goal.createdBy.toString() !== req.user.id) {
      // This is a common goal or another user's goal
      // Should use modification endpoint instead
      return res.status(403).json({ 
        error: 'Cannot edit this goal directly. Use modifications endpoint for common goals.' 
      });
    }
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/goals/:id - Delete goal (authenticated)
router.delete('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Only the owner can delete their private goals
    if (!goal.canUserEdit(req.user.id)) {
      return res.status(403).json({ 
        error: 'You can only delete your own goals' 
      });
    }
    
    await goal.deleteOne();
    
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

// Modification endpoints

// PUT /api/goals/:id/modifications - Create or update goal modification
router.put('/:id/modifications', auth, async (req, res) => {
  try {
    const { modifications, metadata } = req.body;
    
    const modification = await GoalService.saveModification(
      req.user.id,
      req.params.id,
      modifications,
      metadata
    );
    
    // Return the goal with modifications applied
    const goal = await GoalService.getGoalForUser(req.params.id, req.user.id);
    
    res.json(goal);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/goals/:id/modifications - Remove goal modification (revert to original)
router.delete('/:id/modifications', auth, async (req, res) => {
  try {
    await GoalService.removeModification(req.user.id, req.params.id);
    
    // Return the original goal
    const goal = await GoalService.getGoalForUser(req.params.id, req.user.id);
    
    res.json(goal);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/goals/:id/favorite - Toggle favorite status
router.put('/:id/favorite', auth, async (req, res) => {
  try {
    const { isFavorite } = req.body;
    
    await GoalService.toggleFavorite(req.user.id, req.params.id, isFavorite);
    
    res.json({ success: true, isFavorite });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/goals/:id/milestone/:milestoneId/complete - Update milestone completion
router.put('/:id/milestone/:milestoneId/complete', auth, async (req, res) => {
  try {
    const { completed = true } = req.body;
    
    const modification = await GoalService.updateMilestoneCompletion(
      req.user.id,
      req.params.id,
      req.params.milestoneId,
      completed
    );
    
    res.json(modification);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;