require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('../src/models/Exercise');
const User = require('../src/models/User');

const sampleExercises = [
  // Common exercises (admin-created)
  {
    name: "Push-up",
    description: "A basic bodyweight exercise that targets chest, shoulders, and triceps",
    isCommon: true,
    discipline: ["strength", "calisthenics"],
    muscles: ["chest", "shoulders", "triceps"],
    equipment: ["none"],
    strain: {
      intensity: "moderate",
      load: "bodyweight",
      duration_type: "reps",
      typical_volume: "3 sets of 10-15 reps"
    }
  },
  {
    name: "Squat",
    description: "A fundamental lower body exercise targeting quads, glutes, and hamstrings",
    isCommon: true,
    discipline: ["strength", "mobility"],
    muscles: ["quads", "glutes", "hamstrings"],
    equipment: ["none"],
    strain: {
      intensity: "moderate",
      load: "bodyweight",
      duration_type: "reps",
      typical_volume: "3 sets of 15-20 reps"
    }
  },
  {
    name: "Plank",
    description: "Core stabilization exercise that engages the entire core",
    isCommon: true,
    discipline: ["strength", "stability"],
    muscles: ["core", "shoulders"],
    equipment: ["none"],
    strain: {
      intensity: "low",
      load: "bodyweight",
      duration_type: "time",
      typical_volume: "3 sets of 30-60 seconds"
    }
  },
  {
    name: "Pull-up",
    description: "Upper body pulling exercise targeting back and biceps",
    isCommon: true,
    discipline: ["strength", "calisthenics"],
    muscles: ["lats", "biceps", "middle_back"],
    equipment: ["pull-up bar"],
    strain: {
      intensity: "high",
      load: "bodyweight",
      duration_type: "reps",
      typical_volume: "3 sets of 5-10 reps"
    }
  },
  {
    name: "Deadlift",
    description: "Compound exercise working the entire posterior chain",
    isCommon: true,
    discipline: ["strength", "powerlifting"],
    muscles: ["hamstrings", "glutes", "lower_back", "traps"],
    equipment: ["barbell"],
    strain: {
      intensity: "high",
      load: "heavy",
      duration_type: "reps",
      typical_volume: "3 sets of 5 reps"
    }
  }
];

async function seedExercises() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
    console.log('Connected to MongoDB');

    // Find admin user by email (should be created separately)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@synergyfit.com';
    let adminUser = await User.findOne({ email: adminEmail, role: 'admin' });
    
    if (!adminUser) {
      console.error('Admin user not found. Please create an admin user first.');
      console.log('You can create one by registering a user and then updating their role in MongoDB:');
      console.log(`db.users.updateOne({ email: "${adminEmail}" }, { $set: { role: "admin" } })`);
      process.exit(1);
    }

    // Clear existing common exercises (optional - comment out if you want to keep existing)
    // await Exercise.deleteMany({ isCommon: true });
    // console.log('Cleared existing common exercises');

    // Create common exercises
    for (const exerciseData of sampleExercises) {
      const existingExercise = await Exercise.findOne({ 
        name: exerciseData.name, 
        isCommon: true 
      });
      
      if (!existingExercise) {
        const exercise = await Exercise.create({
          ...exerciseData,
          createdBy: adminUser._id
        });
        console.log(`Created common exercise: ${exercise.name}`);
      } else {
        console.log(`Common exercise already exists: ${exerciseData.name}`);
      }
    }

    console.log('Exercise seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding exercises:', error);
    process.exit(1);
  }
}

seedExercises();