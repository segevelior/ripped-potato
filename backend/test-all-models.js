const mongoose = require('mongoose');
require('dotenv').config();

// Import all models
const User = require('./src/models/User');
const Exercise = require('./src/models/Exercise');
const Workout = require('./src/models/Workout');
const PredefinedWorkout = require('./src/models/PredefinedWorkout');
const Goal = require('./src/models/Goal');
const UserGoalProgress = require('./src/models/UserGoalProgress');
const Plan = require('./src/models/Plan');
const ExternalActivity = require('./src/models/ExternalActivity');
const Discipline = require('./src/models/Discipline');
const WorkoutType = require('./src/models/WorkoutType');

async function testAllModels() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing test data
    await User.deleteMany({ email: /test.*@synergyfit\.com/ });
    await Exercise.deleteMany({ name: /^Test.*/ });
    await Workout.deleteMany({ title: /^Test.*/ });
    await PredefinedWorkout.deleteMany({ title: /^Test.*/ });
    await Goal.deleteMany({ name: /^Test.*/ });
    await UserGoalProgress.deleteMany({});
    await Plan.deleteMany({ name: /^Test.*/ });
    await ExternalActivity.deleteMany({ name: /^Test.*/ });
    await Discipline.deleteMany({ name: /^test.*/ });
    await WorkoutType.deleteMany({ name: /^test.*/ });
    console.log('🧹 Cleaned up existing test data\n');

    // Test 1: Create User
    console.log('1️⃣ Testing User model...');
    const testUser = await User.create({
      email: 'test-all@synergyfit.com',
      password: 'password123',
      name: 'Test All User',
      profile: {
        age: 28,
        weight: 75,
        height: 180,
        fitnessLevel: 'intermediate'
      }
    });
    console.log('✅ User created:', testUser.name);

    // Test 2: Create Disciplines
    console.log('\n2️⃣ Testing Discipline model...');
    const strengthDiscipline = await Discipline.create({
      name: 'test-strength',
      displayName: 'Test Strength',
      description: 'Test strength training discipline',
      category: 'strength',
      equipment: {
        required: ['barbell', 'weights'],
        optional: ['bench', 'rack']
      }
    });
    console.log('✅ Discipline created:', strengthDiscipline.displayName);

    // Test 3: Create Workout Types
    console.log('\n3️⃣ Testing WorkoutType model...');
    const strengthType = await WorkoutType.create({
      name: 'test-strength',
      displayName: 'Test Strength Training',
      description: 'Test strength workout type',
      characteristics: {
        primaryFocus: 'muscle building',
        typicalDuration: {
          min: 45,
          max: 90,
          average: 60
        }
      },
      suitableFor: {
        goals: ['muscle_building', 'strength'],
        fitnessLevels: ['intermediate', 'advanced']
      }
    });
    console.log('✅ WorkoutType created:', strengthType.displayName);

    // Test 4: Create Exercise
    console.log('\n4️⃣ Testing Exercise model...');
    const testExercise = await Exercise.create({
      name: 'Test Barbell Squat',
      description: 'Test compound leg exercise',
      muscles: ['quadriceps', 'glutes'],
      secondaryMuscles: ['hamstrings', 'core'],
      discipline: ['test-strength'],
      equipment: ['barbell', 'weights'],
      difficulty: 'intermediate',
      strain: {
        intensity: 'high',
        load: 'heavy',
        durationType: 'reps',
        typicalVolume: '3x8'
      },
      createdBy: testUser._id
    });
    console.log('✅ Exercise created:', testExercise.name);

    // Test 5: Create PredefinedWorkout
    console.log('\n5️⃣ Testing PredefinedWorkout model...');
    const predefinedWorkout = await PredefinedWorkout.create({
      title: 'Test Beginner Strength',
      description: 'Test workout for beginners',
      type: 'strength',
      difficulty: 'beginner',
      durationMinutes: 45,
      targetMuscles: ['quadriceps', 'glutes'],
      equipment: ['barbell'],
      exercises: [{
        exerciseId: testExercise._id,
        exerciseName: testExercise.name,
        order: 1,
        sets: [
          { reps: 8, restSeconds: 90 },
          { reps: 8, restSeconds: 90 },
          { reps: 8, restSeconds: 120 }
        ]
      }],
      tags: ['beginner', 'legs'],
      createdBy: testUser._id
    });
    console.log('✅ PredefinedWorkout created:', predefinedWorkout.title);
    console.log('   Virtual totalSets:', predefinedWorkout.totalSets);
    console.log('   Virtual estimatedCalories:', predefinedWorkout.estimatedCalories);

    // Test 6: Create Goal
    console.log('\n6️⃣ Testing Goal model...');
    const testGoal = await Goal.create({
      name: 'Test First Barbell Squat',
      description: 'Achieve first proper barbell squat with bodyweight',
      category: 'strength',
      discipline: ['test-strength'],
      difficultyLevel: 'beginner',
      estimatedWeeks: 8,
      milestones: [
        {
          name: 'Learn form',
          description: 'Master bodyweight squat form',
          criteria: 'Complete 3x15 bodyweight squats with proper form',
          order: 1,
          estimatedWeeks: 2
        },
        {
          name: 'Add weight',
          description: 'Progress to barbell',
          criteria: 'Complete 3x8 with empty barbell',
          order: 2,
          estimatedWeeks: 4
        }
      ],
      targetMetrics: {
        weight: 60, // 60kg squat
        reps: 8
      },
      recommendedExercises: [testExercise._id]
    });
    console.log('✅ Goal created:', testGoal.name);
    console.log('   Virtual milestoneCount:', testGoal.milestoneCount);
    console.log('   Virtual difficultyScore:', testGoal.difficultyScore);

    // Test 7: Create UserGoalProgress
    console.log('\n7️⃣ Testing UserGoalProgress model...');
    const goalProgress = await UserGoalProgress.create({
      userId: testUser._id,
      goalId: testGoal._id,
      status: 'active',
      targetDate: new Date(Date.now() + 8 * 7 * 24 * 60 * 60 * 1000), // 8 weeks
      milestoneProgress: testGoal.milestones.map((milestone, index) => ({
        milestoneId: milestone._id,
        milestoneIndex: index,
        status: index === 0 ? 'in_progress' : 'pending'
      })),
      motivation: 'Want to build leg strength for hiking'
    });
    console.log('✅ UserGoalProgress created for goal:', testGoal.name);
    console.log('   Virtual completionPercentage:', goalProgress.completionPercentage);
    console.log('   Virtual daysUntilTarget:', goalProgress.daysUntilTarget);

    // Test 8: Create Workout
    console.log('\n8️⃣ Testing Workout model...');
    const testWorkout = await Workout.create({
      userId: testUser._id,
      title: 'Test Leg Day',
      date: new Date(),
      type: 'strength',
      status: 'completed',
      durationMinutes: 60,
      exercises: [{
        exerciseId: testExercise._id,
        exerciseName: testExercise.name,
        order: 1,
        sets: [
          { targetReps: 8, actualReps: 8, weight: 50, rpe: 7, restSeconds: 90, isCompleted: true },
          { targetReps: 8, actualReps: 8, weight: 50, rpe: 8, restSeconds: 90, isCompleted: true },
          { targetReps: 8, actualReps: 6, weight: 50, rpe: 9, restSeconds: 120, isCompleted: true }
        ]
      }],
      muscleStrain: {
        legs: 8,
        core: 4
      }
    });
    console.log('✅ Workout created:', testWorkout.title);
    console.log('   Virtual completionPercentage:', testWorkout.completionPercentage);
    console.log('   Calculated totalStrain:', testWorkout.totalStrain);

    // Test 9: Create Plan
    console.log('\n9️⃣ Testing Plan model...');
    const testPlan = await Plan.create({
      userId: testUser._id,
      name: 'Test 4-Week Strength Plan',
      description: 'Test beginner strength building plan',
      goalId: testGoal._id,
      schedule: {
        weeksTotal: 4,
        workoutsPerWeek: 3,
        restDays: [0, 3, 6], // Sunday, Wednesday, Saturday
        preferredWorkoutDays: [1, 2, 4] // Monday, Tuesday, Thursday
      },
      weeks: [
        {
          weekNumber: 1,
          focus: 'Form and technique',
          workouts: [
            {
              dayOfWeek: 1,
              workoutType: 'predefined',
              predefinedWorkoutId: predefinedWorkout._id
            }
          ]
        }
      ]
    });
    console.log('✅ Plan created:', testPlan.name);
    console.log('   Virtual durationDays:', testPlan.durationDays);
    console.log('   Virtual completionPercentage:', testPlan.completionPercentage);

    // Test 10: Create ExternalActivity
    console.log('\n🔟 Testing ExternalActivity model...');
    const externalActivity = await ExternalActivity.create({
      userId: testUser._id,
      date: new Date(),
      activityType: 'running',
      name: 'Test Morning Run',
      source: 'manual',
      duration: 1800, // 30 minutes
      distance: 5000, // 5km
      metrics: {
        heartRate: {
          average: 150,
          max: 170
        },
        pace: 6, // 6 min/km
        calories: 350
      },
      muscleStrain: {
        legs: 6,
        core: 2
      },
      location: {
        name: 'Test Park',
        city: 'Test City'
      }
    });
    console.log('✅ ExternalActivity created:', externalActivity.name);
    console.log('   Virtual durationMinutes:', externalActivity.durationMinutes);
    console.log('   Virtual totalStrain:', externalActivity.totalStrain);
    console.log('   Estimated calories:', externalActivity.estimateCalories(75));

    // Test static methods
    console.log('\n🔍 Testing static methods...');
    
    // Test Goal static methods
    const beginnerGoals = await Goal.findBeginnerFriendly();
    console.log('✅ Found', beginnerGoals.length, 'beginner-friendly goals');
    
    // Test PredefinedWorkout static methods
    const popularWorkouts = await PredefinedWorkout.findPopular(5);
    console.log('✅ Found', popularWorkouts.length, 'popular workouts');
    
    // Test UserGoalProgress static methods
    const userStats = await UserGoalProgress.getUserStats(testUser._id);
    console.log('✅ User goal stats:', userStats);
    
    // Test Workout static methods
    const workoutStats = await Workout.getUserStats(testUser._id);
    console.log('✅ User workout stats:', workoutStats);

    console.log('\n🎉 All models tested successfully! Database schema is complete and working.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testAllModels();