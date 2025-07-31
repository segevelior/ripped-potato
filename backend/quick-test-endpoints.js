const axios = require('axios');

const API_BASE_URL = 'http://localhost:5001/api/v1';

async function quickTest() {
  try {
    console.log('🧪 Quick endpoint test...');
    
    // Test health
    const health = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Health:', health.data.status);
    
    // Test disciplines (public endpoint)
    const disciplines = await axios.get(`${API_BASE_URL}/disciplines`);
    console.log('✅ Disciplines endpoint working, returned', disciplines.data.length, 'items');
    
    // Test workout types (public endpoint)
    const workoutTypes = await axios.get(`${API_BASE_URL}/workout-types`);
    console.log('✅ Workout types endpoint working, returned', workoutTypes.data.length, 'items');
    
    // Test predefined workouts (public endpoint)
    const predefinedWorkouts = await axios.get(`${API_BASE_URL}/predefined-workouts`);
    console.log('✅ Predefined workouts endpoint working, returned', predefinedWorkouts.data.workouts.length, 'items');
    
    // Test goals (public endpoint)
    const goals = await axios.get(`${API_BASE_URL}/goals`);
    console.log('✅ Goals endpoint working, returned', goals.data.goals.length, 'items');
    
    console.log('\n🎉 All public endpoints are working correctly!');
    console.log('✅ Server is ready for comprehensive testing');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

quickTest();