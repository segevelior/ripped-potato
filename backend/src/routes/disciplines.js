const express = require('express');
const Discipline = require('../models/Discipline');
const { auth } = require('../middleware/auth');
const router = express.Router();

// GET /api/disciplines - Get all disciplines with filtering
router.get('/', async (req, res) => {
  try {
    const { category, beginnerFriendly } = req.query;

    let disciplines;
    
    if (beginnerFriendly === 'true') {
      disciplines = await Discipline.getBeginnerFriendly();
    } else {
      disciplines = await Discipline.getByCategory(category);
    }

    res.json(disciplines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/disciplines/category/:category - Get disciplines by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const disciplines = await Discipline.getByCategory(category);
    res.json(disciplines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/disciplines/search/:term - Search disciplines
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { limit = 10 } = req.query;

    const disciplines = await Discipline.search(term)
      .limit(parseInt(limit));

    res.json(disciplines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/disciplines/stats/categories - Get discipline statistics by category
router.get('/stats/categories', async (req, res) => {
  try {
    const stats = await Discipline.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          disciplines: {
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

// GET /api/disciplines/:id - Get specific discipline
router.get('/:id', async (req, res) => {
  try {
    const discipline = await Discipline.findById(req.params.id)
      .populate('relatedDisciplines', 'name displayName category')
      .populate('popularExercises', 'name description muscles equipment difficulty');

    if (!discipline) {
      return res.status(404).json({ error: 'Discipline not found' });
    }

    res.json(discipline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/disciplines - Create new discipline (authenticated, admin only)
router.post('/', auth, async (req, res) => {
  try {
    const discipline = new Discipline(req.body);
    await discipline.save();

    await discipline.populate('relatedDisciplines', 'name displayName');
    await discipline.populate('popularExercises', 'name muscles');

    res.status(201).json(discipline);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Discipline name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/disciplines/:id - Update discipline (authenticated, admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const discipline = await Discipline.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('relatedDisciplines', 'name displayName')
      .populate('popularExercises', 'name muscles');

    if (!discipline) {
      return res.status(404).json({ error: 'Discipline not found' });
    }

    res.json(discipline);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Discipline name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/disciplines/:id - Delete discipline (authenticated, admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const discipline = await Discipline.findByIdAndDelete(req.params.id);

    if (!discipline) {
      return res.status(404).json({ error: 'Discipline not found' });
    }

    res.json({ message: 'Discipline deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/disciplines/:id/toggle-active - Toggle discipline active status (authenticated, admin only)
router.put('/:id/toggle-active', auth, async (req, res) => {
  try {
    const discipline = await Discipline.findById(req.params.id);

    if (!discipline) {
      return res.status(404).json({ error: 'Discipline not found' });
    }

    discipline.isActive = !discipline.isActive;
    await discipline.save();

    res.json(discipline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/disciplines/:id/exercises - Get exercises for specific discipline
router.get('/:id/exercises', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const discipline = await Discipline.findById(req.params.id);
    
    if (!discipline) {
      return res.status(404).json({ error: 'Discipline not found' });
    }

    // This would require importing Exercise model and creating a relationship
    // For now, return empty array or populate from popularExercises
    const exercises = await discipline.populate({
      path: 'popularExercises',
      options: {
        limit: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit)
      }
    });

    res.json({
      exercises: exercises.popularExercises,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;