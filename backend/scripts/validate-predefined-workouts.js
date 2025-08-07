#!/usr/bin/env node

/**
 * Validation script to check the current state of predefinedWorkouts
 * Run this before migration to see what needs to be fixed
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

// Validation function
const validatePredefinedWorkouts = async () => {
  try {
    console.log('🔍 Validating predefinedWorkouts...\n');
    
    // Find all predefinedWorkouts
    const workouts = await PredefinedWorkout.find({});
    console.log(`📊 Found ${workouts.length} predefinedWorkouts\n`);
    
    const issues = {
      missingTitle: [],
      invalidType: [],
      invalidDifficulty: [],
      invalidDuration: [],
      missingTargetMuscles: [],
      invalidEquipment: [],
      invalidExercises: [],
      invalidIsCommon: [],
      invalidTags: [],
      invalidPopularity: [],
      invalidRatings: []
    };
    
    const validTypes = ['strength', 'cardio', 'hybrid', 'recovery', 'hiit'];
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    
    for (const workout of workouts) {
      // Check title
      if (!workout.title || workout.title.trim() === '') {
        issues.missingTitle.push(workout._id);
      }
      
      // Check type
      if (!workout.type || !validTypes.includes(workout.type)) {
        issues.invalidType.push({
          id: workout._id,
          value: workout.type,
          title: workout.title
        });
      }
      
      // Check difficulty
      if (!workout.difficulty || !validDifficulties.includes(workout.difficulty)) {
        issues.invalidDifficulty.push({
          id: workout._id,
          value: workout.difficulty,
          title: workout.title
        });
      }
      
      // Check duration
      if (!workout.durationMinutes || typeof workout.durationMinutes !== 'number' || workout.durationMinutes <= 0) {
        issues.invalidDuration.push({
          id: workout._id,
          value: workout.durationMinutes,
          title: workout.title
        });
      }
      
      // Check targetMuscles
      if (!Array.isArray(workout.targetMuscles) || workout.targetMuscles.length === 0) {
        issues.missingTargetMuscles.push({
          id: workout._id,
          title: workout.title
        });
      }
      
      // Check equipment
      if (workout.equipment !== undefined && !Array.isArray(workout.equipment)) {
        issues.invalidEquipment.push({
          id: workout._id,
          value: typeof workout.equipment,
          title: workout.title
        });
      }
      
      // Check exercises
      if (!Array.isArray(workout.exercises)) {
        issues.invalidExercises.push({
          id: workout._id,
          title: workout.title,
          issue: 'exercises is not an array'
        });
      } else {
        // Check exercise structure
        for (let i = 0; i < workout.exercises.length; i++) {
          const exercise = workout.exercises[i];
          if (!exercise.exerciseId) {
            issues.invalidExercises.push({
              id: workout._id,
              title: workout.title,
              issue: `Exercise ${i} missing exerciseId`
            });
          }
          if (typeof exercise.order !== 'number') {
            issues.invalidExercises.push({
              id: workout._id,
              title: workout.title,
              issue: `Exercise ${i} invalid order`
            });
          }
          if (!Array.isArray(exercise.sets)) {
            issues.invalidExercises.push({
              id: workout._id,
              title: workout.title,
              issue: `Exercise ${i} sets is not an array`
            });
          }
        }
      }
      
      // Check isCommon
      if (typeof workout.isCommon !== 'boolean') {
        issues.invalidIsCommon.push({
          id: workout._id,
          value: workout.isCommon,
          title: workout.title
        });
      }
      
      // Check tags
      if (workout.tags !== undefined && !Array.isArray(workout.tags)) {
        issues.invalidTags.push({
          id: workout._id,
          value: typeof workout.tags,
          title: workout.title
        });
      }
      
      // Check popularity
      if (typeof workout.popularity !== 'number' || workout.popularity < 0) {
        issues.invalidPopularity.push({
          id: workout._id,
          value: workout.popularity,
          title: workout.title
        });
      }
      
      // Check ratings
      if (!workout.ratings || typeof workout.ratings !== 'object') {
        issues.invalidRatings.push({
          id: workout._id,
          title: workout.title,
          issue: 'Missing ratings object'
        });
      } else {
        if (typeof workout.ratings.average !== 'number' || workout.ratings.average < 0 || workout.ratings.average > 5) {
          issues.invalidRatings.push({
            id: workout._id,
            title: workout.title,
            issue: `Invalid average rating: ${workout.ratings.average}`
          });
        }
        if (typeof workout.ratings.count !== 'number' || workout.ratings.count < 0) {
          issues.invalidRatings.push({
            id: workout._id,
            title: workout.title,
            issue: `Invalid rating count: ${workout.ratings.count}`
          });
        }
      }
    }
    
    // Report findings
    console.log('📋 Validation Report:\n');
    
    let totalIssues = 0;
    
    for (const [key, items] of Object.entries(issues)) {
      if (items.length > 0) {
        totalIssues += items.length;
        console.log(`❌ ${key}: ${items.length} issues`);
        
        // Show first 5 examples
        const examples = items.slice(0, 5);
        examples.forEach(item => {
          if (typeof item === 'object') {
            console.log(`   - ${item.title || 'No title'} (${item.id})`);
            if (item.value !== undefined) console.log(`     Value: ${item.value}`);
            if (item.issue) console.log(`     Issue: ${item.issue}`);
          } else {
            console.log(`   - ${item}`);
          }
        });
        
        if (items.length > 5) {
          console.log(`   ... and ${items.length - 5} more`);
        }
        console.log();
      }
    }
    
    if (totalIssues === 0) {
      console.log('✅ All predefinedWorkouts are valid!\n');
    } else {
      console.log(`\n📊 Summary: Found ${totalIssues} total issues across ${workouts.length} workouts`);
      console.log('\n💡 Run the migration script to fix these issues:');
      console.log('   npm run migrate:predefined-workouts');
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    throw error;
  }
};

// Run validation
const run = async () => {
  try {
    await connectDB();
    await validatePredefinedWorkouts();
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
};

// Execute
run();