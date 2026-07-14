#!/usr/bin/env node

/**
 * One-off migration: calendar events only combine a workout with a date —
 * they must not embed an exercise list. For every SCHEDULED/IN_PROGRESS
 * workout/deload event that carries both a workoutTemplateId and an embedded
 * workoutDetails.exercises copy, verify the linked template still holds the
 * exercises and $unset the embedded copy.
 *
 * Explicitly NOT touched:
 *  - completed/skipped events — their workoutDetails.exercises are ACTUAL
 *    performed sets (workout-log flow), a historical record;
 *  - events without a workoutTemplateId — run the calendar consistency job
 *    (linkOrphanWorkoutEvents) first so orphans get templates, then re-run;
 *  - events whose template is missing or empty — the embedded copy stays as
 *    the only backstop (reported in the summary);
 *  - events whose embedded count differs from the template (pre-fix
 *    update_calendar_workout edits drifted them) — kept unless --force.
 *
 * Usage:
 *   node scripts/migrate-calendar-embedded-exercises.js             # dry run (default)
 *   node scripts/migrate-calendar-embedded-exercises.js --apply     # write
 *   node scripts/migrate-calendar-embedded-exercises.js --apply --force   # also strip count-mismatched events
 *   node scripts/migrate-calendar-embedded-exercises.js --user <id> # limit to one user
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CalendarEvent = require('../src/models/CalendarEvent');
const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const { flattenTemplateExercises } = require('../src/utils/volume');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const userFlagIdx = process.argv.indexOf('--user');
const USER_ID = userFlagIdx > -1 ? process.argv[userFlagIdx + 1] : null;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${FORCE ? ' +force' : ''}${USER_ID ? ` user=${USER_ID}` : ''}`);

  const query = {
    type: { $in: ['workout', 'deload'] },
    workoutTemplateId: { $exists: true, $ne: null },
    status: { $in: ['scheduled', 'in_progress'] },
    'workoutDetails.exercises.0': { $exists: true }
  };
  if (USER_ID) query.userId = new mongoose.Types.ObjectId(USER_ID);

  const events = await CalendarEvent.find(query).lean();
  console.log(`Examined: ${events.length} event(s) with a template AND an embedded exercise list`);

  const stats = { unset: 0, missingTemplate: 0, emptyTemplate: 0, countMismatch: 0 };

  for (const event of events) {
    const template = await PredefinedWorkout.findById(event.workoutTemplateId).lean();
    const label = `${event._id} "${event.title}" (${new Date(event.date).toISOString().slice(0, 10)})`;

    if (!template) {
      stats.missingTemplate++;
      console.log(`  SKIP missing template: ${label}`);
      continue;
    }

    const flattened = flattenTemplateExercises(template);
    if (!flattened.length) {
      stats.emptyTemplate++;
      console.log(`  SKIP template has no exercises: ${label}`);
      continue;
    }

    const embeddedCount = event.workoutDetails.exercises.length;
    if (flattened.length !== embeddedCount && !FORCE) {
      stats.countMismatch++;
      console.log(`  SKIP count mismatch (template ${flattened.length} vs embedded ${embeddedCount}, use --force): ${label}`);
      continue;
    }

    if (APPLY) {
      await CalendarEvent.updateOne(
        { _id: event._id },
        { $unset: { 'workoutDetails.exercises': 1 } }
      );
    }
    stats.unset++;
  }

  console.log('\nSummary:');
  console.log(`  ${APPLY ? 'Unset' : 'Would unset'}: ${stats.unset}`);
  console.log(`  Skipped — missing template: ${stats.missingTemplate}`);
  console.log(`  Skipped — template empty: ${stats.emptyTemplate}`);
  console.log(`  Skipped — count mismatch: ${stats.countMismatch}`);
  if (stats.missingTemplate + stats.emptyTemplate > 0) {
    console.log('  → run the calendar consistency job (linkOrphanWorkoutEvents) and re-check the skipped events.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
