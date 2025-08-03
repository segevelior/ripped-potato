const mongoose = require('mongoose');
const Exercise = require('../models/Exercise');
const Goal = require('../models/Goal');
const PredefinedWorkout = require('../models/PredefinedWorkout');
require('dotenv').config({ path: '../../.env' });

// Common exercises data
const commonExercises = [
  // Chest exercises
  {
    name: 'Push-ups',
    description: 'Classic bodyweight exercise for chest, shoulders, and triceps',
    muscles: ['chest', 'shoulders', 'triceps'],
    discipline: ['strength', 'calisthenics'],
    equipment: [],
    difficulty: 'beginner',
    strain: {
      intensity: 'moderate',
      load: 'bodyweight',
      durationType: 'reps',
      typicalVolume: '3x15'
    },
    isCommon: true,
    createdBy: null
  },
  {
    name: 'Bench Press',
    description: 'Fundamental barbell exercise for chest development',
    muscles: ['chest', 'shoulders', 'triceps'],
    discipline: ['strength', 'powerlifting'],
    equipment: ['barbell', 'bench'],
    difficulty: 'intermediate',
    strain: {
      intensity: 'high',
      load: 'heavy',
      durationType: 'reps',
      typicalVolume: '3x8'
    },
    isCommon: true,
    createdBy: null
  },
  // Back exercises
  {
    name: 'Pull-ups',
    description: 'Compound exercise for back and biceps',
    muscles: ['back', 'biceps'],
    discipline: ['strength', 'calisthenics'],
    equipment: ['pull-up bar'],
    difficulty: 'intermediate',
    strain: {
      intensity: 'high',
      load: 'bodyweight',
      durationType: 'reps',
      typicalVolume: '3x8'
    },
    isCommon: true,
    createdBy: null
  },
  {
    name: 'Deadlift',
    description: 'Full-body compound exercise with emphasis on posterior chain',
    muscles: ['back', 'glutes', 'hamstrings'],
    secondaryMuscles: ['core', 'traps'],
    discipline: ['strength', 'powerlifting'],
    equipment: ['barbell'],
    difficulty: 'advanced',
    strain: {
      intensity: 'max',
      load: 'heavy',
      durationType: 'reps',
      typicalVolume: '3x5'
    },
    isCommon: true,
    createdBy: null
  },
  // Leg exercises
  {
    name: 'Squat',
    description: 'Fundamental lower body exercise',
    muscles: ['quadriceps', 'glutes'],
    secondaryMuscles: ['hamstrings', 'core'],
    discipline: ['strength', 'powerlifting'],
    equipment: ['barbell'],
    difficulty: 'intermediate',
    strain: {
      intensity: 'high',
      load: 'heavy',
      durationType: 'reps',
      typicalVolume: '3x10'
    },
    isCommon: true,
    createdBy: null
  },
  {
    name: 'Lunges',
    description: 'Unilateral leg exercise for balance and strength',
    muscles: ['quadriceps', 'glutes'],
    discipline: ['strength', 'functional'],
    equipment: [],
    difficulty: 'beginner',
    strain: {
      intensity: 'moderate',
      load: 'bodyweight',
      durationType: 'reps',
      typicalVolume: '3x12 each leg'
    },
    isCommon: true,
    createdBy: null
  }
];

// Common goals data
const commonGoals = [
  {
    name: 'First Pull-up',
    description: 'Master your first unassisted pull-up',
    category: 'skill',
    discipline: ['calisthenics', 'strength'],
    difficultyLevel: 'beginner',
    estimatedWeeks: 8,
    milestones: [
      { name: 'Dead hang 30 seconds', order: 1 },
      { name: 'Negative pull-ups', order: 2 },
      { name: 'Assisted pull-ups', order: 3 },
      { name: 'First pull-up', order: 4 }
    ],
    isCommon: true,
    createdBy: null
  },
  {
    name: '5K Runner',
    description: 'Train to run 5 kilometers without stopping',
    category: 'endurance',
    discipline: ['running', 'cardio'],
    difficultyLevel: 'beginner',
    estimatedWeeks: 9,
    milestones: [
      { name: 'Run 1km continuously', order: 1 },
      { name: 'Run 3km continuously', order: 2 },
      { name: 'Complete 5km', order: 3 }
    ],
    isCommon: true,
    createdBy: null
  },
  {
    name: '100kg Bench Press',
    description: 'Build strength to bench press 100kg',
    category: 'strength',
    discipline: ['powerlifting', 'strength'],
    difficultyLevel: 'intermediate',
    estimatedWeeks: 16,
    targetMetrics: {
      weight: 100
    },
    isCommon: true,
    createdBy: null
  }
];

// Common predefined workouts
const commonWorkouts = [
  {
    title: 'Upper Body Strength',
    description: 'Complete upper body workout for strength building',
    type: 'strength',
    difficulty: 'intermediate',
    durationMinutes: 45,
    targetMuscles: ['chest', 'back', 'shoulders', 'arms'],
    equipment: ['barbell', 'dumbbell', 'bench'],
    exercises: [
      {
        exerciseName: 'Bench Press',
        sets: 3,
        reps: '8-10',
        restSeconds: 90
      },
      {
        exerciseName: 'Pull-ups',
        sets: 3,
        reps: '8-10',
        restSeconds: 90
      },
      {
        exerciseName: 'Shoulder Press',
        sets: 3,
        reps: '10-12',
        restSeconds: 60
      }
    ],
    isCommon: true,
    createdBy: null
  },
  {
    title: 'Beginner Full Body',
    description: 'Perfect starting workout for beginners',
    type: 'strength',
    difficulty: 'beginner',
    durationMinutes: 30,
    targetMuscles: ['full body'],
    equipment: [],
    exercises: [
      {
        exerciseName: 'Push-ups',
        sets: 3,
        reps: '10-15',
        restSeconds: 60
      },
      {
        exerciseName: 'Bodyweight Squats',
        sets: 3,
        reps: '15-20',
        restSeconds: 60
      },
      {
        exerciseName: 'Lunges',
        sets: 3,
        reps: '10 each leg',
        restSeconds: 60
      }
    ],
    isCommon: true,
    createdBy: null
  }
];

async function seedCommonData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing common data
    await Exercise.deleteMany({ isCommon: true });
    await Goal.deleteMany({ isCommon: true });
    await PredefinedWorkout.deleteMany({ isCommon: true });
    console.log('Cleared existing common data');

    // Seed exercises
    const createdExercises = await Exercise.insertMany(commonExercises);
    console.log(`Created ${createdExercises.length} common exercises`);

    // Seed goals
    const createdGoals = await Goal.insertMany(commonGoals);
    console.log(`Created ${createdGoals.length} common goals`);

    // Seed predefined workouts
    const createdWorkouts = await PredefinedWorkout.insertMany(commonWorkouts);
    console.log(`Created ${createdWorkouts.length} common workouts`);

    console.log('✅ Common data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding common data:', error);
    process.exit(1);
  }
}

// Run the seed function
seedCommonData();