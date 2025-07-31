const express = require('express');
const Plan = require('../models/Plan');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/plans - Get user's plans (authenticated)
router.get('/', auth, async (req, res) => {
  try {
    const { status, isTemplate } = req.query;
    
    let query = {};
    
    if (isTemplate === 'true') {
      // Get templates (public)
      query.isTemplate = true;
    } else {
      // Get user's personal plans
      query.userId = req.user.id;
      if (status) query.status = status;
    }

    const plans = await Plan.find(query)
      .populate('goalId', 'name category difficultyLevel')
      .sort({ createdAt: -1 });

    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plans/templates - Get plan templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await Plan.getTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plans/active - Get user's active plans (authenticated)
router.get('/active', auth, async (req, res) => {
  try {
    const activePlans = await Plan.getUserActivePlans(req.user.id);
    res.json(activePlans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plans/templates - Get plan templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await Plan.getTemplates();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plans/active - Get user's active plans (authenticated)
router.get('/active', auth, async (req, res) => {
  try {
    const activePlans = await Plan.getUserActivePlans(req.user.id);
    res.json(activePlans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plans/:id - Get specific plan (authenticated)
router.get('/:id', auth, async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // Check if it's a template (public) or user's plan
    const plan = await Plan.findOne(query);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // If not a template, ensure user owns it
    if (!plan.isTemplate && plan.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await plan.populate('goalId', 'name description category milestones');
    await plan.populate('weeks.workouts.predefinedWorkoutId', 'title type durationMinutes');

    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans - Create new plan (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const planData = {
      ...req.body,
      userId: req.user.id
    };

    const plan = new Plan(planData);
    await plan.save();

    await plan.populate('goalId', 'name category');

    res.status(201).json(plan);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/from-template/:templateId - Create plan from template (authenticated)
router.post('/from-template/:templateId', auth, async (req, res) => {
  try {
    const { name, startDate, goalId } = req.body;
    
    const template = await Plan.findOne({ _id: req.params.templateId, isTemplate: true });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create new plan from template
    const planData = {
      ...template.toObject(),
      _id: undefined,
      userId: req.user.id,
      name: name || template.templateName,
      goalId: goalId || template.goalId,
      isTemplate: false,
      templateName: undefined,
      createdFrom: template._id,
      status: 'draft',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: undefined,
      actualEndDate: undefined,
      progress: {
        currentWeek: 1,
        completedWorkouts: 0,
        totalWorkouts: 0,
        skippedWorkouts: 0,
        adherencePercentage: 0
      }
    };

    const plan = new Plan(planData);
    await plan.save();

    await plan.populate('goalId', 'name category');

    res.status(201).json(plan);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/plans/:id - Update plan (authenticated)
router.put('/:id', auth, async (req, res) => {
  try {
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    Object.assign(plan, req.body);
    await plan.save();

    await plan.populate('goalId', 'name category');

    res.json(plan);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/plans/:id - Delete plan (authenticated)
router.delete('/:id', auth, async (req, res) => {
  try {
    const plan = await Plan.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/start - Start plan (authenticated)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const { startDate } = req.body;
    
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'draft') {
      return res.status(400).json({ error: 'Plan has already been started' });
    }

    await plan.startPlan(startDate ? new Date(startDate) : new Date());
    await plan.populate('goalId', 'name category');

    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/complete-workout - Complete workout in plan (authenticated)
router.post('/:id/complete-workout', auth, async (req, res) => {
  try {
    const { weekNumber, workoutIndex } = req.body;
    
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'active') {
      return res.status(400).json({ error: 'Plan is not active' });
    }

    await plan.completeWorkout(weekNumber, workoutIndex);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/skip-workout - Skip workout in plan (authenticated)
router.post('/:id/skip-workout', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'active') {
      return res.status(400).json({ error: 'Plan is not active' });
    }

    await plan.skipWorkout(reason);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/pause - Pause plan (authenticated)
router.post('/:id/pause', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'active') {
      return res.status(400).json({ error: 'Plan is not active' });
    }

    await plan.pausePlan(reason);
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/resume - Resume plan (authenticated)
router.post('/:id/resume', auth, async (req, res) => {
  try {
    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (plan.status !== 'paused') {
      return res.status(400).json({ error: 'Plan is not paused' });
    }

    await plan.resumePlan();
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/plans/:id/create-template - Create template from plan (authenticated)
router.post('/:id/create-template', auth, async (req, res) => {
  try {
    const { templateName, description } = req.body;
    
    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const plan = await Plan.findOne({ _id: req.params.id, userId: req.user.id });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const template = plan.createTemplate(templateName, description);
    await template.save();

    res.status(201).json(template);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;