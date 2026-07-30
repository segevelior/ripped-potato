/**
 * Seed common session templates for running / cycling / climbing, using the
 * typed-block fields (type, rounds, work_seconds, rest_seconds,
 * duration_seconds, instructions).
 *
 * - Exercises: find-or-create, case-insensitive by name; existing docs are
 *   never overwritten. Embeddings come from the Exercise pre-save hook
 *   (OPENAI_API_KEY, fail-soft) — run scripts/backfillEmbeddings.js after if
 *   the key wasn't available.
 * - Templates: idempotent UPSERT-BY-NAME scoped to { isCommon: true } — an
 *   existing template's _id is preserved on re-run, because calendar events
 *   and UserSessionModification docs reference templates by _id; a
 *   delete-and-recreate would orphan every link and favorite.
 * - Prints INSERTED_EXERCISE_IDS=[...] at the end — the rollback artifact
 *   (db.exercises.deleteMany({_id: {$in: [...]}})). Templates roll back by
 *   name.
 *
 * Usage:  node scripts/seed-sport-templates.js
 *         (point MONGODB_URI at a scratch DB first to dry-run)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SessionTemplate = require('../src/models/SessionTemplate');
const Exercise = require('../src/models/Exercise');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// New catalog entries for disciplines the exercise catalog barely covers.
// Climbing entries are find-or-create too — the 16 existing climbing docs are
// personal training exercises (hangboard etc.), these session building blocks
// may or may not exist.
const NEW_EXERCISES = [
  // Running
  { name: 'Easy Run', muscles: ['legs', 'glutes'], discipline: ['running'], difficulty: 'beginner', description: 'Relaxed conversational-pace running.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '30 min' } },
  { name: 'Interval Run', muscles: ['legs', 'glutes'], discipline: ['running'], difficulty: 'intermediate', description: 'Hard running repeat at a target pace, recovered between efforts.', strain: { intensity: 'high', load: 'bodyweight', durationType: 'distance', typicalVolume: '400m' } },
  { name: 'Tempo Run', muscles: ['legs', 'glutes'], discipline: ['running'], difficulty: 'intermediate', description: 'Sustained comfortably-hard running around threshold pace.', strain: { intensity: 'moderate', load: 'bodyweight', durationType: 'time', typicalVolume: '20 min' } },
  { name: 'Hill Sprints', muscles: ['legs', 'glutes', 'calves'], discipline: ['running'], difficulty: 'advanced', description: 'Short maximal uphill sprints, full recovery between.', strain: { intensity: 'max', load: 'bodyweight', durationType: 'time', typicalVolume: '10-15s' } },
  { name: 'Running Drills', muscles: ['legs', 'calves'], discipline: ['running'], difficulty: 'beginner', description: 'Form drills: A-skips, B-skips, high knees, butt kicks.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '5 min' } },
  { name: 'Cooldown Jog', muscles: ['legs'], discipline: ['running'], difficulty: 'beginner', description: 'Very easy jogging to flush out after the main work.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '5-10 min' } },
  // Cycling
  { name: 'Endurance Ride', muscles: ['legs', 'glutes'], discipline: ['cycling'], difficulty: 'beginner', description: 'Steady zone-2 riding, sustainable for an hour or more.', strain: { intensity: 'moderate', load: 'bodyweight', durationType: 'time', typicalVolume: '60 min' } },
  { name: 'Bike Sprint Interval', muscles: ['legs', 'glutes'], discipline: ['cycling'], difficulty: 'advanced', description: 'All-out sprint effort on the bike.', strain: { intensity: 'max', load: 'bodyweight', durationType: 'time', typicalVolume: '20s' } },
  { name: 'Hill Climb Repeats', muscles: ['legs', 'glutes'], discipline: ['cycling'], difficulty: 'intermediate', description: 'Sustained hard climbing efforts, easy spin back down.', strain: { intensity: 'high', load: 'bodyweight', durationType: 'time', typicalVolume: '3-5 min' } },
  { name: 'Cadence Drills', muscles: ['legs'], discipline: ['cycling'], difficulty: 'beginner', description: 'High-rpm spin-ups at low resistance to smooth out the pedal stroke.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '1 min' } },
  { name: 'Easy Spin', muscles: ['legs'], discipline: ['cycling'], difficulty: 'beginner', description: 'Light-resistance spinning for warm-up, recovery and cool-down.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '10 min' } },
  // Climbing
  { name: 'ARC Traverse', muscles: ['forearms', 'back', 'core'], discipline: ['climbing'], difficulty: 'beginner', description: 'Continuous easy climbing/traversing below the pump threshold (Aerobic Restoration and Capillarity).', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '10 min' } },
  { name: 'Limit Bouldering', muscles: ['forearms', 'back', 'core', 'shoulders'], discipline: ['climbing'], difficulty: 'advanced', description: 'Short maximal boulder problems at your limit, full recovery between attempts.', strain: { intensity: 'max', load: 'bodyweight', durationType: 'reps', typicalVolume: '4-6 attempts' } },
  { name: 'Climbing Technique Drills', muscles: ['legs', 'core', 'forearms'], discipline: ['climbing'], difficulty: 'beginner', description: 'Silent feet, flagging, precise foot placements on easy terrain.', strain: { intensity: 'low', load: 'bodyweight', durationType: 'time', typicalVolume: '10 min' } },
];

// Existing common catalog exercises reused in the climbing core finisher —
// resolved by name, silently dropped if the catalog doesn't have them.
const EXISTING_EXERCISE_NAMES = ['Toes To Bar', 'Hollow Body Hold', 'Russian Twists'];

const ex = (map, name, volume, rest = '', notes = '') => (map[name] ? {
  exercise_id: map[name],
  exercise_name: name,
  volume,
  rest,
  notes,
} : null);

const buildTemplates = (map) => [
  {
    name: 'Track Intervals 8x400m',
    goal: 'Build 5k speed with classic 400m repeats.',
    primary_disciplines: ['running'],
    estimated_duration: 45,
    difficulty_level: 'intermediate',
    isCommon: true,
    createdBy: null,
    tags: ['running', 'intervals', 'speed'],
    blocks: [
      {
        name: 'Warm-Up',
        type: 'duration',
        duration_seconds: 600,
        instructions: 'Easy jogging, finish with drills to prime turnover.',
        exercises: [
          ex(map, 'Easy Run', '8 min easy'),
          ex(map, 'Running Drills', '2 min of drills'),
        ].filter(Boolean),
      },
      {
        name: '400m Repeats',
        type: 'interval',
        rounds: 8,
        rest_seconds: 90,
        instructions: 'Hit the same split every repeat — the last two should feel hard but repeatable.',
        exercises: [
          ex(map, 'Interval Run', '400m @ 5k pace', '90s jog'),
        ].filter(Boolean),
      },
      {
        name: 'Cool-Down',
        type: 'duration',
        duration_seconds: 300,
        exercises: [
          ex(map, 'Cooldown Jog', '5 min very easy'),
        ].filter(Boolean),
      },
    ],
  },
  {
    name: 'Tempo Run 40',
    goal: 'Raise your threshold with 20 minutes of comfortably-hard running.',
    primary_disciplines: ['running'],
    estimated_duration: 40,
    difficulty_level: 'beginner',
    isCommon: true,
    createdBy: null,
    tags: ['running', 'tempo', 'threshold'],
    blocks: [
      {
        name: 'Warm-Up',
        type: 'duration',
        duration_seconds: 600,
        exercises: [ex(map, 'Easy Run', '10 min easy')].filter(Boolean),
      },
      {
        name: 'Tempo',
        type: 'duration',
        duration_seconds: 1200,
        instructions: 'Comfortably hard — you could say a sentence, not hold a conversation.',
        exercises: [ex(map, 'Tempo Run', '20 min @ tempo')].filter(Boolean),
      },
      {
        name: 'Cool-Down',
        type: 'duration',
        duration_seconds: 600,
        exercises: [ex(map, 'Cooldown Jog', '10 min very easy')].filter(Boolean),
      },
    ],
  },
  {
    name: 'Bike Tabata Blast',
    goal: 'Max-intensity conditioning on the bike: two tabata sets of 8x20/10.',
    primary_disciplines: ['cycling'],
    estimated_duration: 30,
    difficulty_level: 'advanced',
    isCommon: true,
    createdBy: null,
    tags: ['cycling', 'tabata', 'hiit', 'conditioning'],
    blocks: [
      {
        name: 'Spin-Up',
        type: 'duration',
        duration_seconds: 600,
        instructions: 'Build resistance gradually, add three short 10s bursts near the end.',
        exercises: [ex(map, 'Easy Spin', '10 min building')].filter(Boolean),
      },
      {
        name: 'Tabata Set 1',
        type: 'tabata',
        rounds: 8,
        work_seconds: 20,
        rest_seconds: 10,
        instructions: 'All-out on every work interval — hold nothing back.',
        exercises: [ex(map, 'Bike Sprint Interval', '20s all-out', '10s easy')].filter(Boolean),
      },
      {
        name: 'Recovery Spin',
        type: 'duration',
        duration_seconds: 240,
        exercises: [ex(map, 'Easy Spin', '4 min very easy')].filter(Boolean),
      },
      {
        name: 'Tabata Set 2',
        type: 'tabata',
        rounds: 8,
        work_seconds: 20,
        rest_seconds: 10,
        exercises: [ex(map, 'Bike Sprint Interval', '20s all-out', '10s easy')].filter(Boolean),
      },
      {
        name: 'Cool-Down',
        type: 'duration',
        duration_seconds: 300,
        exercises: [ex(map, 'Easy Spin', '5 min very easy')].filter(Boolean),
      },
    ],
  },
  {
    name: 'Endurance Ride 60',
    goal: 'A steady hour of zone-2 riding with cadence work to build your aerobic base.',
    primary_disciplines: ['cycling'],
    estimated_duration: 60,
    difficulty_level: 'beginner',
    isCommon: true,
    createdBy: null,
    tags: ['cycling', 'endurance', 'zone2'],
    blocks: [
      {
        name: 'Endurance Ride',
        type: 'duration',
        duration_seconds: 3000,
        instructions: 'Zone 2 — you can breathe through your nose. Resist going harder.',
        exercises: [ex(map, 'Endurance Ride', '50 min steady Z2')].filter(Boolean),
      },
      {
        name: 'Cadence Drills',
        type: 'interval',
        rounds: 4,
        work_seconds: 60,
        rest_seconds: 120,
        instructions: 'Spin up to 100-110 rpm without bouncing in the saddle.',
        exercises: [ex(map, 'Cadence Drills', '1 min high cadence', '2 min normal')].filter(Boolean),
      },
      {
        name: 'Cool-Down',
        type: 'duration',
        duration_seconds: 300,
        exercises: [ex(map, 'Easy Spin', '5 min very easy')].filter(Boolean),
      },
    ],
  },
  {
    name: 'Bouldering Power',
    goal: 'Max-strength bouldering: limit problems with full recovery, capped with core.',
    primary_disciplines: ['climbing'],
    estimated_duration: 75,
    difficulty_level: 'intermediate',
    isCommon: true,
    createdBy: null,
    tags: ['climbing', 'bouldering', 'power'],
    blocks: [
      {
        name: 'Warm-Up Traverses',
        type: 'duration',
        duration_seconds: 900,
        instructions: 'Easy traversing and technique work, pyramid up through the grades.',
        exercises: [
          ex(map, 'ARC Traverse', '10 min easy traversing'),
          ex(map, 'Climbing Technique Drills', '5 min silent feet'),
        ].filter(Boolean),
      },
      {
        name: 'Limit Boulders',
        exercises: [
          ex(map, 'Limit Bouldering', '4-6 attempts per problem', '2-3 min', 'Pick 3-4 problems at your limit. Stop a session early over sloppy attempts.'),
        ].filter(Boolean),
      },
      {
        name: 'Core Finisher',
        type: 'circuit',
        rounds: 3,
        rest_seconds: 60,
        exercises: [
          ex(map, 'Toes To Bar', '8-10 reps'),
          ex(map, 'Hollow Body Hold', '30s'),
          ex(map, 'Russian Twists', '20 reps'),
        ].filter(Boolean),
      },
    ],
  },
  {
    name: 'ARC Endurance Climb',
    goal: 'Build climbing-specific endurance with long continuous easy climbing sets.',
    primary_disciplines: ['climbing'],
    estimated_duration: 60,
    difficulty_level: 'beginner',
    isCommon: true,
    createdBy: null,
    tags: ['climbing', 'endurance', 'arc'],
    blocks: [
      {
        // Typed interval, not a '2x5 min' volume string — parseVolume's NxM
        // regex would read that as 2 sets of 5 REPS and show a bogus target.
        name: 'Technique Warm-Up',
        type: 'interval',
        rounds: 2,
        work_seconds: 300,
        rest_seconds: 60,
        exercises: [
          ex(map, 'Climbing Technique Drills', '5 min of drills', '1 min', 'Silent feet, straight arms, hip positioning.'),
        ].filter(Boolean),
      },
      {
        name: 'ARC Sets',
        type: 'interval',
        rounds: 3,
        work_seconds: 600,
        rest_seconds: 300,
        instructions: 'Continuous easy climbing — stay below the pump the whole set.',
        exercises: [
          ex(map, 'ARC Traverse', '10 min continuous', '5 min'),
        ].filter(Boolean),
      },
    ],
  },
];

async function seedSportTemplates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato');
    console.log(`Connected to ${mongoose.connection.name}`);

    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '⚠ OPENAI_API_KEY is not set: new exercises will be created WITHOUT embeddings '
        + '(semantic matching degraded). Run scripts/backfillEmbeddings.js with a valid key afterwards.'
      );
    }

    // Phase 1: find-or-create exercises
    const exerciseMap = {};
    const insertedExerciseIds = [];
    for (const def of NEW_EXERCISES) {
      const existing = await Exercise.findOne({
        name: { $regex: `^${escapeRegex(def.name)}$`, $options: 'i' },
      });
      if (existing) {
        exerciseMap[def.name] = existing._id;
        console.log(`  = exercise exists: ${existing.name}`);
        continue;
      }
      const created = await Exercise.create({ ...def, isCommon: true, createdBy: null });
      exerciseMap[def.name] = created._id;
      insertedExerciseIds.push(created._id.toString());
      console.log(`  + exercise created: ${created.name}`);
    }
    for (const name of EXISTING_EXERCISE_NAMES) {
      const existing = await Exercise.findOne({
        name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        isCommon: true,
      });
      if (existing) {
        exerciseMap[name] = existing._id;
      } else {
        console.warn(`  ! catalog exercise missing, will be dropped from blocks: ${name}`);
      }
    }

    // Phase 2: upsert the templates by name, preserving _id on re-runs.
    const templates = buildTemplates(exerciseMap);
    for (const template of templates) {
      const emptyBlocks = template.blocks.filter((b) => b.exercises.length === 0);
      if (emptyBlocks.length > 0) {
        console.warn(`  ! skipping "${template.name}" — empty block(s): ${emptyBlocks.map((b) => b.name).join(', ')}`);
        continue;
      }
      const existing = await SessionTemplate.findOne({ name: template.name, isCommon: true });
      if (existing) {
        // Update in place: calendar events and favorites reference this _id.
        // popularity/ratings are user-earned — leave them alone.
        const { popularity, ratings, ...fields } = template;
        Object.assign(existing, fields);
        await existing.save();
        console.log(`  ~ template updated in place: ${existing.name} (${existing.blocks.length} blocks, ${existing.totalExercises} exercises)`);
      } else {
        const created = await SessionTemplate.create(template);
        console.log(`  + template created: ${created.name} (${created.blocks.length} blocks, ${created.totalExercises} exercises)`);
      }
    }

    console.log(`\nINSERTED_EXERCISE_IDS=${JSON.stringify(insertedExerciseIds)}`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding sport templates:', error);
    process.exit(1);
  }
}

seedSportTemplates();
