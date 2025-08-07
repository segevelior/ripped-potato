#!/usr/bin/env node

/**
 * Migration script to enforce correct schema on all predefinedWorkouts
 * This ensures all documents have the required fields with proper types
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PredefinedWorkout = require('../src/models/PredefinedWorkout');

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

// Migration function
const migratePredefinedWorkouts = async () => {
  try {
    console.log('🔄 Starting predefinedWorkouts migration...');
    
    // Find all predefinedWorkouts
    const workouts = await PredefinedWorkout.find({});
    console.log(`📊 Found ${workouts.length} predefinedWorkouts to process`);
    
    let updated = 0;
    let errors = 0;
    
    for (const workout of workouts) {
      try {
        let needsUpdate = false;
        const updates = {};
        
        // Ensure required fields
        if (!workout.title || workout.title.trim() === '') {
          updates.title = `Workout ${workout._id}`;
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Missing title, setting default`);
        }
        
        // Ensure type is valid
        const validTypes = ['strength', 'cardio', 'hybrid', 'recovery', 'hiit'];
        if (!workout.type || !validTypes.includes(workout.type)) {
          updates.type = 'strength'; // Default to strength
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Invalid type "${workout.type}", defaulting to "strength"`);
        }
        
        // Ensure difficulty is valid
        const validDifficulties = ['beginner', 'intermediate', 'advanced'];
        if (!workout.difficulty || !validDifficulties.includes(workout.difficulty)) {
          updates.difficulty = 'intermediate'; // Default to intermediate
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Invalid difficulty "${workout.difficulty}", defaulting to "intermediate"`);
        }
        
        // Ensure durationMinutes is a positive number
        if (!workout.durationMinutes || typeof workout.durationMinutes !== 'number' || workout.durationMinutes <= 0) {
          updates.durationMinutes = 45; // Default to 45 minutes
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Invalid duration, defaulting to 45 minutes`);
        }
        
        // Ensure targetMuscles is an array with at least one element
        if (!Array.isArray(workout.targetMuscles) || workout.targetMuscles.length === 0) {
          // Try to infer from exercises
          const muscleGroups = new Set();
          if (workout.exercises && Array.isArray(workout.exercises)) {
            for (const exercise of workout.exercises) {
              // You might need to populate exercise details to get muscles
              muscleGroups.add('Full Body'); // Default for now
            }
          }
          updates.targetMuscles = Array.from(muscleGroups).length > 0 
            ? Array.from(muscleGroups) 
            : ['Full Body'];
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Missing targetMuscles, defaulting to ${updates.targetMuscles}`);
        }
        
        // Ensure equipment is an array (can be empty)
        if (!Array.isArray(workout.equipment)) {
          updates.equipment = [];
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Invalid equipment field, setting to empty array`);
        }
        
        // Ensure exercises array structure
        if (!Array.isArray(workout.exercises)) {
          updates.exercises = [];
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Invalid exercises field, setting to empty array`);
        } else {
          // Validate each exercise
          const validatedExercises = [];
          for (let i = 0; i < workout.exercises.length; i++) {
            const exercise = workout.exercises[i];
            const validExercise = {
              exerciseId: exercise.exerciseId,
              exerciseName: exercise.exerciseName || 'Unknown Exercise',
              order: exercise.order || i,
              sets: Array.isArray(exercise.sets) ? exercise.sets : [],
              notes: exercise.notes || ''
            };
            
            // Validate each set
            validExercise.sets = validExercise.sets.map(set => ({
              reps: set.reps || 10,
              time: set.time || null,
              weight: set.weight || null,
              restSeconds: set.restSeconds || 60,
              notes: set.notes || ''
            }));
            
            validatedExercises.push(validExercise);
          }
          
          if (JSON.stringify(validatedExercises) !== JSON.stringify(workout.exercises)) {
            updates.exercises = validatedExercises;
            needsUpdate = true;
            console.log(`  ⚠️  ${workout._id}: Fixed exercise structure`);
          }
        }
        
        // Ensure isCommon is boolean
        if (typeof workout.isCommon !== 'boolean') {
          updates.isCommon = workout.isCommon ? true : false;
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Fixed isCommon field`);
        }
        
        // Ensure tags is an array
        if (!Array.isArray(workout.tags)) {
          updates.tags = [];
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Fixed tags field`);
        }
        
        // Ensure popularity is a number
        if (typeof workout.popularity !== 'number' || workout.popularity < 0) {
          updates.popularity = 0;
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Fixed popularity field`);
        }
        
        // Ensure ratings structure
        if (!workout.ratings || typeof workout.ratings !== 'object') {
          updates.ratings = { average: 0, count: 0 };
          needsUpdate = true;
          console.log(`  ⚠️  ${workout._id}: Fixed ratings structure`);
        } else {
          const ratingsUpdate = {};
          if (typeof workout.ratings.average !== 'number' || workout.ratings.average < 0 || workout.ratings.average > 5) {
            ratingsUpdate.average = 0;
          }
          if (typeof workout.ratings.count !== 'number' || workout.ratings.count < 0) {
            ratingsUpdate.count = 0;
          }
          if (Object.keys(ratingsUpdate).length > 0) {
            updates.ratings = { ...workout.ratings, ...ratingsUpdate };
            needsUpdate = true;
            console.log(`  ⚠️  ${workout._id}: Fixed ratings values`);
          }
        }
        
        // Apply updates if needed
        if (needsUpdate) {
          await PredefinedWorkout.updateOne(
            { _id: workout._id },
            { $set: updates }
          );
          updated++;
          console.log(`  ✅ ${workout._id}: Updated successfully`);
        } else {
          console.log(`  ✓  ${workout._id}: Already valid`);
        }
        
      } catch (error) {
        errors++;
        console.error(`  ❌ ${workout._id}: Error during migration:`, error.message);
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`  Total workouts: ${workouts.length}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Already valid: ${workouts.length - updated - errors}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration
const run = async () => {
  try {
    await connectDB();
    await migratePredefinedWorkouts();
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
};

// Execute
run();