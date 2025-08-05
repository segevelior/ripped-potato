const axios = require('axios');

const API_URL = 'http://localhost:5001/api/v1';

async function testUIFeatures() {
  console.log('Testing Common/Private Exercise UI Features...\n');
  
  // Test 1: Get exercises without authentication
  console.log('1. Testing unauthenticated access (should only see common exercises):');
  try {
    const response = await axios.get(`${API_URL}/exercises`);
    const data = response.data;
    console.log(`   - Total exercises: ${data.data.exercises.length}`);
    console.log(`   - All common: ${data.data.exercises.every(ex => ex.isCommon)}`);
    console.log(`   - Sample exercise:`, {
      name: data.data.exercises[0]?.name,
      isCommon: data.data.exercises[0]?.isCommon,
      isPrivate: data.data.exercises[0]?.isPrivate,
      canEdit: data.data.exercises[0]?.canEdit
    });
  } catch (error) {
    console.error('   ERROR:', error.message);
  }
  
  // Test 2: Login and get exercises with authentication
  console.log('\n2. Testing authenticated access:');
  try {
    // Login first
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'test-all@synergyfit.com',
      password: 'password123'
    });
    
    const loginData = loginResponse.data;
    const token = loginData.data.token;
    console.log('   - Login successful');
    console.log('   - User role:', loginData.data.user.role);
    
    // Get exercises with auth
    const exercisesResponse = await axios.get(`${API_URL}/exercises`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const exercisesData = exercisesResponse.data;
    const exercises = exercisesData.data.exercises;
    
    console.log(`   - Total exercises: ${exercises.length}`);
    console.log(`   - Common exercises: ${exercises.filter(ex => ex.isCommon).length}`);
    console.log(`   - Private exercises: ${exercises.filter(ex => ex.isPrivate).length}`);
    console.log(`   - Modified exercises: ${exercises.filter(ex => ex.isModified).length}`);
    
    // Show sample of each type
    const commonEx = exercises.find(ex => ex.isCommon && !ex.isModified);
    const privateEx = exercises.find(ex => ex.isPrivate);
    
    if (commonEx) {
      console.log('\n   Common exercise sample:', {
        name: commonEx.name,
        isCommon: commonEx.isCommon,
        isPrivate: commonEx.isPrivate,
        isModified: commonEx.isModified,
        canEdit: commonEx.canEdit
      });
    }
    
    if (privateEx) {
      console.log('\n   Private exercise sample:', {
        name: privateEx.name,
        isCommon: privateEx.isCommon,
        isPrivate: privateEx.isPrivate,
        canEdit: privateEx.canEdit
      });
    }
    
    // Test 3: Customize a common exercise
    console.log('\n3. Testing exercise customization:');
    if (commonEx) {
      const customizeResponse = await axios.put(
        `${API_URL}/exercises/${commonEx._id}/modifications`,
        {
          modifications: {
            name: `${commonEx.name} - My Version`,
            personalNotes: 'Focus on form, not speed'
          },
          metadata: {
            isFavorite: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (customizeResponse.status === 200) {
        console.log('   - Successfully customized exercise:', commonEx.name);
        
        // Get updated exercise
        const updatedResponse = await axios.get(`${API_URL}/exercises`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const updatedData = updatedResponse.data;
        const modifiedEx = updatedData.data.exercises.find(ex => ex._id === commonEx._id);
        
        console.log('   - Modified exercise:', {
          name: modifiedEx.name,
          isModified: modifiedEx.isModified,
          userMetadata: modifiedEx.userMetadata
        });
      } else {
        console.error('   - Customization failed:', customizeResponse.data);
      }
    }
    
  } catch (error) {
    console.error('   ERROR:', error.message);
  }
  
  console.log('\n✅ UI feature testing complete!');
}

testUIFeatures().catch(console.error);