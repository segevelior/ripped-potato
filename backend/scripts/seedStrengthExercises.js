require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('../src/models/Exercise');
const User = require('../src/models/User');
const newExercises = require('../data/cf-phase2-venus-strength1-exercises.json');

async function seedStrengthExercises() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
        console.log('Connected to MongoDB');

        // Find admin user
        let adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.log('Admin user not found, creating one...');
            adminUser = await User.create({
                email: 'admin@synergyfit.com',
                name: 'Admin User',
                role: 'admin',
                password: 'temp-admin-password-change-this'
            });
        }

        console.log(`Seeding ${newExercises.length} new exercises...`);

        for (const exerciseData of newExercises) {
            // Check if exercise already exists to avoid duplicates
            const existing = await Exercise.findOne({ name: exerciseData.name });
            if (existing) {
                console.log(`Exercise ${exerciseData.name} already exists. Skipping.`);
                continue;
            }

            await Exercise.create({
                ...exerciseData,
                createdBy: adminUser._id
            });
            console.log(`Created exercise: ${exerciseData.name}`);
        }

        console.log('Strength exercises seeding completed!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding exercises:', error);
        process.exit(1);
    }
}

seedStrengthExercises();
