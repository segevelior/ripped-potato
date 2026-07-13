#!/usr/bin/env node

/**
 * One-off migration: repair predefinedworkouts whose blocks[].exercises[]
 * carry a null/missing exercise_id (written by the Python coach service
 * before the ExerciseResolver existed).
 *
 * Per null entry: reuse an existing exercise by exact case-insensitive name
 * (common or owned by the workout's creator); otherwise create a private
 * exercise for the workout owner via Mongoose (the pre-save hook embeds it
 * when OPENAI_API_KEY is live; otherwise the embedding backfill catches it).
 *
 * MUST run (and report clean) before the collection validator is applied —
 * validate with scripts/add-predefinedworkouts-validator.js afterwards.
 *
 * Usage:
 *   node scripts/fix-null-exercise-ids.js --dry-run   # report only
 *   node scripts/fix-null-exercise-ids.js             # apply
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const Exercise = require('../src/models/Exercise');

const DRY_RUN = process.argv.includes('--dry-run');

// Classification for the known-bad names (from the two affected prod docs).
// Anything not listed falls back to generic values — muscles is free-form.
const SEED_CLASSIFICATION = {
  'bird dog': { muscles: ['Core', 'Lower Back'], discipline: ['Calisthenics'] },
  'reverse crunch': { muscles: ['Core'], discipline: ['Calisthenics'] },
  "child's pose": { muscles: ['Lower Back', 'Core'], discipline: ['Mobility'] },
  'cobra stretch': { muscles: ['Lower Back', 'Core'], discipline: ['Mobility'] },
  '180° band pull apart (with external rotation)': {
    muscles: ['Shoulders', 'Upper Back'], discipline: ['Mobility'], equipment: ['Resistance Band'],
  },
  'dip scapula shrugs (depression-elevation) + hold at the top': {
    muscles: ['Shoulders', 'Chest'], discipline: ['Calisthenics'], equipment: ['Dip Bars'],
  },
  'active to passive hang (elevation-depression) + hold at the top': {
    muscles: ['Shoulders', 'Upper Back', 'Forearms'], discipline: ['Calisthenics'], equipment: ['Pull-up Bar'],
  },
  'single arm scapula push ups (protraction-depression)': {
    muscles: ['Shoulders', 'Upper Back', 'Core'], discipline: ['Calisthenics'],
  },
};
const FALLBACK_CLASSIFICATION = { muscles: ['Full Body'], discipline: ['General Fitness'] };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolveOrCreate(name, ownerId, dryRun) {
  const nameRegex = { $regex: `^${escapeRegex(name)}$`, $options: 'i' };
  const existing = await Exercise.findOne({
    name: nameRegex,
    $or: [{ isCommon: true }, { createdBy: ownerId }],
  });
  if (existing) return { id: existing._id, created: false, canonicalName: existing.name };

  if (dryRun) return { id: null, created: true, canonicalName: name };

  const cls = SEED_CLASSIFICATION[name.toLowerCase()] || FALLBACK_CLASSIFICATION;
  const exercise = new Exercise({
    name,
    description: `${name} — added by the null-exercise-id migration`,
    muscles: cls.muscles,
    discipline: cls.discipline,
    equipment: cls.equipment || [],
    difficulty: 'beginner',
    instructions: [],
    isCommon: false,
    createdBy: ownerId,
  });
  await exercise.save(); // pre-save hook generates the embedding (fail-soft)
  return { id: exercise._id, created: true, canonicalName: exercise.name };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`✅ Connected to MongoDB${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);

  const workouts = await PredefinedWorkout.find({
    'blocks.exercises': {
      $elemMatch: { $or: [{ exercise_id: null }, { exercise_id: { $exists: false } }] },
    },
  });
  console.log(`📊 Found ${workouts.length} workout(s) with null/missing exercise_id`);

  let fixedEntries = 0;
  let createdExercises = 0;
  let failures = 0;

  for (const workout of workouts) {
    console.log(`\n🔧 ${workout._id} "${workout.name}" (owner ${workout.createdBy})`);
    for (const block of workout.blocks || []) {
      for (const ex of block.exercises || []) {
        if (ex.exercise_id) continue;
        const name = (ex.exercise_name || '').trim();
        if (!name) {
          console.log('  ❌ entry has neither exercise_id nor exercise_name — needs manual fix');
          failures++;
          continue;
        }
        try {
          const res = await resolveOrCreate(name, workout.createdBy, DRY_RUN);
          console.log(
            `  ${res.created ? '➕ create' : '♻️  reuse'} "${name}" → ` +
            `${res.id || '(would create)'}${res.canonicalName !== name ? ` (as "${res.canonicalName}")` : ''}`
          );
          if (!DRY_RUN) {
            ex.exercise_id = res.id;
            if (res.canonicalName) ex.exercise_name = res.canonicalName;
          }
          fixedEntries++;
          if (res.created) createdExercises++;
        } catch (err) {
          console.log(`  ❌ "${name}": ${err.message}`);
          failures++;
        }
      }
    }
    if (!DRY_RUN) {
      await workout.save(); // re-runs Mongoose validation (exercise_id required)
      console.log('  💾 saved');
    }
  }

  console.log(
    `\n📋 Summary: ${fixedEntries} entr${fixedEntries === 1 ? 'y' : 'ies'} fixed, ` +
    `${createdExercises} exercise(s) ${DRY_RUN ? 'would be ' : ''}created, ${failures} failure(s)`
  );

  const remaining = DRY_RUN ? 0 : await PredefinedWorkout.countDocuments({
    'blocks.exercises': {
      $elemMatch: { $or: [{ exercise_id: null }, { exercise_id: { $exists: false } }] },
    },
  });
  if (!DRY_RUN) {
    console.log(remaining === 0
      ? '✅ No null exercise_id remains — safe to apply the collection validator.'
      : `❌ ${remaining} workout(s) still have null exercise_id`);
  }

  await mongoose.disconnect();
  process.exit(failures > 0 || remaining > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
