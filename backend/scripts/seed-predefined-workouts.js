#!/usr/bin/env node

/**
 * Seed script to create sample predefinedWorkouts with correct schema
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const Exercise = require('../src/models/Exercise');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Sample predefined workouts
const sampleWorkouts = [
  {
    title: "Full Body Strength Builder",
    description: "A comprehensive strength training workout targeting all major muscle groups",
    type: "strength",
    difficulty: "intermediate",
    durationMinutes: 60,
    targetMuscles: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"],
    equipment: ["Barbell", "Dumbbells", "Pull-up Bar"],
    tags: ["strength", "muscle building", "full body"],
    isCommon: true,
    popularity: 150,
    ratings: { average: 4.5, count: 45 }
  },
  {
    title: "HIIT Cardio Blast",
    description: "High-intensity interval training for maximum calorie burn",
    type: "hiit",
    difficulty: "advanced",
    durationMinutes: 30,
    targetMuscles: ["Full Body", "Core", "Legs"],
    equipment: [],
    tags: ["cardio", "fat loss", "high intensity", "bodyweight"],
    isCommon: true,
    popularity: 200,
    ratings: { average: 4.7, count: 62 }
  },
  {
    title: "Beginner's Push-Pull-Legs",
    description: "Classic PPL split adapted for beginners with basic equipment",
    type: "strength",
    difficulty: "beginner",
    durationMinutes: 45,
    targetMuscles: ["Chest", "Triceps", "Shoulders"],
    equipment: ["Dumbbells", "Bench"],
    tags: ["beginner friendly", "PPL", "strength"],
    isCommon: true,
    popularity: 180,
    ratings: { average: 4.8, count: 73 }
  },
  {
    title: "Core and Abs Destroyer",
    description: "Intense core workout for six-pack abs",
    type: "strength",
    difficulty: "intermediate",
    durationMinutes: 20,
    targetMuscles: ["Core", "Abs", "Obliques"],
    equipment: ["Mat"],
    tags: ["abs", "core", "six pack"],
    isCommon: true,
    popularity: 220,
    ratings: { average: 4.6, count: 89 }
  },
  {
    title: "Yoga Recovery Flow",
    description: "Gentle yoga sequence for active recovery and flexibility",
    type: "recovery",
    difficulty: "beginner",
    durationMinutes: 30,
    targetMuscles: ["Full Body"],
    equipment: ["Yoga Mat"],
    tags: ["yoga", "flexibility", "recovery", "stretching"],
    isCommon: true,
    popularity: 95,
    ratings: { average: 4.9, count: 31 }
  },
  {
    title: "Upper Body Pump",
    description: "Focused upper body workout for muscle definition",
    type: "strength",
    difficulty: "intermediate",
    durationMinutes: 50,
    targetMuscles: ["Chest", "Back", "Shoulders", "Arms"],
    equipment: ["Dumbbells", "Barbell", "Cable Machine"],
    tags: ["upper body", "muscle pump", "hypertrophy"],
    isCommon: true,
    popularity: 165,
    ratings: { average: 4.4, count: 54 }
  },
  {
    title: "Leg Day Essentials",
    description: "Complete lower body workout for strength and size",
    type: "strength",
    difficulty: "intermediate",
    durationMinutes: 55,
    targetMuscles: ["Quadriceps", "Hamstrings", "Glutes", "Calves"],
    equipment: ["Barbell", "Squat Rack", "Leg Press"],
    tags: ["legs", "lower body", "squat", "deadlift"],
    isCommon: true,
    popularity: 145,
    ratings: { average: 4.3, count: 41 }
  },
  {
    title: "Cardio Circuit Training",
    description: "Circuit-style cardio workout for endurance and fat loss",
    type: "cardio",
    difficulty: "intermediate",
    durationMinutes: 40,
    targetMuscles: ["Full Body", "Core"],
    equipment: ["Jump Rope", "Medicine Ball"],
    tags: ["circuit", "cardio", "endurance", "fat burn"],
    isCommon: true,
    popularity: 130,
    ratings: { average: 4.5, count: 38 }
  },
  {
    title: "Calisthenics Fundamentals",
    description: "Bodyweight training focusing on fundamental movements",
    type: "hybrid",
    difficulty: "beginner",
    durationMinutes: 35,
    targetMuscles: ["Full Body", "Core"],
    equipment: ["Pull-up Bar", "Dip Bars"],
    tags: ["calisthenics", "bodyweight", "functional"],
    isCommon: true,
    popularity: 175,
    ratings: { average: 4.7, count: 58 }
  },
  {
    title: "Powerlifting Basics",
    description: "Focus on the big three: squat, bench, deadlift",
    type: "strength",
    difficulty: "advanced",
    durationMinutes: 75,
    targetMuscles: ["Full Body", "Back", "Chest", "Legs"],
    equipment: ["Barbell", "Squat Rack", "Bench"],
    tags: ["powerlifting", "strength", "compound movements"],
    isCommon: true,
    popularity: 120,
    ratings: { average: 4.8, count: 35 }
  }
];

// Function to get sample exercises
const getSampleExercises = async () => {
  const exercises = await Exercise.find({ isCommon: true }).limit(20);
  return exercises;
};

// Function to create exercise sets
const createSets = (exerciseType) => {
  const setConfigs = {
    strength: [
      { reps: 12, restSeconds: 60 },
      { reps: 10, restSeconds: 60 },
      { reps: 8, restSeconds: 90 },
      { reps: 8, restSeconds: 90 }
    ],
    cardio: [
      { time: 60, restSeconds: 30 },
      { time: 45, restSeconds: 30 },
      { time: 30, restSeconds: 30 }
    ],
    hiit: [
      { reps: 20, restSeconds: 20 },
      { reps: 20, restSeconds: 20 },
      { reps: 15, restSeconds: 30 },
      { reps: 15, restSeconds: 30 }
    ],
    recovery: [
      { time: 120, restSeconds: 0 },
      { time: 120, restSeconds: 0 }
    ]
  };
  
  return setConfigs[exerciseType] || setConfigs.strength;
};

// Seed function
const seedPredefinedWorkouts = async () => {
  try {
    console.log('🌱 Starting predefinedWorkouts seeding...');
    
    // Check if we already have predefined workouts
    const existingCount = await PredefinedWorkout.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  Already have ${existingCount} predefined workouts. Skipping seed.`);
      console.log('   To reseed, delete existing workouts first.');
      return;
    }
    
    // Get sample exercises
    const exercises = await getSampleExercises();
    if (exercises.length === 0) {
      console.log('⚠️  No exercises found. Please seed exercises first.');
      return;
    }
    
    console.log(`📊 Found ${exercises.length} exercises to use`);
    
    // Create predefined workouts
    const createdWorkouts = [];
    
    for (const workoutData of sampleWorkouts) {
      // Select random exercises for this workout
      const exerciseCount = Math.floor(Math.random() * 4) + 4; // 4-7 exercises
      const selectedExercises = [];
      const usedExercises = new Set();
      
      for (let i = 0; i < exerciseCount && i < exercises.length; i++) {
        let exercise;
        do {
          exercise = exercises[Math.floor(Math.random() * exercises.length)];
        } while (usedExercises.has(exercise._id.toString()));
        
        usedExercises.add(exercise._id.toString());
        
        selectedExercises.push({
          exerciseId: exercise._id,
          exerciseName: exercise.name,
          order: i,
          sets: createSets(workoutData.type),
          notes: `Focus on proper form for ${exercise.name}`
        });
      }
      
      const workout = new PredefinedWorkout({
        ...workoutData,
        exercises: selectedExercises
      });
      
      await workout.save();
      createdWorkouts.push(workout.title);
      console.log(`  ✅ Created: ${workout.title}`);
    }
    
    console.log(`\n✅ Successfully seeded ${createdWorkouts.length} predefined workouts!`);
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
};

// Run seeding
const run = async () => {
  try {
    await connectDB();
    await seedPredefinedWorkouts();
    console.log('\n🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
};

// Execute
run();