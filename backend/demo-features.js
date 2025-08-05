const axios = require('axios');

const API_URL = 'http://localhost:5001/api/v1';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demoFeatures() {
  console.log('🎯 COMMON/PRIVATE ENTITIES DEMO\n');
  
  try {
    // 1. Show unauthenticated view
    console.log('1️⃣ UNAUTHENTICATED VIEW (only common exercises visible)');
    console.log('================================================');
    const publicView = await axios.get(`${API_URL}/exercises`);
    const publicExercises = publicView.data.data.exercises;
    console.log(`Total visible exercises: ${publicExercises.length}`);
    publicExercises.slice(0, 3).forEach(ex => {
      console.log(`- ${ex.name}: isCommon=${ex.isCommon}, isPrivate=${ex.isPrivate}`);
    });
    
    await wait(1000);
    
    // 2. Login as regular user
    console.log('\n2️⃣ REGULAR USER VIEW');
    console.log('================================================');
    const userLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'test-all@synergyfit.com',
      password: 'password123'
    });
    const userToken = userLogin.data.data.token;
    console.log('✓ Logged in as: test-all@synergyfit.com');
    
    const userView = await axios.get(`${API_URL}/exercises`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    const userExercises = userView.data.data.exercises;
    console.log(`\nTotal visible exercises: ${userExercises.length}`);
    console.log(`- Common exercises: ${userExercises.filter(e => e.isCommon).length}`);
    console.log(`- Private exercises: ${userExercises.filter(e => e.isPrivate).length}`);
    console.log(`- Modified exercises: ${userExercises.filter(e => e.isModified).length}`);
    
    console.log('\nSample exercises:');
    const commonEx = userExercises.find(e => e.isCommon && !e.isModified);
    const privateEx = userExercises.find(e => e.isPrivate);
    
    if (commonEx) {
      console.log(`\n📘 Common: "${commonEx.name}"`);
      console.log(`   - Can edit: ${commonEx.canEdit}`);
      console.log(`   - Is modified: ${commonEx.isModified || false}`);
    }
    
    if (privateEx) {
      console.log(`\n🔒 Private: "${privateEx.name}"`);
      console.log(`   - Can edit: ${privateEx.canEdit}`);
      console.log(`   - Created by me: true`);
    }
    
    await wait(1000);
    
    // 3. Customize a common exercise
    console.log('\n3️⃣ CUSTOMIZING A COMMON EXERCISE');
    console.log('================================================');
    if (commonEx) {
      console.log(`Customizing "${commonEx.name}"...`);
      
      await axios.put(
        `${API_URL}/exercises/${commonEx._id}/modifications`,
        {
          modifications: {
            name: `${commonEx.name} - Beginner Version`,
            description: 'Modified for beginners with easier progression',
            personalNotes: 'Start with wall push-ups, then progress to knee push-ups'
          },
          metadata: {
            isFavorite: true,
            tags: ['beginner', 'modified']
          }
        },
        { headers: { 'Authorization': `Bearer ${userToken}` } }
      );
      
      console.log('✓ Exercise customized successfully!');
      
      // Get the modified version
      const modifiedView = await axios.get(`${API_URL}/exercises`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const modifiedEx = modifiedView.data.data.exercises.find(e => e._id === commonEx._id);
      
      console.log(`\n✏️ Modified exercise:`);
      console.log(`   - Name: "${modifiedEx.name}"`);
      console.log(`   - Is modified: ${modifiedEx.isModified}`);
      console.log(`   - Is favorite: ${modifiedEx.userMetadata?.isFavorite}`);
      console.log(`   - Personal notes: "${modifiedEx.personalNotes || 'none'}"`);
    }
    
    await wait(1000);
    
    // 4. Admin view
    console.log('\n4️⃣ ADMIN USER VIEW');
    console.log('================================================');
    const adminLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@synergyfit.com',
      password: 'admin123'
    });
    const adminToken = adminLogin.data.data.token;
    console.log('✓ Logged in as: admin@synergyfit.com (admin role)');
    
    // Create a new common exercise
    console.log('\nCreating new common exercise as admin...');
    const newCommon = await axios.post(
      `${API_URL}/exercises`,
      {
        name: "Burpee",
        description: "Full body exercise combining squat, plank, and jump",
        isCommon: true,
        discipline: ["strength", "cardio"],
        muscles: ["full_body"],
        equipment: [],
        difficulty: "intermediate",
        strain: {
          intensity: "high",
          load: "bodyweight",
          duration_type: "reps",
          typical_volume: "3 sets of 10 reps"
        }
      },
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );
    
    console.log(`✓ Created new common exercise: "${newCommon.data.data.name}"`);
    
    await wait(1000);
    
    // 5. Show UI features
    console.log('\n5️⃣ UI FEATURES');
    console.log('================================================');
    console.log('The UI now includes:');
    console.log('• Filter buttons: All | Common | My Exercises | Customized | Favorites');
    console.log('• Visual badges on exercise cards:');
    console.log('  - 🌐 Common (shared by admin)');
    console.log('  - 🔒 Private (created by you)');
    console.log('  - ✏️ Modified (customized common exercise)');
    console.log('  - ⭐ Favorite');
    console.log('• Customize modal for common exercises');
    console.log('• Edit button behavior:');
    console.log('  - Common exercises → Opens customize modal');
    console.log('  - Private exercises → Goes to edit page');
    console.log('  - Modified exercises → Goes to edit page');
    console.log('• Delete restrictions:');
    console.log('  - Cannot delete common exercises');
    console.log('  - Can only delete your own private exercises');
    
    console.log('\n✅ Demo complete! Visit http://localhost:5173 to see the UI in action.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

demoFeatures().catch(console.error);