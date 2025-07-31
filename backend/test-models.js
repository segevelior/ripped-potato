const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./src/models/User');
const Exercise = require('./src/models/Exercise');
const Workout = require('./src/models/Workout');

async function testModels() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Create a User
    console.log('\n📝 Testing User model...');
    const testUser = new User({
      email: 'test@synergyfit.com',
      password: 'password123',
      name: 'Test User',
      profile: {
        age: 25,
        weight: 70,
        height: 175,
        fitnessLevel: 'intermediate'
      }
    });
    
    const savedUser = await testUser.save();
    console.log('✅ User created:', {
      id: savedUser._id,
      email: savedUser.email,
      name: savedUser.name,
      fitnessLevel: savedUser.profile.fitnessLevel
    });

    // Test 2: Create an Exercise
    console.log('\n📝 Testing Exercise model...');
    const testExercise = new Exercise({
      name: 'Push-up',
      description: 'Classic bodyweight pushing exercise',
      muscles: ['chest', 'triceps', 'shoulders'],
      secondaryMuscles: ['core'],
      discipline: ['strength', 'bodyweight'],
      equipment: [],
      difficulty: 'beginner',
      strain: {
        intensity: 'moderate',
        load: 'bodyweight',
        durationType: 'reps',
        typicalVolume: '3x15'
      }
    });
    
    const savedExercise = await testExercise.save();
    console.log('✅ Exercise created:', {
      id: savedExercise._id,
      name: savedExercise.name,
      muscles: savedExercise.muscles,
      allMuscles: savedExercise.allMuscles
    });

    // Test 3: Create a Workout
    console.log('\n📝 Testing Workout model...');
    const testWorkout = new Workout({
      userId: savedUser._id,
      title: 'Morning Push-up Session',
      date: new Date(),
      type: 'strength',
      status: 'completed',
      durationMinutes: 30,
      exercises: [{
        exerciseId: savedExercise._id,
        exerciseName: savedExercise.name,
        order: 1,
        sets: [
          { targetReps: 15, actualReps: 15, rpe: 7, restSeconds: 60, isCompleted: true },
          { targetReps: 15, actualReps: 12, rpe: 8, restSeconds: 60, isCompleted: true },
          { targetReps: 15, actualReps: 10, rpe: 8, restSeconds: 90, isCompleted: true }
        ]
      }],
      muscleStrain: {
        chest: 8,
        triceps: 6,
        shoulders: 4,
        core: 3
      },
      notes: 'Great workout, feeling strong!'
    });
    
    const savedWorkout = await testWorkout.save();
    console.log('✅ Workout created:', {
      id: savedWorkout._id,
      title: savedWorkout.title,
      type: savedWorkout.type,
      totalStrain: savedWorkout.totalStrain,
      completionPercentage: savedWorkout.completionPercentage
    });

    // Test 4: Test static methods
    console.log('\n📝 Testing static methods...');
    
    // Find exercises by muscle
    const chestExercises = await Exercise.findByMuscle('chest');
    console.log('✅ Chest exercises found:', chestExercises.length);
    
    // Find bodyweight exercises
    const bodyweightExercises = await Exercise.findByEquipment([]);
    console.log('✅ Bodyweight exercises found:', bodyweightExercises.length);
    
    // Get user workout stats
    const userStats = await Workout.getUserStats(savedUser._id);
    console.log('✅ User workout stats:', userStats);

    // Test 5: Test auth methods
    console.log('\n📝 Testing User auth methods...');
    const isPasswordValid = await savedUser.comparePassword('password123');
    console.log('✅ Password validation:', isPasswordValid);
    
    const token = savedUser.generateToken();
    console.log('✅ JWT token generated:', token.substring(0, 50) + '...');

    console.log('\n🎉 All tests passed! Models are working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the tests
testModels();