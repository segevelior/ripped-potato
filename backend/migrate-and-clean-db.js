require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('./src/models/Exercise');
const Goal = require('./src/models/Goal');
const PredefinedWorkout = require('./src/models/PredefinedWorkout');
const User = require('./src/models/User');
const UserExerciseModification = require('./src/models/UserExerciseModification');
const UserGoalModification = require('./src/models/UserGoalModification');
const UserWorkoutModification = require('./src/models/UserWorkoutModification');

async function migrateAndClean() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
    console.log('Connected to MongoDB\n');

    console.log('=== CLEANING TEST DATA ===');
    
    // Remove test exercises
    const testExercises = await Exercise.deleteMany({
      $or: [
        { name: /^(Test|API Test|test)/i },
        { name: { $exists: false } },
        { name: null }
      ]
    });
    console.log(`Removed ${testExercises.deletedCount} test exercises`);

    // Remove test goals
    const testGoals = await Goal.deleteMany({
      $or: [
        { name: /^(Test|test)/i },
        { name: { $exists: false } },
        { name: null }
      ]
    });
    console.log(`Removed ${testGoals.deletedCount} test goals`);

    // Remove test workouts
    const testWorkouts = await PredefinedWorkout.deleteMany({
      $or: [
        { name: /^(Test|test)/i },
        { name: { $exists: false } },
        { name: null }
      ]
    });
    console.log(`Removed ${testWorkouts.deletedCount} test workouts`);

    console.log('\n=== MIGRATING SCHEMAS ===');
    
    // Update all exercises without isCommon field
    const exerciseUpdate = await Exercise.updateMany(
      { isCommon: { $exists: false } },
      { $set: { isCommon: false } }
    );
    console.log(`Updated ${exerciseUpdate.modifiedCount} exercises with isCommon field`);

    // Update all goals without isCommon field
    const goalUpdate = await Goal.updateMany(
      { isCommon: { $exists: false } },
      { $set: { isCommon: false } }
    );
    console.log(`Updated ${goalUpdate.modifiedCount} goals with isCommon field`);

    // Update all workouts without isCommon field
    const workoutUpdate = await PredefinedWorkout.updateMany(
      { isCommon: { $exists: false } },
      { $set: { isCommon: false } }
    );
    console.log(`Updated ${workoutUpdate.modifiedCount} workouts with isCommon field`);

    // Update all users without role field
    const userUpdate = await User.updateMany(
      { role: { $exists: false } },
      { $set: { role: 'user' } }
    );
    console.log(`Updated ${userUpdate.modifiedCount} users with role field`);

    // Clean up any orphaned modifications
    console.log('\n=== CLEANING ORPHANED MODIFICATIONS ===');
    
    // Get all exercise IDs
    const validExerciseIds = await Exercise.find({}).distinct('_id');
    const orphanedExMods = await UserExerciseModification.deleteMany({
      exerciseId: { $nin: validExerciseIds }
    });
    console.log(`Removed ${orphanedExMods.deletedCount} orphaned exercise modifications`);

    // Get all goal IDs
    const validGoalIds = await Goal.find({}).distinct('_id');
    const orphanedGoalMods = await UserGoalModification.deleteMany({
      goalId: { $nin: validGoalIds }
    });
    console.log(`Removed ${orphanedGoalMods.deletedCount} orphaned goal modifications`);

    // Get all workout IDs
    const validWorkoutIds = await PredefinedWorkout.find({}).distinct('_id');
    const orphanedWorkoutMods = await UserWorkoutModification.deleteMany({
      workoutId: { $nin: validWorkoutIds }
    });
    console.log(`Removed ${orphanedWorkoutMods.deletedCount} orphaned workout modifications`);

    console.log('\n=== FINAL COUNTS ===');
    console.log(`Exercises: ${await Exercise.countDocuments()}`);
    console.log(`Goals: ${await Goal.countDocuments()}`);
    console.log(`Predefined Workouts: ${await PredefinedWorkout.countDocuments()}`);
    console.log(`Users: ${await User.countDocuments()}`);
    console.log(`- Admin users: ${await User.countDocuments({ role: 'admin' })}`);
    console.log(`- Regular users: ${await User.countDocuments({ role: 'user' })}`);

    console.log('\n✅ Migration and cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

migrateAndClean();