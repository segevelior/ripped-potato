#!/usr/bin/env node

/**
 * Quick script to add a few sample predefined workouts
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

// Sample workouts with proper data
const sampleWorkouts = [
  {
    title: "Upper Body Strength",
    description: "Build upper body strength with compound movements",
    type: "strength",
    difficulty: "intermediate",
    durationMinutes: 45,
    targetMuscles: ["Chest", "Back", "Shoulders", "Arms"],
    equipment: ["Dumbbells", "Pull-up Bar", "Bench"],
    tags: ["upper body", "strength", "muscle building"],
    isCommon: true,
    popularity: 100,
    ratings: { average: 4.5, count: 25 }
  },
  {
    title: "HIIT Full Body Blast",
    description: "High intensity interval training for maximum calorie burn",
    type: "hiit",
    difficulty: "advanced",
    durationMinutes: 30,
    targetMuscles: ["Full Body", "Core"],
    equipment: [],
    tags: ["hiit", "cardio", "fat loss", "bodyweight"],
    isCommon: true,
    popularity: 150,
    ratings: { average: 4.7, count: 42 }
  },
  {
    title: "Beginner Core Workout",
    description: "Gentle core strengthening routine for beginners",
    type: "strength",
    difficulty: "beginner",
    durationMinutes: 20,
    targetMuscles: ["Core", "Abs"],
    equipment: ["Mat"],
    tags: ["core", "abs", "beginner friendly"],
    isCommon: true,
    popularity: 80,
    ratings: { average: 4.8, count: 18 }
  }
];

// Add sample workouts
const addSampleWorkouts = async () => {
  try {
    console.log('🌱 Adding sample workouts...');
    
    // Get some exercises to add to workouts
    const exercises = await Exercise.find({ isCommon: true }).limit(10);
    
    if (exercises.length === 0) {
      console.log('⚠️  No exercises found. Please seed exercises first.');
      return;
    }
    
    for (const workoutData of sampleWorkouts) {
      // Add 3-5 exercises to each workout
      const exerciseCount = Math.floor(Math.random() * 3) + 3;
      const workoutExercises = [];
      
      for (let i = 0; i < exerciseCount && i < exercises.length; i++) {
        const exercise = exercises[i];
        workoutExercises.push({
          exerciseId: exercise._id,
          exerciseName: exercise.name,
          order: i,
          sets: [
            { reps: 12, restSeconds: 60 },
            { reps: 10, restSeconds: 60 },
            { reps: 8, restSeconds: 90 }
          ],
          notes: `Perform ${exercise.name} with controlled form`
        });
      }
      
      const workout = new PredefinedWorkout({
        ...workoutData,
        exercises: workoutExercises
      });
      
      await workout.save();
      console.log(`  ✅ Created: ${workout.title}`);
    }
    
    console.log('\n✅ Successfully added sample workouts!');
    
  } catch (error) {
    console.error('❌ Error adding workouts:', error);
    throw error;
  }
};

// Run
const run = async () => {
  try {
    await connectDB();
    await addSampleWorkouts();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
};

run();