const mongoose = require('mongoose');
require('dotenv').config();

async function cleanTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear test collections
    await mongoose.connection.db.collection('users').deleteMany({});
    await mongoose.connection.db.collection('exercises').deleteMany({});
    await mongoose.connection.db.collection('workouts').deleteMany({});
    
    console.log('✅ Test data cleared');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

cleanTestData();