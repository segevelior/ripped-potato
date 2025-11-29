const { body } = require('express-validator');

// User validation
const validateRegister = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Exercise validation
const validateExercise = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Exercise name must be between 2 and 100 characters'),
  body('muscles')
    .isArray({ min: 1 })
    .withMessage('At least one muscle group is required'),
  body('discipline')
    .isArray({ min: 1 })
    .withMessage('At least one discipline is required'),
  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Difficulty must be beginner, intermediate, or advanced'),
  body('strain.intensity')
    .optional()
    .isIn(['low', 'moderate', 'high', 'max'])
    .withMessage('Intensity must be low, moderate, high, or max'),
  body('strain.load')
    .optional()
    .isIn(['bodyweight', 'light', 'moderate', 'heavy'])
    .withMessage('Load must be bodyweight, light, moderate, or heavy'),
  body('strain.durationType')
    .optional()
    .isIn(['reps', 'time', 'distance'])
    .withMessage('Duration type must be reps, time, or distance')
];

// Workout validation
const validateWorkout = [
  body('title')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Workout title must be between 2 and 100 characters'),
  body('date')
    .isISO8601()
    .withMessage('Please provide a valid date'),
  body('type')
    .notEmpty()
    .withMessage('Workout type is required'),
  body('status')
    .optional()
    .isIn(['planned', 'in_progress', 'completed', 'skipped'])
    .withMessage('Status must be planned, in_progress, completed, or skipped'),
  body('exercises')
    .optional()
    .isArray()
    .withMessage('Exercises must be an array'),
  body('exercises.*.exerciseId')
    .optional(), // Made optional - exercises may not have MongoDB IDs when created from templates
  body('exercises.*.sets')
    .optional()
    .isArray()
    .withMessage('Sets must be an array'),
  body('exercises.*.sets.*.rpe')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('RPE must be between 1 and 10')
];

module.exports = {
  validateRegister,
  validateLogin,
  validateExercise,
  validateWorkout
};