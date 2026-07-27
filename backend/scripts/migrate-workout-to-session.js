#!/usr/bin/env node
/**
 * MANUAL ADMIN SCRIPT
 *
 * workout → session rename: MongoDB cutover migration.
 *
 * Renames collections, converts legacy `workouts` docs into `sessionlogs`,
 * renames persisted fields, flips enum values, swaps indexes, and purges
 * OAuth tokens carrying the old scopes. TRANSFORMS everything — no user
 * document is ever deleted (the legacy `workouts` collection is dropped only
 * after its docs are verified converted; `scheduled_workouts` is archived
 * first if it unexpectedly holds docs).
 *
 * Modes:
 *   node migrate-workout-to-session.js                → dry-run (default)
 *   node migrate-workout-to-session.js --execute      → run the migration
 *   node migrate-workout-to-session.js --verify       → post-migration assertions
 *   --db <name>                                       → override DB (rehearsal)
 *
 * Every phase is idempotent: a crashed --execute can be re-run.
 * Rollback: mongorestore the dump taken in phase 0 (printed path).
 *
 * Preconditions (see plan):
 *  - pending migration chain has been run --apply
 *    (fix-null-exercise-ids → migrate-calendar-embedded-exercises →
 *     add-predefinedworkouts-validator, dedupe-predefined-workouts)
 *  - the connecting user has renameCollection privilege
 *  - backend + ai-coach are SUSPENDED (no writers) when running --execute on prod
 */

const { MongoClient } = require('mongodb');
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MODE = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--verify') ? 'verify'
  : 'dry-run';
