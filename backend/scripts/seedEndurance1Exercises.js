require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('../src/models/Exercise');
const User = require('../src/models/User');

const exercises = [
    {
        name: "Scapula Warm Up 2",
        description: "Scapular activation and mobilization exercises.",
        muscles: ["upper_back", "shoulders"],
        secondaryMuscles: ["lats"],
        discipline: ["warm_up", "mobility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Perform scapular retractions, protraction, elevation, and depression movements.", "Focus on controlled, isolated scapular movement."],
        strain: { intensity: "low", load: "bodyweight", durationType: "reps", typicalVolume: "10-15 reps" },
        isCommon: true
    },
    {
        name: "Band Shoulder Warm Up 1",
        description: "Shoulder stability and mobility warm-up using resistance band.",
        muscles: ["shoulders"],
        secondaryMuscles: ["upper_back"],
        discipline: ["warm_up", "mobility"],
        equipment: ["resistance_band"],
        difficulty: "beginner",
        instructions: ["Use a resistance band for shoulder external rotations, pulls, and stretches.", "Focus on increasing stability and mobility of the shoulder."],
        strain: { intensity: "low", load: "light", durationType: "reps", typicalVolume: "10-15 reps" },
        isCommon: true
    },
    {
        name: "Skin the Cat",
        description: "Advanced shoulder mobility and control exercise.",
        muscles: ["shoulders", "lats"],
        secondaryMuscles: ["core", "biceps"],
        discipline: ["calisthenics", "mobility"],
        equipment: ["pull_up_bar", "rings"],
        difficulty: "advanced",
        instructions: ["Hang from bar or rings, tuck knees and rotate backward through shoulder extension.", "Lower into German hang position, then reverse the movement.", "Keep movements slow and controlled."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "reps", typicalVolume: "3-5 reps" },
        isCommon: true
    },
    {
        name: "German Hang Pull Outs + Hold",
        description: "Extreme shoulder extension strength and mobility exercise.",
        muscles: ["shoulders", "chest"],
        secondaryMuscles: ["lats", "biceps"],
        discipline: ["calisthenics", "strength"],
        equipment: ["rings", "pull_up_bar"],
        difficulty: "advanced",
        instructions: ["Start in German hang position with arms extended behind body.", "Pull out of the hang position using lat and shoulder strength.", "Hold at the bottom for prescribed time."],
        strain: { intensity: "high", load: "bodyweight", durationType: "time", typicalVolume: "4-8s + 10s hold" },
        isCommon: true
    },
    {
        name: "Pull Ups + Top Hold",
        description: "Pull-ups with isometric hold at the top position.",
        muscles: ["lats", "biceps"],
        secondaryMuscles: ["upper_back", "core"],
        discipline: ["calisthenics", "strength"],
        equipment: ["pull_up_bar"],
        difficulty: "intermediate",
        instructions: ["Perform pull-ups with controlled tempo.", "Hold at the top position with chin over bar for prescribed time.", "Lower with control."],
        strain: { intensity: "high", load: "bodyweight", durationType: "reps", typicalVolume: "8-12 reps + 5-10s hold" },
        isCommon: true
    },
    {
        name: "Regular Dips",
        description: "Classic bodyweight dip exercise for chest and triceps.",
        muscles: ["chest", "triceps"],
        secondaryMuscles: ["shoulders"],
        discipline: ["calisthenics", "strength"],
        equipment: ["dip_bars", "parallettes"],
        difficulty: "intermediate",
        instructions: ["Support body on dip bars with arms straight.", "Lower body by bending elbows until upper arms are parallel to ground.", "Push back up to starting position."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "reps", typicalVolume: "12-15 reps" },
        isCommon: true
    },
    {
        name: "Alternating Pistol Squats",
        description: "Single-leg squat performed alternating legs.",
        muscles: ["quads", "glutes"],
        secondaryMuscles: ["hamstrings", "core"],
        discipline: ["calisthenics", "strength"],
        equipment: [],
        difficulty: "advanced",
        instructions: ["Stand on one leg, extend other leg forward.", "Squat down on standing leg while keeping extended leg off ground.", "Return to standing, switch legs."],
        strain: { intensity: "high", load: "bodyweight", durationType: "reps", typicalVolume: "6-12 reps per side" },
        isCommon: true
    },
    {
        name: "Seated Forward Fold",
        description: "Hamstring and lower back flexibility stretch.",
        muscles: ["hamstrings", "lower_back"],
        secondaryMuscles: ["calves"],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Sit with legs extended straight in front.", "Hinge at hips and reach forward toward toes.", "Keep spine long, avoid rounding back."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "30-60s hold" },
        isCommon: true
    },
    {
        name: "Low Squat Hold",
        description: "Deep squat position hold for hip and ankle mobility.",
        muscles: ["quads", "glutes"],
        secondaryMuscles: ["calves", "core"],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Squat down as deep as possible with heels on ground.", "Keep torso upright and chest open.", "Hold position with arms between legs or out front."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "30-90s hold" },
        isCommon: true
    },
    {
        name: "Reverse Flies on Rings",
        description: "Rear deltoid and upper back exercise using rings.",
        muscles: ["rear_delts", "upper_back"],
        secondaryMuscles: ["traps"],
        discipline: ["calisthenics", "strength"],
        equipment: ["rings"],
        difficulty: "intermediate",
        instructions: ["Hold rings at chest height, lean back with straight body.", "Pull rings apart and back in a fly motion.", "Squeeze shoulder blades together."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "reps", typicalVolume: "8-12 reps" },
        isCommon: true
    },
    {
        name: "Alternating Archer Push Ups",
        description: "Unilateral push-up variation with arm extended to side.",
        muscles: ["chest", "triceps"],
        secondaryMuscles: ["shoulders", "core"],
        discipline: ["calisthenics", "strength"],
        equipment: [],
        difficulty: "advanced",
        instructions: ["Start in wide push-up position.", "Lower body while shifting weight to one arm, keep other arm straight.", "Push back up and alternate sides."],
        strain: { intensity: "high", load: "bodyweight", durationType: "reps", typicalVolume: "6-12 reps per side" },
        isCommon: true
    },
    {
        name: "Wall Walks",
        description: "Walk hands toward wall while in handstand position.",
        muscles: ["shoulders", "core"],
        secondaryMuscles: ["chest", "triceps"],
        discipline: ["calisthenics", "strength"],
        equipment: [],
        difficulty: "advanced",
        instructions: ["Start in push-up position with feet on wall.", "Walk hands back toward wall while walking feet up.", "Walk back down with control."],
        strain: { intensity: "high", load: "bodyweight", durationType: "reps", typicalVolume: "3-6 reps" },
        isCommon: true
    },
    {
        name: "Bodyweight Hamstring Curls",
        description: "Hamstring isolation using bodyweight.",
        muscles: ["hamstrings"],
        secondaryMuscles: ["glutes", "calves"],
        discipline: ["calisthenics", "strength"],
        equipment: [],
        difficulty: "intermediate",
        instructions: ["Lie face down, anchor feet under stable object or have partner hold.", "Keep body straight and lower down with control using hamstrings.", "Pull back up to starting position."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "reps", typicalVolume: "12-15 reps" },
        isCommon: true
    },
    {
        name: "Hero Pose",
        description: "Kneeling stretch for quads and hip flexors.",
        muscles: ["quads", "hip_flexors"],
        secondaryMuscles: [],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "intermediate",
        instructions: ["Kneel with knees together, feet apart.", "Sit back between feet, keeping knees on ground.", "Can lean back for deeper stretch."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "30-60s hold" },
        isCommon: true
    },
    {
        name: "Laying Butterfly",
        description: "Supine butterfly stretch for inner thighs and hips.",
        muscles: ["hip_flexors", "adductors"],
        secondaryMuscles: ["lower_back"],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Lie on back, bring soles of feet together.", "Let knees fall out to sides.", "Relax and breathe into the stretch."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "60-90s hold" },
        isCommon: true
    },
    {
        name: "Hollow Body Hold",
        description: "Core strength exercise maintaining hollow position.",
        muscles: ["abs", "hip_flexors"],
        secondaryMuscles: ["lower_back"],
        discipline: ["calisthenics", "core"],
        equipment: [],
        difficulty: "intermediate",
        instructions: ["Lie on back, press lower back to ground.", "Lift shoulders and legs off ground, arms overhead.", "Hold position with body in slight banana shape."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "time", typicalVolume: "15-30s hold" },
        isCommon: true
    },
    {
        name: "Lower Body Stretch",
        description: "General lower body stretching routine.",
        muscles: ["hamstrings", "quads", "calves"],
        secondaryMuscles: ["hip_flexors"],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Perform variety of lower body stretches.", "Include hamstrings, quads, calves, and hip flexors.", "Hold each stretch for 20-30 seconds."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "5-10 mins" },
        isCommon: true
    },
    {
        name: "Seated Pike Compressions + Hold",
        description: "Core compression work from seated pike position.",
        muscles: ["abs", "hip_flexors"],
        secondaryMuscles: ["lower_back"],
        discipline: ["calisthenics", "core"],
        equipment: [],
        difficulty: "intermediate",
        instructions: ["Sit with legs extended straight.", "Lift legs off ground using core compression.", "Hold at top or pulse up and down."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "reps", typicalVolume: "12-15 reps + 10-12s hold" },
        isCommon: true
    },
    {
        name: "Wall Slides",
        description: "Shoulder mobility and stability exercise against wall.",
        muscles: ["shoulders", "upper_back"],
        secondaryMuscles: ["traps"],
        discipline: ["mobility", "strength"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Stand with back against wall, arms at 90 degrees.", "Slide arms up overhead keeping elbows and wrists on wall.", "Lower back down with control."],
        strain: { intensity: "low", load: "bodyweight", durationType: "reps", typicalVolume: "6-12 reps + bottom hold" },
        isCommon: true
    },
    {
        name: "Assisted Shoulder Stretch",
        description: "Partner-assisted or self-assisted shoulder stretch.",
        muscles: ["shoulders", "chest"],
        secondaryMuscles: [],
        discipline: ["mobility", "flexibility"],
        equipment: [],
        difficulty: "beginner",
        instructions: ["Use partner or wall to assist in shoulder stretch.", "Focus on increasing shoulder extension and internal rotation mobility."],
        strain: { intensity: "low", load: "bodyweight", durationType: "time", typicalVolume: "30-60s hold" },
        isCommon: true
    },
    {
        name: "Active Hang",
        description: "Active shoulder engagement while hanging from bar.",
        muscles: ["lats", "shoulders"],
        secondaryMuscles: ["forearms", "core"],
        discipline: ["calisthenics", "strength"],
        equipment: ["pull_up_bar"],
        difficulty: "beginner",
        instructions: ["Hang from bar with active shoulder depression.", "Engage lats and pull shoulders down away from ears.", "Maintain straight body position."],
        strain: { intensity: "moderate", load: "bodyweight", durationType: "time", typicalVolume: "90s max effort or 2-3 sets" },
        isCommon: true
    }
];

async function seedEndurance1Exercises() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

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

        console.log(`Seeding ${exercises.length} exercises for Endurance Training 1...`);

        for (const exerciseData of exercises) {
            const existing = await Exercise.findOne({ name: exerciseData.name });
            if (existing) {
                console.log(`Exercise "${exerciseData.name}" already exists. Skipping.`);
                continue;
            }

            await Exercise.create({
                ...exerciseData,
                createdBy: adminUser._id
            });
            console.log(`Created exercise: ${exerciseData.name}`);
        }

        console.log('Endurance 1 exercises seeding completed!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding exercises:', error);
        process.exit(1);
    }
}

seedEndurance1Exercises();
