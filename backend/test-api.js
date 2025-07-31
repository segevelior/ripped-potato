const axios = require('axios');

const API_BASE = 'http://localhost:5001/api/v1';
let authToken = '';

async function testAPI() {
  try {
    console.log('🧪 Testing SynergyFit API endpoints...\n');

    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health:', healthResponse.data.message);

    // Test 2: Register user
    console.log('\n2️⃣ Testing user registration...');
    const registerData = {
      email: 'api-test@synergyfit.com',
      password: 'testpass123',
      name: 'API Test User'
    };
    
    try {
      const registerResponse = await axios.post(`${API_BASE}/auth/register`, registerData);
      console.log('✅ User registered:', registerResponse.data.data.user.name);
      authToken = registerResponse.data.data.token;
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.message.includes('already exists')) {
        console.log('ℹ️ User already exists, trying login...');
        const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
          email: registerData.email,
          password: registerData.password
        });
        console.log('✅ User logged in:', loginResponse.data.data.user.name);
        authToken = loginResponse.data.data.token;
      } else {
        throw error;
      }
    }

    // Test 3: Get profile
    console.log('\n3️⃣ Testing get profile...');
    const headers = { Authorization: `Bearer ${authToken}` };
    const profileResponse = await axios.get(`${API_BASE}/auth/profile`, { headers });
    console.log('✅ Profile retrieved:', profileResponse.data.data.user.email);

    // Test 4: Create exercise
    console.log('\n4️⃣ Testing create exercise...');
    const exerciseData = {
      name: 'API Test Exercise',
      description: 'Created via API test',
      muscles: ['chest', 'triceps'],
      discipline: ['strength'],
      equipment: [],
      difficulty: 'beginner',
      strain: {
        intensity: 'moderate',
        load: 'bodyweight',
        durationType: 'reps',
        typicalVolume: '3x12'
      }
    };
    
    const exerciseResponse = await axios.post(`${API_BASE}/exercises`, exerciseData, { headers });
    console.log('✅ Exercise created:', exerciseResponse.data.data.exercise.name);
    const exerciseId = exerciseResponse.data.data.exercise._id;

    // Test 5: Get exercises
    console.log('\n5️⃣ Testing get exercises...');
    const exercisesResponse = await axios.get(`${API_BASE}/exercises`);
    console.log('✅ Exercises retrieved:', exercisesResponse.data.data.exercises.length, 'total');

    // Test 6: Create workout
    console.log('\n6️⃣ Testing create workout...');
    const workoutData = {
      title: 'API Test Workout',
      date: new Date().toISOString(),
      type: 'strength',
      status: 'planned',
      durationMinutes: 30,
      exercises: [{
        exerciseId: exerciseId,
        order: 1,
        sets: [
          { targetReps: 12, rpe: 7, restSeconds: 60 },
          { targetReps: 12, rpe: 8, restSeconds: 60 },
          { targetReps: 10, rpe: 8, restSeconds: 90 }
        ]
      }],
      muscleStrain: {
        chest: 7,
        triceps: 6
      }
    };
    
    const workoutResponse = await axios.post(`${API_BASE}/workouts`, workoutData, { headers });
    console.log('✅ Workout created:', workoutResponse.data.data.workout.title);

    // Test 7: Get workouts
    console.log('\n7️⃣ Testing get workouts...');
    const workoutsResponse = await axios.get(`${API_BASE}/workouts`, { headers });
    console.log('✅ Workouts retrieved:', workoutsResponse.data.data.workouts.length, 'total');

    // Test 8: Get workout stats
    console.log('\n8️⃣ Testing workout stats...');
    const statsResponse = await axios.get(`${API_BASE}/workouts/stats`, { headers });
    console.log('✅ Workout stats:', statsResponse.data.data.stats);

    console.log('\n🎉 All API tests passed! Backend is working correctly.');

  } catch (error) {
    console.error('❌ API test failed:', error.response?.data || error.message);
  }
}

// Install axios if not already installed
const { execSync } = require('child_process');
try {
  require('axios');
} catch (e) {
  console.log('Installing axios...');
  execSync('npm install axios', { stdio: 'inherit' });
}

testAPI();