const DB_OVERRIDE = (() => {
  const i = process.argv.indexOf('--db');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const RENAMES = [
  ['predefinedworkouts', 'sessiontemplates'],
  ['workoutlogs', 'sessionlogs'],
  ['workouttypes', 'sessiontypes'],
  ['userworkoutmodifications', 'usersessionmodifications'],
];

const AFFECTED = [
  'workouts', 'scheduled_workouts', 'calendarevents', 'plans', 'users',
  'usergoalprogresses', 'dailyRecommendations', 'oauthtokens', 'oauthclients',
  ...RENAMES.flat(),
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const client = new MongoClient(uri);
  await client.connect();
  const dbName = DB_OVERRIDE || client.options.dbName || new URL(uri).pathname.replace(/^\//, '') || 'production';
  const db = client.db(dbName);
  console.log(`Mode: ${MODE} · DB: ${dbName}`);

  const counts = async () => {
    const existing = new Set((await db.listCollections().toArray()).map(c => c.name));
    const out = {};
    for (const name of AFFECTED) {
      out[name] = existing.has(name) ? await db.collection(name).countDocuments() : null; // null = absent
    }
    return out;
  };

  const pre = await counts();
  console.table(pre);

  if (MODE === 'verify') {
    await verify(db, pre);
    await client.close();
    return;
  }

  if (MODE === 'dry-run') {
    await dryRun(db, pre);
    await client.close();
    return;
  }

  // ---------- EXECUTE ----------
  // Phase 0: audit snapshot + dump
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await db.collection('_migration_audit').insertOne({
    migration: 'workout-to-session', phase: 'preflight', at: new Date(), preCounts: pre,
  });
  const dumpDir = path.join(__dirname, '..', `migration-dump-${stamp}`);
  try {
    const collArgs = AFFECTED.filter(n => pre[n] !== null)
      .map(c => `--collection=${c}`);
    // mongodump only takes one --collection per invocation; dump per collection
    for (const c of AFFECTED.filter(n => pre[n] !== null)) {
      execSync(`mongodump --uri="${uri}" --db=${dbName} --collection=${c} --out="${dumpDir}"`, { stdio: 'pipe' });
    }
    console.log(`Dump written to ${dumpDir}`);
  } catch (e) {
    throw new Error(`mongodump failed — aborting before any change: ${e.message}`);
  }

  // Phase 1: collection renames (skip-if-done)
  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));
  for (const [oldName, newName] of RENAMES) {
    if (existing.has(newName) && !existing.has(oldName)) {
      console.log(`SKIP rename ${oldName} → ${newName} (already done)`);
      continue;
    }
    if (!existing.has(oldName)) { console.log(`SKIP rename ${oldName} (absent)`); continue; }
    await db.admin().command({ renameCollection: `${dbName}.${oldName}`, to: `${dbName}.${newName}` });
    console.log(`renamed ${oldName} → ${newName}`);
  }

  // Phase 2: convert legacy workouts docs → sessionlogs (TRANSFORM, never drop unconverted)
  const existing2 = new Set((await db.listCollections().toArray()).map(c => c.name));
  if (existing2.has('workouts')) {
    const legacy = await db.collection('workouts').find({}).toArray();
    let converted = 0;
    for (const w of legacy) {
      const already = await db.collection('sessionlogs').findOne({ _id: w._id });
      if (already) { converted++; continue; }
      const startedAt = w.date || w.createdAt || new Date();
      const durationMin = w.durationMinutes || null;
      const doc = {
        _id: w._id,
        userId: w.userId,
        title: w.title || 'Workout',
        // 'type' is renamed to 'discipline' in phase 3; insert with the NEW
        // field name directly since sessionlogs is post-rename here only if
        // phase 3 already ran — insert with OLD name and let phase 3 rename.
        type: w.type || 'strength',
        startedAt,
        completedAt: durationMin ? new Date(new Date(startedAt).getTime() + durationMin * 60000) : startedAt,
        actualDuration: durationMin,
        exercises: (w.exercises || []).map((ex, i) => ({
          exerciseId: ex.exerciseId || null,
          exerciseName: ex.exerciseName || ex.name || '',
          order: i,
          sets: ex.sets || [],
          notes: ex.notes || '',
        })),
        totalStrain: w.totalStrain,
        muscleStrain: w.muscleStrain,
        notes: w.notes || '',
        createdAt: w.createdAt || new Date(),
        updatedAt: new Date(),
        _convertedFrom: 'workouts',
      };
      await db.collection('sessionlogs').insertOne(doc);
      converted++;
    }
    if (converted === legacy.length) {
      await db.collection('workouts').drop();
      console.log(`converted ${converted}/${legacy.length} legacy workouts docs → sessionlogs; dropped workouts`);
    } else {
      throw new Error(`workouts conversion incomplete (${converted}/${legacy.length}) — NOT dropping`);
    }
  }

  // Phase 2b: scheduled_workouts disposition
  if (existing2.has('scheduled_workouts')) {
    const n = await db.collection('scheduled_workouts').countDocuments();
    if (n === 0) {
      await db.collection('scheduled_workouts').drop();
      console.log('dropped empty scheduled_workouts');
    } else {
      const docs = await db.collection('scheduled_workouts').find({}).toArray();
      for (const d of docs) {
        await db.collection('_archive_scheduled_workouts').updateOne(
          { _id: d._id }, { $setOnInsert: d }, { upsert: true });
      }
      const archived = await db.collection('_archive_scheduled_workouts').countDocuments();
      if (archived >= n) {
        await db.collection('scheduled_workouts').drop();
        console.log(`*** MANUAL REVIEW: scheduled_workouts had ${n} docs — archived to _archive_scheduled_workouts and dropped ***`);
      } else {
        throw new Error('scheduled_workouts archive incomplete — NOT dropping');
      }
    }
  }

  // Phase 3: field renames + enum flips
  // calendarevents — whole-field $rename (preserves undeclared subfields like
  // workoutDetails.source / .stravaData)
  const ce = db.collection('calendarevents');
  await ce.updateMany({ workoutTemplateId: { $exists: true } }, { $rename: { workoutTemplateId: 'sessionTemplateId' } });
  await ce.updateMany({ workoutDetails: { $exists: true } }, { $rename: { workoutDetails: 'sessionDetails' } });
  await ce.updateMany({ workoutLogId: { $exists: true } }, { $rename: { workoutLogId: 'sessionLogId' } });
  await ce.updateMany({ 'sessionDetails.type': { $exists: true } }, { $rename: { 'sessionDetails.type': 'sessionDetails.discipline' } });
  await ce.updateMany({ type: 'workout' }, { $set: { type: 'session' } });
  console.log('calendarevents fields/enum renamed');

  // sessionlogs — type → discipline
  await db.collection('sessionlogs').updateMany({ type: { $exists: true } }, { $rename: { type: 'discipline' } });

  // users preferences
  const users = db.collection('users');
  await users.updateMany({ 'profile.preferences.workoutDuration': { $exists: true } }, { $rename: { 'profile.preferences.workoutDuration': 'profile.preferences.sessionDuration' } });
  await users.updateMany({ 'profile.preferences.workoutDays': { $exists: true } }, { $rename: { 'profile.preferences.workoutDays': 'profile.preferences.sessionDays' } });
  await users.updateMany({ 'profile.preferences.preferredWorkoutTime': { $exists: true } }, { $rename: { 'profile.preferences.preferredWorkoutTime': 'profile.preferences.preferredSessionTime' } });

  // usergoalprogresses
  await db.collection('usergoalprogresses').updateMany({ relatedWorkouts: { $exists: true } }, { $rename: { relatedWorkouts: 'relatedSessions' } });

  // usersessionmodifications — workoutId → sessionTemplateId
  await db.collection('usersessionmodifications').updateMany({ workoutId: { $exists: true } }, { $rename: { workoutId: 'sessionTemplateId' } });

  // dailyRecommendations — suggestion.type flip
  await db.collection('dailyRecommendations').updateMany({ 'suggestion.type': 'workout' }, { $set: { 'suggestion.type': 'session' } });

  // plans — nested arrays need an aggregation-pipeline update ($rename can't reach them)
  await db.collection('plans').updateMany({ 'weeks.workouts': { $exists: true } }, [
    {
      $set: {
        weeks: {
          $map: {
            input: '$weeks',
            as: 'wk',
            in: {
              $mergeObjects: [
                '$$wk',
                {
                  sessions: {
                    $map: {
                      input: { $ifNull: ['$$wk.workouts', []] },
                      as: 'wo',
                      in: {
                        $arrayToObject: {
                          $map: {
                            input: { $objectToArray: '$$wo' },
                            as: 'kv',
                            in: {
                              k: {
                                $switch: {
                                  branches: [
                                    { case: { $eq: ['$$kv.k', 'workoutType'] }, then: 'sessionType' },
                                    { case: { $eq: ['$$kv.k', 'predefinedWorkoutId'] }, then: 'sessionTemplateId' },
                                    { case: { $eq: ['$$kv.k', 'customWorkout'] }, then: 'customSession' },
                                  ],
                                  default: '$$kv.k',
                                },
                              },
                              v: '$$kv.v',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    { $unset: 'weeks.workouts' },
  ]);
  await db.collection('plans').updateMany({ 'schedule.workoutsPerWeek': { $exists: true } }, { $rename: { 'schedule.workoutsPerWeek': 'schedule.sessionsPerWeek' } });
  await db.collection('plans').updateMany({ 'schedule.preferredWorkoutDays': { $exists: true } }, { $rename: { 'schedule.preferredWorkoutDays': 'schedule.preferredSessionDays' } });
  await db.collection('plans').updateMany({ 'progress.completedWorkouts': { $exists: true } }, { $rename: { 'progress.completedWorkouts': 'progress.completedSessions' } });
  await db.collection('plans').updateMany({ 'progress.totalWorkouts': { $exists: true } }, { $rename: { 'progress.totalWorkouts': 'progress.totalSessions' } });
  await db.collection('plans').updateMany({ 'progress.skippedWorkouts': { $exists: true } }, { $rename: { 'progress.skippedWorkouts': 'progress.skippedSessions' } });
  console.log('plans/users/logs/modifications/dailyRecommendations fields renamed');

  // Phase 4: indexes
  const st = db.collection('sessiontemplates');
  const stIdx = await st.indexes();
  if (stIdx.some(i => i.name === 'workout_text_search')) await st.dropIndex('workout_text_search');
  if (!stIdx.some(i => i.name === 'session_text_search')) {
    await st.createIndex({ name: 'text', goal: 'text', tags: 'text' }, { name: 'session_text_search', background: true });
  }
  const usm = db.collection('usersessionmodifications');
  const usmIdx = await usm.indexes();
  for (const idx of usmIdx) {
    if (idx.key && idx.key.workoutId !== undefined) await usm.dropIndex(idx.name);
  }
  await usm.createIndex({ userId: 1, sessionTemplateId: 1 }, { unique: true });
  await usm.createIndex({ sessionTemplateId: 1 });
  console.log('indexes swapped');
  // NOTE: run scripts/add-sessiontemplates-validator.js after this script to
  // reinstall the $jsonSchema validator against the renamed collection.

  // Phase 5: OAuth purge — tokens (access AND refresh; refresh re-mints stored
  // scopes verbatim) + client scope backfill (inert but future-proof)
  const tok = await db.collection('oauthtokens').deleteMany({ scope: { $elemMatch: { $regex: '^workouts:' } } });
  const cli = await db.collection('oauthclients').updateMany(
    { scope: { $regex: 'workouts:' } },
    [{ $set: { scope: { $replaceAll: { input: { $replaceAll: { input: '$scope', find: 'workouts:read', replacement: 'sessions:read' } }, find: 'workouts:write', replacement: 'sessions:write' } } } }]
  );
  console.log(`oauth purge: ${tok.deletedCount} tokens deleted, ${cli.modifiedCount} clients backfilled`);

  await db.collection('_migration_audit').insertOne({
    migration: 'workout-to-session', phase: 'complete', at: new Date(), postCounts: await counts(),
  });
  console.log('EXECUTE complete. Run --verify next.');
  await client.close();
}

async function dryRun(db, pre) {
  console.log('\nDRY RUN — planned operations:');
  for (const [o, n] of RENAMES) console.log(`  renameCollection ${o} (${pre[o]} docs) → ${n}`);
  console.log(`  convert workouts (${pre.workouts ?? 0} docs) → sessionlogs, then drop`);
  console.log(`  scheduled_workouts: ${pre.scheduled_workouts === null ? 'absent' : pre.scheduled_workouts === 0 ? 'drop (empty)' : `ARCHIVE ${pre.scheduled_workouts} docs then drop`}`);
  const ce = db.collection('calendarevents');
  console.log(`  calendarevents: rename fields on ${await ce.countDocuments({ $or: [{ workoutTemplateId: { $exists: true } }, { workoutDetails: { $exists: true } }, { workoutLogId: { $exists: true } }] })} docs; flip type on ${await ce.countDocuments({ type: 'workout' })}`);
  console.log(`  plans with weeks.workouts: ${await db.collection('plans').countDocuments({ 'weeks.workouts': { $exists: true } })}`);
  console.log(`  users with old prefs: ${await db.collection('users').countDocuments({ $or: [{ 'profile.preferences.workoutDuration': { $exists: true } }, { 'profile.preferences.workoutDays': { $exists: true } }, { 'profile.preferences.preferredWorkoutTime': { $exists: true } }] })}`);
  console.log(`  oauthtokens with workouts:* scopes: ${await db.collection('oauthtokens').countDocuments({ scope: { $elemMatch: { $regex: '^workouts:' } } })}`);
  console.log('\nNothing was written.');
}

async function verify(db, current) {
  const audit = await db.collection('_migration_audit').findOne(
    { migration: 'workout-to-session', phase: 'preflight' }, { sort: { at: -1 } });
  const pre = audit ? audit.preCounts : null;
  const failures = [];
  const assert = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? '✓' : '✗'} ${msg}`); };

  assert(current.workouts === null, 'workouts collection gone');
  assert(current.scheduled_workouts === null, 'scheduled_workouts collection gone');
  for (const [o, n] of RENAMES) {
    assert(current[o] === null, `${o} gone`);
    assert(current[n] !== null, `${n} present`);
  }
  if (pre) {
    assert(current.sessiontemplates === pre.predefinedworkouts, `sessiontemplates count == pre predefinedworkouts (${current.sessiontemplates} vs ${pre.predefinedworkouts})`);
    assert(current.sessionlogs === (pre.workoutlogs || 0) + (pre.workouts || 0), `sessionlogs count == pre workoutlogs+workouts (${current.sessionlogs} vs ${(pre.workoutlogs || 0) + (pre.workouts || 0)})`);
  }
  const zeroChecks = [
    ['calendarevents', { $or: [{ workoutTemplateId: { $exists: true } }, { workoutDetails: { $exists: true } }, { workoutLogId: { $exists: true } }, { type: 'workout' }, { 'sessionDetails.type': { $exists: true } }] }],
    ['plans', { $or: [{ 'weeks.workouts': { $exists: true } }, { 'schedule.workoutsPerWeek': { $exists: true } }, { 'progress.completedWorkouts': { $exists: true } }] }],
    ['sessionlogs', { type: { $exists: true } }],
    ['users', { $or: [{ 'profile.preferences.workoutDuration': { $exists: true } }, { 'profile.preferences.workoutDays': { $exists: true } }, { 'profile.preferences.preferredWorkoutTime': { $exists: true } }] }],
    ['usergoalprogresses', { relatedWorkouts: { $exists: true } }],
    ['usersessionmodifications', { workoutId: { $exists: true } }],
    ['dailyRecommendations', { 'suggestion.type': 'workout' }],
    ['oauthtokens', { scope: { $elemMatch: { $regex: '^workouts:' } } }],
  ];
  for (const [coll, q] of zeroChecks) {
    const n = await db.collection(coll).countDocuments(q);
    assert(n === 0, `${coll}: zero docs matching old names (found ${n})`);
  }
  const stIdx = await db.collection('sessiontemplates').indexes();
  assert(stIdx.some(i => i.name === 'session_text_search'), 'session_text_search index present');
  const usmIdx = await db.collection('usersessionmodifications').indexes();
  assert(usmIdx.some(i => i.key && i.key.sessionTemplateId !== undefined && i.key.userId !== undefined && i.unique), 'unique {userId, sessionTemplateId} index present');

  if (failures.length) {
    console.error(`\nVERIFY FAILED: ${failures.length} assertion(s)`);
    process.exit(1);
  }
  console.log('\nVERIFY passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });
