require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('./src/models/Exercise');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function setupDemoData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
    console.log('Connected to MongoDB\n');

    // 1. Ensure we have an admin user
    console.log('=== SETTING UP ADMIN USER ===');
    let adminUser = await User.findOne({ role: 'admin' });
    
    if (!adminUser) {
      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123', 10);
      adminUser = await User.create({
        email: 'admin@synergyfit.com',
        password: hashedPassword,
        name: 'Admin User',
        role: 'admin'
      });
      console.log('Created admin user: admin@synergyfit.com (password: admin123)');
    } else {
      console.log(`Admin user exists: ${adminUser.email}`);
    }

    // 2. Clear existing common exercises to start fresh
    await Exercise.deleteMany({ isCommon: true });
    console.log('Cleared existing common exercises');

    // 3. Create common exercises
    console.log('\n=== CREATING COMMON EXERCISES ===');
    const commonExercises = [
      {
        name: "Push-up",
        description: "A basic bodyweight exercise that targets chest, shoulders, and triceps",
        isCommon: true,
        discipline: ["strength", "calisthenics"],
        muscles: ["chest", "shoulders", "triceps"],
        equipment: [],
        difficulty: "beginner",
        strain: {
          intensity: "moderate",
          load: "bodyweight",
          duration_type: "reps",
          typical_volume: "3 sets of 10-15 reps"
        },
        createdBy: adminUser._id
      },
      {
        name: "Squat",
        description: "A fundamental lower body exercise targeting quads, glutes, and hamstrings",
        isCommon: true,
        discipline: ["strength", "mobility"],
        muscles: ["quads", "glutes", "hamstrings"],
        equipment: [],
        difficulty: "beginner",
        strain: {
          intensity: "moderate",
          load: "bodyweight",
          duration_type: "reps",
          typical_volume: "3 sets of 15-20 reps"
        },
        createdBy: adminUser._id
      },
      {
        name: "Plank",
        description: "Core stabilization exercise that engages the entire core",
        isCommon: true,
        discipline: ["strength", "stability"],
        muscles: ["core", "shoulders"],
        equipment: [],
        difficulty: "beginner",
        strain: {
          intensity: "low",
          load: "bodyweight",
          duration_type: "time",
          typical_volume: "3 sets of 30-60 seconds"
        },
        createdBy: adminUser._id
      },
      {
        name: "Pull-up",
        description: "Upper body pulling exercise targeting back and biceps",
        isCommon: true,
        discipline: ["strength", "calisthenics"],
        muscles: ["lats", "biceps", "middle_back"],
        equipment: ["pull_up_bar"],
        difficulty: "intermediate",
        strain: {
          intensity: "high",
          load: "bodyweight",
          duration_type: "reps",
          typical_volume: "3 sets of 5-10 reps"
        },
        createdBy: adminUser._id
      },
      {
        name: "Bench Press",
        description: "Classic chest exercise using a barbell",
        isCommon: true,
        discipline: ["strength", "powerlifting"],
        muscles: ["chest", "shoulders", "triceps"],
        equipment: ["barbell", "bench"],
        difficulty: "intermediate",
        strain: {
          intensity: "high",
          load: "moderate",
          duration_type: "reps",
          typical_volume: "3 sets of 8-12 reps"
        },
        createdBy: adminUser._id
      }
    ];

    for (const exerciseData of commonExercises) {
      const exercise = await Exercise.create(exerciseData);
      console.log(`Created common exercise: ${exercise.name}`);
    }

    // 4. Create some private exercises for a regular user
    console.log('\n=== CREATING PRIVATE EXERCISES ===');
    const regularUser = await User.findOne({ role: 'user' });
    
    if (regularUser) {
      const privateExercises = [
        {
          name: "My Morning Stretch Routine",
          description: "Personal stretching routine for flexibility",
          isCommon: false,
          discipline: ["mobility", "flexibility"],
          muscles: ["full_body"],
          equipment: [],
          difficulty: "beginner",
          strain: {
            intensity: "low",
            load: "bodyweight",
            duration_type: "time",
            typical_volume: "10-15 minutes"
          },
          createdBy: regularUser._id
        },
        {
          name: "Kettlebell Swing",
          description: "Dynamic hip hinge movement with kettlebell",
          isCommon: false,
          discipline: ["strength", "cardio"],
          muscles: ["glutes", "hamstrings", "core"],
          equipment: ["kettlebell"],
          difficulty: "intermediate",
          strain: {
            intensity: "high",
            load: "light",
            duration_type: "reps",
            typical_volume: "3 sets of 20-30 reps"
          },
          createdBy: regularUser._id
        }
      ];

      for (const exerciseData of privateExercises) {
        const exercise = await Exercise.create(exerciseData);
        console.log(`Created private exercise: ${exercise.name} for ${regularUser.email}`);
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total exercises: ${await Exercise.countDocuments()}`);
    console.log(`- Common exercises: ${await Exercise.countDocuments({ isCommon: true })}`);
    console.log(`- Private exercises: ${await Exercise.countDocuments({ isCommon: false })}`);
    console.log(`Total users: ${await User.countDocuments()}`);
    console.log(`- Admin users: ${await User.countDocuments({ role: 'admin' })}`);
    console.log(`- Regular users: ${await User.countDocuments({ role: 'user' })}`);

    console.log('\n✅ Demo data setup complete!');
    console.log('\nYou can now test with:');
    console.log('- Admin: admin@synergyfit.com / admin123');
    console.log(`- User: ${regularUser?.email || 'any existing user'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

setupDemoData();