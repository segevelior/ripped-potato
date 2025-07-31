const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Set base URL for API
const API_BASE_URL = 'http://localhost:5001/api/v1';

// Test data
let authToken = '';
let testUserId = '';
let testExerciseId = '';
let testPredefinedWorkoutId = '';
let testGoalId = '';
let testPlanId = '';
let testExternalActivityId = '';
let testDisciplineId = '';
let testWorkoutTypeId = '';

async function testAllNewEndpoints() {
  try {
    console.log('🧪 Starting comprehensive API test for new endpoints...\n');

    // Step 1: Test authentication (get token)
    console.log('1️⃣ Testing Authentication...');
    const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
      email: 'test-new-api@synergyfit.com',
      password: 'password123',
      name: 'Test New API User',
      profile: {
        age: 30,
        weight: 75,
        height: 180,
        fitnessLevel: 'intermediate'
      }
    });
    
    authToken = registerResponse.data.token;
    testUserId = registerResponse.data.user.id;
    console.log('✅ Authentication successful, token obtained\n');

    // Step 2: Create test exercise (needed for other tests)
    console.log('2️⃣ Creating test exercise...');
    const exerciseResponse = await axios.post(`${API_BASE_URL}/exercises`, {
      name: 'Test Deadlift',
      description: 'Test compound exercise',
      muscles: ['hamstrings', 'glutes', 'back'],
      equipment: ['barbell'],
      difficulty: 'intermediate'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testExerciseId = exerciseResponse.data._id;
    console.log('✅ Test exercise created\n');

    // Step 3: Test Discipline endpoints
    console.log('3️⃣ Testing Discipline endpoints...');
    
    // Create discipline
    const disciplineResponse = await axios.post(`${API_BASE_URL}/disciplines`, {
      name: 'test-powerlifting',
      displayName: 'Test Powerlifting',
      description: 'Test powerlifting discipline',
      category: 'strength',
      characteristics: {
        primaryFocus: 'Maximum strength development',
        benefits: ['Increased strength', 'Better body mechanics'],
        skillLevel: 'requires-experience'
      },
      equipment: {
        required: ['barbell', 'plates'],
        optional: ['belt', 'chalk']
      }
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testDisciplineId = disciplineResponse.data._id;
    console.log('  ✅ Discipline created:', disciplineResponse.data.displayName);

    // Get all disciplines
    const disciplinesResponse = await axios.get(`${API_BASE_URL}/disciplines`);
    console.log('  ✅ Retrieved', disciplinesResponse.data.length, 'disciplines');

    // Get beginner-friendly disciplines
    const beginnerDisciplinesResponse = await axios.get(`${API_BASE_URL}/disciplines?beginnerFriendly=true`);
    console.log('  ✅ Retrieved', beginnerDisciplinesResponse.data.length, 'beginner-friendly disciplines\n');

    // Step 4: Test WorkoutType endpoints
    console.log('4️⃣ Testing WorkoutType endpoints...');
    
    // Create workout type
    const workoutTypeResponse = await axios.post(`${API_BASE_URL}/workout-types`, {
      name: 'test-powerlifting-session',
      displayName: 'Test Powerlifting Session',
      description: 'Test powerlifting workout type',
      characteristics: {
        primaryFocus: 'strength development',
        intensityRange: {
          min: 'high',
          max: 'max'
        },
        typicalDuration: {
          min: 60,
          max: 120,
          average: 90
        }
      },
      suitableFor: {
        goals: ['strength', 'muscle_building'],
        fitnessLevels: ['intermediate', 'advanced']
      }
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testWorkoutTypeId = workoutTypeResponse.data._id;
    console.log('  ✅ WorkoutType created:', workoutTypeResponse.data.displayName);

    // Get workout types by fitness level
    const intermediateTypesResponse = await axios.get(`${API_BASE_URL}/workout-types/fitness-level/intermediate`);
    console.log('  ✅ Retrieved', intermediateTypesResponse.data.length, 'intermediate workout types');

    // Get recommendations
    const recommendationsResponse = await axios.get(`${API_BASE_URL}/workout-types/recommendations/intermediate?goals=strength,muscle_building`);
    console.log('  ✅ Retrieved', recommendationsResponse.data.length, 'workout type recommendations\n');

    // Step 5: Test PredefinedWorkout endpoints
    console.log('5️⃣ Testing PredefinedWorkout endpoints...');
    
    // Create predefined workout
    const predefinedWorkoutResponse = await axios.post(`${API_BASE_URL}/predefined-workouts`, {
      title: 'Test Power Session',
      description: 'Test powerlifting session',
      type: 'strength',
      difficulty: 'intermediate',
      durationMinutes: 90,
      targetMuscles: ['hamstrings', 'glutes', 'back'],
      equipment: ['barbell'],
      exercises: [{
        exerciseId: testExerciseId,
        exerciseName: 'Test Deadlift',
        order: 1,
        sets: [
          { reps: 5, restSeconds: 180 },
          { reps: 3, restSeconds: 180 },
          { reps: 1, restSeconds: 300 }
        ]
      }],
      tags: ['powerlifting', 'strength']
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testPredefinedWorkoutId = predefinedWorkoutResponse.data._id;
    console.log('  ✅ PredefinedWorkout created:', predefinedWorkoutResponse.data.title);

    // Get all predefined workouts
    const predefinedWorkoutsResponse = await axios.get(`${API_BASE_URL}/predefined-workouts`);
    console.log('  ✅ Retrieved', predefinedWorkoutsResponse.data.workouts.length, 'predefined workouts');

    // Rate the workout
    await axios.post(`${API_BASE_URL}/predefined-workouts/${testPredefinedWorkoutId}/rate`, {
      rating: 5
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Rated predefined workout\n');

    // Step 6: Test Goal endpoints
    console.log('6️⃣ Testing Goal endpoints...');
    
    // Create goal
    const goalResponse = await axios.post(`${API_BASE_URL}/goals`, {
      name: 'Test 200kg Deadlift',
      description: 'Achieve a 200kg deadlift with proper form',
      category: 'strength',
      discipline: ['test-powerlifting'],
      difficultyLevel: 'advanced',
      estimatedWeeks: 16,
      milestones: [
        {
          name: 'Master form',
          description: 'Perfect deadlift technique',
          criteria: 'Complete 5x5 at 140kg with perfect form',
          order: 1,
          estimatedWeeks: 4
        },
        {
          name: 'Build strength',
          description: 'Progressive overload',
          criteria: 'Complete 3x3 at 180kg',
          order: 2,
          estimatedWeeks: 8
        },
        {
          name: 'Peak strength',
          description: 'Final push to 200kg',
          criteria: '1RM at 200kg',
          order: 3,
          estimatedWeeks: 4
        }
      ],
      targetMetrics: {
        weight: 200,
        reps: 1
      },
      recommendedExercises: [testExerciseId]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testGoalId = goalResponse.data._id;
    console.log('  ✅ Goal created:', goalResponse.data.name);

    // Start pursuing the goal
    const goalProgressResponse = await axios.post(`${API_BASE_URL}/goals/${testGoalId}/start`, {
      motivation: 'Want to hit a 200kg deadlift for strength'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Goal progress started');

    // Get user's goal progress
    const userGoalsResponse = await axios.get(`${API_BASE_URL}/goals/user/progress`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Retrieved', userGoalsResponse.data.length, 'user goal progress entries\n');

    // Step 7: Test Plan endpoints
    console.log('7️⃣ Testing Plan endpoints...');
    
    // Create plan
    const planResponse = await axios.post(`${API_BASE_URL}/plans`, {
      name: 'Test 8-Week Strength Plan',
      description: 'Test strength building plan',
      goalId: testGoalId,
      schedule: {
        weeksTotal: 8,
        workoutsPerWeek: 3,
        restDays: [0, 3, 6],
        preferredWorkoutDays: [1, 2, 4]
      },
      weeks: [
        {
          weekNumber: 1,
          focus: 'Form and technique',
          workouts: [
            {
              dayOfWeek: 1,
              workoutType: 'predefined',
              predefinedWorkoutId: testPredefinedWorkoutId
            }
          ]
        }
      ]
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testPlanId = planResponse.data._id;
    console.log('  ✅ Plan created:', planResponse.data.name);

    // Start the plan
    await axios.post(`${API_BASE_URL}/plans/${testPlanId}/start`, {
      startDate: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Plan started');

    // Get user's active plans
    const activePlansResponse = await axios.get(`${API_BASE_URL}/plans/active`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Retrieved', activePlansResponse.data.length, 'active plans\n');

    // Step 8: Test ExternalActivity endpoints
    console.log('8️⃣ Testing ExternalActivity endpoints...');
    
    // Create external activity
    const externalActivityResponse = await axios.post(`${API_BASE_URL}/external-activities`, {
      date: new Date(),
      activityType: 'running',
      name: 'Test Morning Run',
      source: 'manual',
      duration: 2400, // 40 minutes
      distance: 8000, // 8km
      metrics: {
        heartRate: {
          average: 155,
          max: 175
        },
        pace: 5, // 5 min/km
        calories: 400
      },
      muscleStrain: {
        legs: 7,
        core: 3
      }
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    testExternalActivityId = externalActivityResponse.data._id;
    console.log('  ✅ ExternalActivity created:', externalActivityResponse.data.name);

    // Get user's external activities
    const activitiesResponse = await axios.get(`${API_BASE_URL}/external-activities`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Retrieved', activitiesResponse.data.activities.length, 'external activities');

    // Get activity stats
    const statsResponse = await axios.get(`${API_BASE_URL}/external-activities/stats/overview?days=30`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Retrieved activity statistics\n');

    // Step 9: Test search endpoints
    console.log('9️⃣ Testing Search endpoints...');
    
    // Search disciplines
    const disciplineSearchResponse = await axios.get(`${API_BASE_URL}/disciplines/search/power`);
    console.log('  ✅ Search found', disciplineSearchResponse.data.length, 'disciplines for "power"');

    // Search goals
    const goalSearchResponse = await axios.get(`${API_BASE_URL}/goals/search/deadlift`);
    console.log('  ✅ Search found', goalSearchResponse.data.length, 'goals for "deadlift"');

    // Search predefined workouts
    const workoutSearchResponse = await axios.get(`${API_BASE_URL}/predefined-workouts/search/power`);
    console.log('  ✅ Search found', workoutSearchResponse.data.length, 'predefined workouts for "power"\n');

    // Step 10: Test statistics endpoints
    console.log('🔟 Testing Statistics endpoints...');
    
    // Get discipline stats by category
    const disciplineStatsResponse = await axios.get(`${API_BASE_URL}/disciplines/stats/categories`);
    console.log('  ✅ Retrieved discipline statistics by category');

    // Get workout type stats by goals
    const workoutTypeStatsResponse = await axios.get(`${API_BASE_URL}/workout-types/stats/goals`);
    console.log('  ✅ Retrieved workout type statistics by goals');

    // Get user goal stats
    const userStatsResponse = await axios.get(`${API_BASE_URL}/goals/user/stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('  ✅ Retrieved user goal statistics\n');

    console.log('🎉 All new API endpoints tested successfully!');
    console.log('\n📊 Test Summary:');
    console.log('- ✅ Disciplines: Created, retrieved, searched');
    console.log('- ✅ WorkoutTypes: Created, retrieved, recommendations');
    console.log('- ✅ PredefinedWorkouts: Created, retrieved, rated, searched');
    console.log('- ✅ Goals: Created, started, progress tracked, searched');
    console.log('- ✅ Plans: Created, started, active plans retrieved');
    console.log('- ✅ ExternalActivities: Created, retrieved, statistics');
    console.log('- ✅ Search: Working across multiple entities');
    console.log('- ✅ Statistics: Category and user-specific stats');
    console.log('\n🔥 Backend API is fully functional and ready for frontend integration!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

// Connect to database and run tests
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato')
  .then(() => {
    console.log('✅ Connected to MongoDB\n');
    return testAllNewEndpoints();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err))
  .finally(() => {
    mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  });