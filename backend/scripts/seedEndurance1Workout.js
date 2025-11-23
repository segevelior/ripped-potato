require('dotenv').config();
const mongoose = require('mongoose');
const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const Exercise = require('../src/models/Exercise');

async function seedEndurance1Workout() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Delete existing workout with same name
        await PredefinedWorkout.deleteMany({ name: 'ENDURANCE TRAINING 1' });
        console.log('Deleted existing workout if any');

        // Get exercise IDs
        const exerciseMap = {};
        const exerciseNames = [
            'Body Heat Warm Up', 'Scapula Warm Up 2', 'Band Shoulder Warm Up 1',
            'Skin the Cat', 'German Hang Pull Outs + Hold',
            'Pull Ups + Top Hold', 'Regular Dips', 'Alternating Pistol Squats',
            'Seated Forward Fold', 'Low Squat Hold',
            'Reverse Flies on Rings', 'Alternating Archer Push Ups', 'Wall Walks',
            'Bodyweight Hamstring Curls', 'Hero Pose', 'Laying Butterfly',
            'Hollow Body Hold', 'Lower Body Stretch', 'Seated Pike Compressions + Hold',
            'Wall Slides', 'Assisted Shoulder Stretch', 'Active Hang'
        ];

        for (const name of exerciseNames) {
            const exercise = await Exercise.findOne({ name });
            if (exercise) {
                exerciseMap[name] = exercise._id;
            } else {
                console.warn(`Warning: Exercise "${name}" not found in database`);
            }
        }

        const workout = {
            name: 'ENDURANCE TRAINING 1',
            goal: 'Full Body Endurance Training - Phase 2 Venus. Focus on metabolic endurance, full body strength & conditioning, core compression, and shoulder stability.',
            primary_disciplines: ['calisthenics', 'endurance', 'conditioning'],
            estimated_duration: 75,
            difficulty_level: 'advanced',
            isCommon: true,
            createdBy: null,
            tags: ['endurance', 'calisthenics', 'full-body', 'conditioning', 'phase-2'],
            blocks: [
                {
                    name: 'General Warm-Up',
                    exercises: [
                        { exercise_id: exerciseMap['Body Heat Warm Up'], exercise_name: 'Body Heat Warm Up', volume: '3-5 mins', rest: '', notes: 'Blood Flow, Mobilization, Activation' },
                        { exercise_id: exerciseMap['Scapula Warm Up 2'], exercise_name: 'Scapula Warm Up 2', volume: '1-2 sets of 10-15 reps', rest: '30-60s', notes: '' },
                        { exercise_id: exerciseMap['Band Shoulder Warm Up 1'], exercise_name: 'Band Shoulder Warm Up 1', volume: '1-2 sets of 10-15 reps', rest: '30-60s', notes: 'Increases stability and mobility of the shoulder for a more effective Upper Body training' }
                    ]
                },
                {
                    name: 'Specific Warm-Up',
                    exercises: [
                        { exercise_id: exerciseMap['Skin the Cat'], exercise_name: 'Skin the Cat', volume: '1-2 sets of 3-5 reps', rest: '30-60s', notes: 'Tempo: Slow & Controlled. Add pause on each position / Momentum and Slight Bend on Arms' },
                        { exercise_id: exerciseMap['German Hang Pull Outs + Hold'], exercise_name: 'German Hang Pull Outs + Hold', volume: '1-2 sets of 4-8s + 10s hold', rest: '30-60s', notes: 'Tempo: Slow & Controlled. Add pause on each position / Feet Assisted' }
                    ]
                },
                {
                    name: 'Block 1 - Full Body Metabolic Endurance',
                    exercises: [
                        { exercise_id: exerciseMap['Pull Ups + Top Hold'], exercise_name: 'Pull Ups + Top Hold', volume: '3-4 sets of 8-12 reps + 5-10s hold', rest: '60-90s', notes: 'Tempo: 4-1-2-1. Add Weight / Resistance band' },
                        { exercise_id: exerciseMap['Regular Dips'], exercise_name: 'Regular Dips', volume: '3-4 sets of 12-15 reps', rest: '60-90s', notes: 'Tempo: 4-1-2-1. Add Weight / Resistance band' },
                        { exercise_id: exerciseMap['Alternating Pistol Squats'], exercise_name: 'Alternating Pistol Squats', volume: '3-4 sets of 6-12 e/s', rest: '', notes: 'Tempo: 2-0-2-0. Add Weight / Partial Reps' },
                        { exercise_id: exerciseMap['Seated Forward Fold'], exercise_name: 'Seated Forward Fold', volume: '', rest: '', notes: 'Pistol Squat Facilitator / Hamstrings & Lumbar Spine Flexibility' },
                        { exercise_id: exerciseMap['Low Squat Hold'], exercise_name: 'Low Squat Hold', volume: '', rest: '', notes: 'Hip Mobility / Dorsifiexion / Lumbar Spine Flexibility' }
                    ]
                },
                {
                    name: 'Block 2 - Full Body Strength & Conditioning',
                    exercises: [
                        { exercise_id: exerciseMap['Reverse Flies on Rings'], exercise_name: 'Reverse Flies on Rings', volume: '3-4 sets of 8-12 reps', rest: '60-90s', notes: 'Tempo: 2-0-2-1. Increase Lever / Decrease Lever' },
                        { exercise_id: exerciseMap['Alternating Archer Push Ups'], exercise_name: 'Alternating Archer Push Ups', volume: '3-4 sets of 6-12 e/s', rest: '60-90s', notes: 'Tempo: 2-0-2-0. Arms fully straight / On the Knees' },
                        { exercise_id: exerciseMap['Wall Walks'], exercise_name: 'Wall Walks', volume: '3-4 sets of 3-6 reps', rest: '', notes: 'Tempo: Slow & Controlled. Added Bottom / Top Pause / Partial reps' },
                        { exercise_id: exerciseMap['Bodyweight Hamstring Curls'], exercise_name: 'Bodyweight Hamstring Curls', volume: '3-4 sets of 12-15 reps', rest: '60-90s', notes: 'Tempo: 2-0-2-0. Unilateral / Partial Reps' },
                        { exercise_id: exerciseMap['Hero Pose'], exercise_name: 'Hero Pose', volume: '', rest: '', notes: 'Quad Flexibility / Plantar Flexion / Lumbar Spine Flexibility / Hip Extension' },
                        { exercise_id: exerciseMap['Laying Butterfly'], exercise_name: 'Laying Butterfly', volume: '', rest: '', notes: 'Inner Hips Flexibility / Middle Split Transferability' }
                    ]
                },
                {
                    name: 'Block 3 - Core Compression Focus',
                    exercises: [
                        { exercise_id: exerciseMap['Hollow Body Hold'], exercise_name: 'Hollow Body Hold', volume: '3-4 sets of 15-30s hold', rest: '30-60s', notes: 'Isometric. Ankle Weights / Decrease Lever' },
                        { exercise_id: exerciseMap['Lower Body Stretch'], exercise_name: 'Lower Body Stretch', volume: '', rest: '', notes: 'Choose between: Seated Forward Fold / Pancake / Seated Butterfly' },
                        { exercise_id: exerciseMap['Seated Pike Compressions + Hold'], exercise_name: 'Seated Pike Compressions + Hold', volume: '3-4 sets of 12-15 reps + 10-12s hold', rest: '30-60s', notes: 'Tempo: 1-0-X-1. Ankle Weights / Hands closer to the hips' }
                    ]
                },
                {
                    name: 'Block 4 - Shoulder Stability & Accessory Work',
                    exercises: [
                        { exercise_id: exerciseMap['Wall Slides'], exercise_name: 'Wall Slides', volume: '2-3 sets of 6-12 reps + bottom hold', rest: '60-90s', notes: 'Tempo: 2-0-1-2. Prone Military Press / Feet forward' },
                        { exercise_id: exerciseMap['Assisted Shoulder Stretch'], exercise_name: 'Assisted Shoulder Stretch', volume: '', rest: '', notes: 'Chest & Shoulder Stretch / Increase Shoulder ER Mobility' },
                        { exercise_id: exerciseMap['Active Hang'], exercise_name: 'Active Hang', volume: '2-3 sets of 90s Max Effort', rest: '90-120s', notes: 'Isometric. Single Arm Active Hang / Assist with small elevation' },
                        { exercise_id: exerciseMap['Low Squat Hold'], exercise_name: 'Low Squat Hold', volume: '', rest: '', notes: 'Counter Movement' }
                    ]
                }
            ]
        };

        // Filter out exercises with undefined IDs
        workout.blocks.forEach(block => {
            block.exercises = block.exercises.filter(ex => ex.exercise_id);
        });

        const createdWorkout = await PredefinedWorkout.create(workout);
        console.log('✅ Successfully created workout:', createdWorkout.name);
        console.log('Total blocks:', createdWorkout.blocks.length);
        console.log('Total exercises:', createdWorkout.blocks.reduce((sum, block) => sum + block.exercises.length, 0));

        process.exit(0);
    } catch (error) {
        console.error('Error seeding workout:', error);
        process.exit(1);
    }
}

seedEndurance1Workout();
