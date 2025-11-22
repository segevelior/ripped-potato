require('dotenv').config();
const mongoose = require('mongoose');
const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const Exercise = require('../src/models/Exercise');
const User = require('../src/models/User');

async function seedStrengthWorkout() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
        console.log('Connected to MongoDB');

        const adminUser = await User.findOne({ role: 'admin' });
        if (!adminUser) {
            console.log('Admin user not found!');
            process.exit(1);
        }

        // Delete existing workout with same name
        await PredefinedWorkout.deleteMany({ name: 'STRENGTH & CONDITIONING 1' });
        console.log('Deleted existing workout if any');

        // Get exercise IDs
        const exerciseMap = {};
        const exerciseNames = [
            'Body Heat Warm Up', 'Scapula Warm Up 2', 'Band Shoulder Warm Up 1',
            'Skin the Cat', 'Band Straight Arm Lat Pull Down',
            'Explosive Pull ups', 'Explosive Straight Bar Dips', 'Hanging L-Sit Hold',
            'Seated Forward Fold', 'Pancake Stretch',
            'Deep Pike Push Ups', 'Bodyweight Rows Supinate Grip',
            'Floor Elbow Victorian Hold', 'Reverse Hyperextension', 'Hero Pose',
            'Toes To Bar', 'L-Sit Hold on Parallettes',
            'Prone Y Raises', 'German Hang'
        ];

        for (const name of exerciseNames) {
            const exercise = await Exercise.findOne({ name });
            if (exercise) {
                exerciseMap[name] = exercise._id;
            }
        }

        const workout = {
            name: 'STRENGTH & CONDITIONING 1',
            goal: 'Strength & Conditioning Phase 2 - Venus Part 1. Focus on muscle-up skill transferability, explosive strength, upper body conditioning, core compression, and shoulder stability.',
            primary_disciplines: ['calisthenics', 'strength'],
            estimated_duration: 60,
            difficulty_level: 'advanced',
            isCommon: true,
            createdBy: null, // Common workout
            tags: ['strength', 'calisthenics', 'conditioning', 'phase-2', 'upper-body'],
            blocks: [
                {
                    name: 'Warm-Up Phases',
                    exercises: [
                        exerciseMap['Body Heat Warm Up'] ? {
                            exercise_id: exerciseMap['Body Heat Warm Up'],
                            exercise_name: 'Body Heat Warm Up',
                            volume: '3-5 mins',
                            rest: '',
                            notes: 'Blood Flow, Mobilization, Activation'
                        } : null,
                        exerciseMap['Scapula Warm Up 2'] ? {
                            exercise_id: exerciseMap['Scapula Warm Up 2'],
                            exercise_name: 'Scapula Warm Up 2',
                            volume: '1-2 sets of 10-15 reps',
                            rest: '30-60s',
                            notes: 'Upper Body - General Warm Up'
                        } : null,
                        exerciseMap['Band Shoulder Warm Up 1'] ? {
                            exercise_id: exerciseMap['Band Shoulder Warm Up 1'],
                            exercise_name: 'Band Shoulder Warm Up 1',
                            volume: '1-2 sets of 10-15 reps',
                            rest: '30-60s',
                            notes: 'Shoulder stability and mobility'
                        } : null,
                        exerciseMap['Skin the Cat'] ? {
                            exercise_id: exerciseMap['Skin the Cat'],
                            exercise_name: 'Skin the Cat',
                            volume: '1-2 sets of 3-5 reps',
                            rest: '30-60s',
                            notes: 'Slow & Controlled, Tempo 1-1-x-0'
                        } : null,
                        exerciseMap['Band Straight Arm Lat Pull Down'] ? {
                            exercise_id: exerciseMap['Band Straight Arm Lat Pull Down'],
                            exercise_name: 'Band Straight Arm Lat Pull Down',
                            volume: '1-2 sets of 10-15 reps',
                            rest: '30-60s',
                            notes: 'Slow & Controlled'
                        } : null
                    ].filter(Boolean)
                },
                {
                    name: 'Block 1 - Muscle Up Skill & Explosive Strength',
                    exercises: [
                        exerciseMap['Explosive Pull ups'] ? {
                            exercise_id: exerciseMap['Explosive Pull ups'],
                            exercise_name: 'Explosive Pull ups',
                            volume: '3-4 sets of 3-6 reps',
                            rest: '90-120s',
                            notes: 'Tempo 1-1-x-0, Pull Up Higher'
                        } : null,
                        exerciseMap['Explosive Straight Bar Dips'] ? {
                            exercise_id: exerciseMap['Explosive Straight Bar Dips'],
                            exercise_name: 'Explosive Straight Bar Dips',
                            volume: '3-4 sets of 4-8 reps',
                            rest: '90-120s',
                            notes: 'Tempo 1-1-x-0, Let go of the bar for max difficulty'
                        } : null,
                        exerciseMap['Hanging L-Sit Hold'] ? {
                            exercise_id: exerciseMap['Hanging L-Sit Hold'],
                            exercise_name: 'Hanging L-Sit Hold',
                            volume: '3-4 sets of 15-20s',
                            rest: '90-120s',
                            notes: 'Isometric hold. Progress: V-Sit. Regress: Tuck L-Sit'
                        } : null,
                        exerciseMap['Seated Forward Fold'] ? {
                            exercise_id: exerciseMap['Seated Forward Fold'],
                            exercise_name: 'Seated Forward Fold',
                            volume: 'Active Rest',
                            rest: '',
                            notes: 'Hamstrings & Lumbar Spine Flexibility'
                        } : null,
                        exerciseMap['Pancake Stretch'] ? {
                            exercise_id: exerciseMap['Pancake Stretch'],
                            exercise_name: 'Pancake Stretch',
                            volume: 'Active Rest',
                            rest: '',
                            notes: 'Hip & Hamstring Flexibility / Lumbar Spine Flexibility'
                        } : null
                    ].filter(Boolean)
                },
                {
                    name: 'Block 2 - Upper Body Strength & Conditioning',
                    exercises: [
                        exerciseMap['Deep Pike Push Ups'] ? {
                            exercise_id: exerciseMap['Deep Pike Push Ups'],
                            exercise_name: 'Deep Pike Push Ups',
                            volume: '3-4 sets of 6-8 reps',
                            rest: '90-120s',
                            notes: 'Tempo 2-0-2-0. Progress: Elevated. Regress: Negatives'
                        } : null,
                        exerciseMap['Bodyweight Rows Supinate Grip'] ? {
                            exercise_id: exerciseMap['Bodyweight Rows Supinate Grip'],
                            exercise_name: 'Bodyweight Rows Supinate Grip',
                            volume: '3-4 sets of 6-12 reps',
                            rest: '90-120s',
                            notes: 'Tempo 2-0-2-0. Adjust lever to control difficulty'
                        } : null,
                        exerciseMap['Floor Elbow Victorian Hold'] ? {
                            exercise_id: exerciseMap['Floor Elbow Victorian Hold'],
                            exercise_name: 'Floor Elbow Victorian Hold',
                            volume: '3-4 sets of 15-30s',
                            rest: '90-120s',
                            notes: 'Isometric hold'
                        } : null,
                        exerciseMap['Reverse Hyperextension'] ? {
                            exercise_id: exerciseMap['Reverse Hyperextension'],
                            exercise_name: 'Reverse Hyperextension',
                            volume: '3-4 sets of 8-12 reps',
                            rest: '90-120s',
                            notes: 'Tempo 2-0-1-2. Progress: Ankle weights. Regress: Tuck to Straddle'
                        } : null,
                        exerciseMap['Hero Pose'] ? {
                            exercise_id: exerciseMap['Hero Pose'],
                            exercise_name: 'Hero Pose',
                            volume: '10/10/10→30/30/30s',
                            rest: '',
                            notes: 'Active Rest - Hip Extension Facilitator'
                        } : null
                    ].filter(Boolean)
                },
                {
                    name: 'Block 3 - Core Compression Focus',
                    exercises: [
                        exerciseMap['Toes To Bar'] ? {
                            exercise_id: exerciseMap['Toes To Bar'],
                            exercise_name: 'Toes To Bar',
                            volume: '2-3 sets of 6-10 reps',
                            rest: '60-90s',
                            notes: 'Tempo 2-0-1-0. Regress: Hanging Leg Raises'
                        } : null,
                        exerciseMap['Seated Forward Fold'] ? {
                            exercise_id: exerciseMap['Seated Forward Fold'],
                            exercise_name: 'Seated Forward Fold',
                            volume: 'Active Rest',
                            rest: '',
                            notes: 'Hamstrings & Lumbar Spine Flexibility'
                        } : null,
                        exerciseMap['L-Sit Hold on Parallettes'] ? {
                            exercise_id: exerciseMap['L-Sit Hold on Parallettes'],
                            exercise_name: 'L-Sit Hold on Parallettes',
                            volume: '2-3 sets of 15-20s',
                            rest: '60-90s',
                            notes: 'Isometric. Progress: V-Sit. Regress: Tuck L-Sit'
                        } : null,
                        exerciseMap['Pancake Stretch'] ? {
                            exercise_id: exerciseMap['Pancake Stretch'],
                            exercise_name: 'Pancake Stretch',
                            volume: 'Active Rest',
                            rest: '',
                            notes: 'Hamstrings & Lumbar Spine Flexibility'
                        } : null
                    ].filter(Boolean)
                },
                {
                    name: 'Block 4 - Shoulder Stability & Accessory Work',
                    exercises: [
                        exerciseMap['Prone Y Raises'] ? {
                            exercise_id: exerciseMap['Prone Y Raises'],
                            exercise_name: 'Prone Y Raises',
                            volume: '2-3 sets of 12-15 reps',
                            rest: '60-90s',
                            notes: 'Tempo 2-0-1-2. Progress: Add weight. Regress: Bent Over Y Raises'
                        } : null,
                        exerciseMap['German Hang'] ? {
                            exercise_id: exerciseMap['German Hang'],
                            exercise_name: 'German Hang',
                            volume: '2-3 sets of 15-30s',
                            rest: '60-90s',
                            notes: 'Isometric. Progress: Add Weight. Regress: Assist with small elevation'
                        } : null
                    ].filter(Boolean)
                }
            ]
        };

        const newWorkout = await PredefinedWorkout.create(workout);
        console.log(`✅ Workout "${newWorkout.name}" created successfully (ID: ${newWorkout._id})!`);
        console.log(`   Total blocks: ${newWorkout.blocks.length}`);
        console.log(`   Total exercises: ${newWorkout.totalExercises}`);
        process.exit(0);
    } catch (error) {
        console.error('Error creating workout:', error);
        process.exit(1);
    }
}

seedStrengthWorkout();
