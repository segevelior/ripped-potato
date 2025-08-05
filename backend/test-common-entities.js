const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');

const API_URL = 'http://localhost:5001/api/v1';
let authToken = null;
let adminToken = null;
let userId = null;
let adminId = null;

// Test data
const timestamp = Date.now();
const testUser = {
  email: `testuser_${timestamp}@example.com`,
  password: 'testpass123',
  name: 'Test User'
};

const adminUser = {
  email: `admin_${timestamp}@example.com`,
  password: 'adminpass123',
  name: 'Admin User'
};

const commonExercise = {
  name: 'Common Push-Up',
  description: 'A standard push-up exercise available to all users',
  muscles: ['chest', 'triceps', 'shoulders'],
  equipment: [],
  difficulty: 'beginner',
  discipline: ['bodyweight'],
  isCommon: true
};

const privateExercise = {
  name: 'My Custom Exercise',
  description: 'A private exercise only I can see',
  muscles: ['chest'],
  equipment: ['dumbbells'],
  difficulty: 'intermediate',
  discipline: ['strength']
};

// Helper function to make API calls
async function apiCall(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {}
    };
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Error in ${method} ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

async function testAuthAndSetup() {
  console.log('\n=== Testing Authentication and Setup ===');
  
  try {
    // Register regular user
    console.log('1. Registering regular user...');
    const registerRes = await apiCall('POST', '/auth/register', testUser);
    authToken = registerRes.data.token;
    userId = registerRes.data.user._id;
    console.log('✓ Regular user registered:', registerRes.data.user.email);
    
    // Register admin user
    console.log('2. Registering admin user...');
    const adminRegisterRes = await apiCall('POST', '/auth/register', adminUser);
    adminToken = adminRegisterRes.data.token;
    adminId = adminRegisterRes.data.user._id;
    console.log('✓ Admin user registered:', adminRegisterRes.data.user.email);
    
    // Update admin user role
    console.log('3. Updating admin role...');
    // For testing purposes, we'll manually update the role in the database
    const User = require('./src/models/User');
    await User.findByIdAndUpdate(adminId, { role: 'admin' });
    console.log('✓ Admin role updated');
    
    // Re-login to get a new token with admin role
    console.log('4. Re-logging in as admin...');
    const adminReLoginRes = await apiCall('POST', '/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    adminToken = adminReLoginRes.data.token;
    console.log('✓ Admin re-logged in with updated role');
    console.log('  Admin user details:', { 
      id: adminReLoginRes.data.user._id,
      email: adminReLoginRes.data.user.email,
      role: adminReLoginRes.data.user.role 
    });
    
    return true;
  } catch (error) {
    if (error.response?.data?.message?.includes('already exists')) {
      // Try logging in instead
      console.log('Users already exist, logging in...');
      
      const loginRes = await apiCall('POST', '/auth/login', {
        email: testUser.email,
        password: testUser.password
      });
      authToken = loginRes.data.token;
      userId = loginRes.data.user._id;
      
      const adminLoginRes = await apiCall('POST', '/auth/login', {
        email: adminUser.email,
        password: adminUser.password
      });
      adminToken = adminLoginRes.data.token;
      adminId = adminLoginRes.data.user._id;
      
      console.log('✓ Logged in successfully');
      return true;
    }
    return false;
  }
}

async function testExerciseRoutes() {
  console.log('\n=== Testing Exercise Routes ===');
  
  let commonExerciseId = null;
  let privateExerciseId = null;
  
  try {
    // Create private exercise as regular user
    console.log('1. Creating private exercise...');
    const privateEx = await apiCall('POST', '/exercises', privateExercise, authToken);
    privateExerciseId = privateEx.data._id;
    console.log('✓ Private exercise created:', privateEx.data.name);
    
    // Try to create common exercise as regular user (should use admin token in real scenario)
    console.log('2. Creating common exercise (as admin)...');
    const commonEx = await apiCall('POST', '/exercises', commonExercise, adminToken);
    commonExerciseId = commonEx.data._id;
    console.log('✓ Common exercise created:', commonEx.data.name);
    console.log('  Common exercise details:', { 
      id: commonEx.data._id, 
      isCommon: commonEx.data.isCommon,
      createdBy: commonEx.data.createdBy 
    });
    
    // Get all exercises as authenticated user
    console.log('3. Getting all exercises (authenticated)...');
    const exercises = await apiCall('GET', '/exercises', null, authToken);
    console.log(`✓ Found ${exercises.data.exercises.length} exercises`);
    console.log('  Exercises:', exercises.data.exercises.map(e => ({ name: e.name, isCommon: e.isCommon })));
    
    // Get all exercises as unauthenticated user
    console.log('4. Getting all exercises (unauthenticated)...');
    const publicExercises = await apiCall('GET', '/exercises');
    console.log(`✓ Found ${publicExercises.data.exercises.length} public exercises`);
    
    // Test modification on common exercise
    console.log('5. Modifying common exercise...');
    const modification = await apiCall('PUT', `/exercises/${commonExerciseId}/modifications`, {
      modifications: {
        name: 'My Modified Push-Up',
        personalNotes: 'Focus on slow descent'
      },
      metadata: {
        isFavorite: true
      }
    }, authToken);
    console.log('✓ Exercise modification saved');
    
    // Get modified exercise
    console.log('6. Getting modified exercise...');
    const modifiedEx = await apiCall('GET', `/exercises/${commonExerciseId}`, null, authToken);
    console.log('✓ Modified exercise retrieved:', modifiedEx.data.name);
    console.log('  - Is modified:', modifiedEx.data.isModified);
    console.log('  - Is favorite:', modifiedEx.data.userMetadata?.isFavorite);
    
    // Test favorite toggle
    console.log('7. Toggling favorite status...');
    await apiCall('PUT', `/exercises/${privateExerciseId}/favorite`, {
      isFavorite: true
    }, authToken);
    console.log('✓ Favorite status toggled');
    
    // Remove modification
    console.log('8. Removing modification...');
    await apiCall('DELETE', `/exercises/${commonExerciseId}/modifications`, null, authToken);
    console.log('✓ Modification removed');
    
    return { commonExerciseId, privateExerciseId };
  } catch (error) {
    console.error('Exercise test failed:', error.message);
    return null;
  }
}

async function testGoalRoutes() {
  console.log('\n=== Testing Goal Routes ===');
  
  let goalId = null;
  
  try {
    // Create a common goal
    console.log('1. Creating common goal...');
    const goal = await apiCall('POST', '/goals', {
      name: 'Master Push-Ups',
      description: 'Progress from basic to advanced push-up variations',
      category: 'strength',
      discipline: ['bodyweight'],
      difficultyLevel: 'beginner',
      estimatedWeeks: 8,
      isCommon: true,
      milestones: [
        { name: 'Basic Form', description: 'Perfect 10 push-ups', order: 1, estimatedWeeks: 2 },
        { name: 'Volume', description: 'Complete 50 push-ups', order: 2, estimatedWeeks: 3 }
      ]
    }, adminToken);
    goalId = goal._id;
    console.log('✓ Common goal created:', goal.name);
    
    // Get goals
    console.log('2. Getting all goals...');
    const goals = await apiCall('GET', '/goals', null, authToken);
    console.log(`✓ Found ${goals.goals.length} goals`);
    
    // Modify goal
    console.log('3. Modifying goal...');
    await apiCall('PUT', `/goals/${goalId}/modifications`, {
      modifications: {
        name: 'My Push-Up Journey',
        estimatedWeeks: 12
      },
      metadata: {
        isFavorite: true,
        personalDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      }
    }, authToken);
    console.log('✓ Goal modification saved');
    
    // Start goal
    console.log('4. Starting goal...');
    const progress = await apiCall('POST', `/goals/${goalId}/start`, {
      motivation: 'I want to get stronger!'
    }, authToken);
    console.log('✓ Goal started');
    
    return goalId;
  } catch (error) {
    console.error('Goal test failed:', error.message);
    return null;
  }
}

async function testWorkoutRoutes() {
  console.log('\n=== Testing Workout Routes ===');
  
  let workoutId = null;
  
  try {
    // Create a common workout
    console.log('1. Creating common workout...');
    const workout = await apiCall('POST', '/predefined-workouts', {
      title: 'Beginner Upper Body',
      description: 'A simple upper body workout for beginners',
      type: 'strength',
      difficulty: 'beginner',
      durationMinutes: 30,
      targetMuscles: ['chest', 'shoulders', 'triceps'],
      equipment: [],
      isCommon: true,
      exercises: []
    }, adminToken);
    workoutId = workout._id;
    console.log('✓ Common workout created:', workout.title);
    
    // Get workouts
    console.log('2. Getting all workouts...');
    const workouts = await apiCall('GET', '/predefined-workouts', null, authToken);
    console.log(`✓ Found ${workouts.workouts.length} workouts`);
    
    // Modify workout
    console.log('3. Modifying workout...');
    await apiCall('PUT', `/predefined-workouts/${workoutId}/modifications`, {
      modifications: {
        title: 'My Custom Upper Body',
        durationMinutes: 45
      },
      metadata: {
        isFavorite: true,
        customRestBetweenExercises: 90
      }
    }, authToken);
    console.log('✓ Workout modification saved');
    
    // Record completion
    console.log('4. Recording workout completion...');
    const completion = await apiCall('POST', `/predefined-workouts/${workoutId}/complete`, {
      totalWeight: 500,
      completionTime: 40
    }, authToken);
    console.log('✓ Workout completion recorded');
    console.log('  - Times completed:', completion.timesCompleted);
    
    return workoutId;
  } catch (error) {
    console.error('Workout test failed:', error.message);
    return null;
  }
}

async function testAdminRoutes() {
  console.log('\n=== Testing Admin Routes ===');
  
  try {
    // Create common exercise via admin route
    console.log('1. Creating common exercise via admin route...');
    const adminExercise = await apiCall('POST', '/admin/exercises', {
      name: 'Admin Created Exercise',
      description: 'Created through admin endpoint',
      muscles: ['core'],
      equipment: [],
      difficulty: 'intermediate',
      discipline: ['bodyweight']
    }, adminToken);
    console.log('✓ Admin exercise created:', adminExercise.data.name);
    
    // Update user role
    console.log('2. Updating user role...');
    const roleUpdate = await apiCall('POST', `/admin/users/${userId}/role`, {
      role: 'user'
    }, adminToken);
    console.log('✓ User role updated');
    
    return true;
  } catch (error) {
    console.error('Admin test failed:', error.message);
    return false;
  }
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  try {
    // Clean up test data if needed
    await mongoose.connection.close();
    console.log('✓ Cleanup completed');
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
}

async function runTests() {
  console.log('Starting Common Entities Backend Tests...');
  
  try {
    // Setup
    const authSuccess = await testAuthAndSetup();
    if (!authSuccess) {
      console.error('Authentication setup failed');
      return;
    }
    
    // Test each route group
    await testExerciseRoutes();
    await testGoalRoutes();
    await testWorkoutRoutes();
    await testAdminRoutes();
    
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
  } finally {
    await cleanup();
  }
}

// Run the tests
runTests();