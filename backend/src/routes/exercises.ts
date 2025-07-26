import { Router, Request, Response } from 'express';
import { Exercise } from '../models';

const router = Router();

// GET /api/v1/exercises - Get all exercises
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, difficulty, equipment, muscle } = req.query;
    
    // Build filter object
    const filter: any = { isActive: true };
    
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (equipment) filter.equipment = { $in: [equipment] };
    if (muscle) filter.primaryMuscles = { $in: [muscle] };

    const exercises = await Exercise.find(filter)
      .populate('createdBy', 'firstName lastName')
      .sort({ name: 1 })
      .limit(100); // Limit for performance

    res.json({
      success: true,
      data: exercises,
      count: exercises.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching exercises:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_EXERCISES_ERROR',
        message: 'Failed to fetch exercises'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/exercises/:id - Get single exercise
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const exercise = await Exercise.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!exercise) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXERCISE_NOT_FOUND',
          message: 'Exercise not found'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: exercise,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching exercise:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_EXERCISE_ERROR',
        message: 'Failed to fetch exercise'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/exercises - Create new exercise
router.post('/', async (req: Request, res: Response) => {
  try {
    const exerciseData = req.body;
    
    // Basic validation
    if (!exerciseData.name || !exerciseData.category) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and category are required'
        },
        timestamp: new Date().toISOString()
      });
    }

    const exercise = new Exercise(exerciseData);
    await exercise.save();

    res.status(201).json({
      success: true,
      data: exercise,
      message: 'Exercise created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error creating exercise:', error);
    
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message || 'Validation failed'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_EXERCISE_ERROR',
        message: 'Failed to create exercise'
      },
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 