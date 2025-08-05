require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('./src/models/Exercise');
const Goal = require('./src/models/Goal');
const PredefinedWorkout = require('./src/models/PredefinedWorkout');
const User = require('./src/models/User');

async function checkSchemas() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
    console.log('Connected to MongoDB\n');

    // Check exercises
    console.log('=== EXERCISES ===');
    const exercises = await Exercise.find({}).limit(3);
    console.log(`Total exercises: ${await Exercise.countDocuments()}`);
    if (exercises.length > 0) {
      console.log('Sample exercise:', {
        name: exercises[0].name,
        isCommon: exercises[0].isCommon,
        createdBy: exercises[0].createdBy
      });
      console.log(`Exercises with isCommon field: ${await Exercise.countDocuments({ isCommon: { $exists: true } })}`);
      console.log(`Exercises without isCommon field: ${await Exercise.countDocuments({ isCommon: { $exists: false } })}`);
    }

    // Check users
    console.log('\n=== USERS ===');
    const users = await User.find({}).limit(3);
    console.log(`Total users: ${await User.countDocuments()}`);
    if (users.length > 0) {
      console.log('Sample user:', {
        email: users[0].email,
        role: users[0].role
      });
      console.log(`Users with role field: ${await User.countDocuments({ role: { $exists: true } })}`);
      console.log(`Users without role field: ${await User.countDocuments({ role: { $exists: false } })}`);
    }

    // Check goals
    console.log('\n=== GOALS ===');
    const goals = await Goal.find({}).limit(3);
    console.log(`Total goals: ${await Goal.countDocuments()}`);
    if (goals.length > 0) {
      console.log('Sample goal:', {
        name: goals[0].name,
        isCommon: goals[0].isCommon,
        createdBy: goals[0].createdBy
      });
      console.log(`Goals with isCommon field: ${await Goal.countDocuments({ isCommon: { $exists: true } })}`);
      console.log(`Goals without isCommon field: ${await Goal.countDocuments({ isCommon: { $exists: false } })}`);
    }

    // Check predefined workouts
    console.log('\n=== PREDEFINED WORKOUTS ===');
    const workouts = await PredefinedWorkout.find({}).limit(3);
    console.log(`Total predefined workouts: ${await PredefinedWorkout.countDocuments()}`);
    if (workouts.length > 0) {
      console.log('Sample workout:', {
        name: workouts[0].name,
        isCommon: workouts[0].isCommon,
        createdBy: workouts[0].createdBy
      });
      console.log(`Workouts with isCommon field: ${await PredefinedWorkout.countDocuments({ isCommon: { $exists: true } })}`);
      console.log(`Workouts without isCommon field: ${await PredefinedWorkout.countDocuments({ isCommon: { $exists: false } })}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchemas();