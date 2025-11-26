const express = require('express');
const router = express.Router();
const { Progression, UserProgressionProgress } = require('../models/Progression');
const { auth, optionalAuth } = require('../middleware/auth');

// @route   GET /api/v1/progressions
// @desc    Get all progressions (common + user's own)
// @access  Public (but shows user data if authenticated)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Build query: common progressions + user's own
    const query = userId
      ? { $or: [{ isCommon: true }, { createdBy: userId }] }
      : { isCommon: true };

    const progressions = await Progression.find(query)
      .sort({ name: 1 })
      .lean();

    // If user is authenticated, attach their progress data
    if (userId) {
      const userProgress = await UserProgressionProgress.find({ userId })
        .lean();

      const progressMap = new Map(
        userProgress.map(p => [p.progressionId.toString(), p])
      );

      progressions.forEach(prog => {
        prog.userProgress = progressMap.get(prog._id.toString()) || null;
      });
    }

    res.json({
      success: true,
      data: { progressions }
    });
  } catch (error) {
    console.error('Error fetching progressions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/v1/progressions/:id
// @desc    Get single progression by ID
// @access  Public (but shows user data if authenticated)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const progression = await Progression.findById(req.params.id)
      .populate('steps.exerciseId', 'name difficulty muscles strain mediaUrls')
      .lean();

    if (!progression) {
      return res.status(404).json({
        success: false,
        message: 'Progression not found'
      });
    }

    // If user is authenticated, attach their progress
    if (req.user?.id) {
      const userProgress = await UserProgressionProgress.findOne({
        userId: req.user.id,
        progressionId: req.params.id
      }).lean();

      progression.userProgress = userProgress || null;
    }

    res.json({
      success: true,
      data: progression
    });
  } catch (error) {
    console.error('Error fetching progression:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/v1/progressions
// @desc    Create new progression
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const progressionData = {
      ...req.body,
      createdBy: req.user.id,
      isCommon: false // Users can only create private progressions
    };

    // Auto-assign order to steps if not provided
    if (progressionData.steps) {
      progressionData.steps = progressionData.steps.map((step, index) => ({
        ...step,
        order: step.order ?? index
      }));
    }

    const progression = await Progression.create(progressionData);

    res.status(201).json({
      success: true,
      data: progression
    });
  } catch (error) {
    console.error('Error creating progression:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/v1/progressions/:id
// @desc    Update progression
// @access  Private (only owner can update)
router.put('/:id', auth, async (req, res) => {
  try {
    const progression = await Progression.findById(req.params.id);

    if (!progression) {
      return res.status(404).json({
        success: false,
        message: 'Progression not found'
      });
    }

    // Check ownership (only owner can edit, unless it's common and user is admin)
    if (!progression.isCommon && progression.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this progression'
      });
    }

    // Prevent changing isCommon status for non-admins
    const updateData = { ...req.body };
    if (!req.user.isAdmin) {
      delete updateData.isCommon;
    }

    // Auto-assign order to steps if not provided
    if (updateData.steps) {
      updateData.steps = updateData.steps.map((step, index) => ({
        ...step,
        order: step.order ?? index
      }));
    }

    const updated = await Progression.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('Error updating progression:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   DELETE /api/v1/progressions/:id
// @desc    Delete progression
// @access  Private (only owner can delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const progression = await Progression.findById(req.params.id);

    if (!progression) {
      return res.status(404).json({
        success: false,
        message: 'Progression not found'
      });
    }

    // Check ownership
    if (!progression.isCommon && progression.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this progression'
      });
    }

    // Also delete all user progress for this progression
    await UserProgressionProgress.deleteMany({ progressionId: req.params.id });
    await Progression.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Progression deleted'
    });
  } catch (error) {
    console.error('Error deleting progression:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============ User Progress Endpoints ============

// @route   POST /api/v1/progressions/:id/start
// @desc    Start tracking progress on a progression
// @access  Private
router.post('/:id/start', auth, async (req, res) => {
  try {
    const progression = await Progression.findById(req.params.id);

    if (!progression) {
      return res.status(404).json({
        success: false,
        message: 'Progression not found'
      });
    }

    // Check if already tracking
    let userProgress = await UserProgressionProgress.findOne({
      userId: req.user.id,
      progressionId: req.params.id
    });

    if (userProgress) {
      // Restart if not in progress
      if (userProgress.status !== 'in_progress') {
        userProgress.status = 'in_progress';
        userProgress.lastActivityAt = new Date();
        await userProgress.save();
      }
      return res.json({
        success: true,
        data: userProgress
      });
    }

    // Create initial step progress
    const stepProgress = progression.steps.map((step, index) => ({
      stepId: step._id,
      status: index === 0 ? 'available' : 'locked',
      unlockedAt: index === 0 ? new Date() : null
    }));

    userProgress = await UserProgressionProgress.create({
      userId: req.user.id,
      progressionId: req.params.id,
      status: 'in_progress',
      startedAt: new Date(),
      stepProgress
    });

    res.status(201).json({
      success: true,
      data: userProgress
    });
  } catch (error) {
    console.error('Error starting progression:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/v1/progressions/:id/steps/:stepIndex/complete
// @desc    Mark a step as completed
// @access  Private
router.post('/:id/steps/:stepIndex/complete', auth, async (req, res) => {
  try {
    const { stepIndex } = req.params;
    const { performance } = req.body;

    const userProgress = await UserProgressionProgress.findOne({
      userId: req.user.id,
      progressionId: req.params.id
    });

    if (!userProgress) {
      return res.status(404).json({
        success: false,
        message: 'Progress not found. Start the progression first.'
      });
    }

    const idx = parseInt(stepIndex, 10);

    // Validate step index
    if (idx < 0 || idx >= userProgress.stepProgress.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid step index'
      });
    }

    // Complete the step
    userProgress.completeStep(idx, performance);

    // Unlock next step if available
    if (idx + 1 < userProgress.stepProgress.length) {
      userProgress.stepProgress[idx + 1].status = 'available';
      userProgress.stepProgress[idx + 1].unlockedAt = new Date();
    }

    await userProgress.save();

    res.json({
      success: true,
      data: userProgress
    });
  } catch (error) {
    console.error('Error completing step:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   PUT /api/v1/progressions/:id/progress
// @desc    Update user's progress (notes, current step, etc.)
// @access  Private
router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { notes, status, currentStepIndex } = req.body;

    const userProgress = await UserProgressionProgress.findOneAndUpdate(
      {
        userId: req.user.id,
        progressionId: req.params.id
      },
      {
        ...(notes !== undefined && { notes }),
        ...(status && { status }),
        ...(currentStepIndex !== undefined && { currentStepIndex }),
        lastActivityAt: new Date()
      },
      { new: true }
    );

    if (!userProgress) {
      return res.status(404).json({
        success: false,
        message: 'Progress not found'
      });
    }

    res.json({
      success: true,
      data: userProgress
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @route   GET /api/v1/progressions/user/active
// @desc    Get user's active progressions
// @access  Private
router.get('/user/active', auth, async (req, res) => {
  try {
    const userProgress = await UserProgressionProgress.find({
      userId: req.user.id,
      status: 'in_progress'
    })
      .populate('progressionId')
      .sort({ lastActivityAt: -1 })
      .lean();

    res.json({
      success: true,
      data: userProgress
    });
  } catch (error) {
    console.error('Error fetching active progressions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
