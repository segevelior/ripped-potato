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

    // Find or create admin user
    let adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        email: 'admin@synergyfit.com',
        name: 'Admin User',
        role: 'admin',
        password: 'temp-admin-password-change-this'
      });
      console.log('Created admin user');
    }

    // Clear existing common exercises
    await Exercise.deleteMany({ isCommon: true });
    console.log('Cleared existing common exercises');

    // Create common exercises
    for (const exerciseData of sampleExercises) {
      const exercise = await Exercise.create({
        ...exerciseData,
        createdBy: adminUser._id
      });
      console.log(`Created common exercise: ${exercise.name}`);
    }

    // Find a regular user for private exercises
    let regularUser = await User.findOne({ role: { $ne: 'admin' } });
    if (regularUser) {
      // Create some private exercises for the regular user
      const privateExercises = [
        {
          name: "My Custom Push-up Variation",
          description: "Modified push-up with hands elevated",
          isCommon: false,
          discipline: ["strength"],
          muscles: ["chest", "shoulders"],
          equipment: ["bench"],
          strain: {
            intensity: "low",
            load: "bodyweight",
            duration_type: "reps",
            typical_volume: "3 sets of 15 reps"
          },
          createdBy: regularUser._id
        },
        {
          name: "Morning Stretching Routine",
          description: "Personal stretching routine for flexibility",
          isCommon: false,
          discipline: ["mobility", "flexibility"],
          muscles: ["full_body"],
          equipment: ["mat"],
          strain: {
            intensity: "low",
            load: "bodyweight",
            duration_type: "time",
            typical_volume: "10-15 minutes"
          },
          createdBy: regularUser._id
        }
      ];

      for (const exerciseData of privateExercises) {
        const exercise = await Exercise.create(exerciseData);
        console.log(`Created private exercise: ${exercise.name} for user ${regularUser.email}`);
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