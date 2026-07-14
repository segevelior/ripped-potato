#!/usr/bin/env node

/**
 * One-off cleanup: schedule_to_calendar used to mint a new date-suffixed
 * PredefinedWorkout per scheduled date ("Push Day (Jul 07)", "Push Day
 * (Jul 14)", ...), so a twice-a-week workout left 8 copies/month in the
 * Workouts tab. Creation is reuse-first now; this script merges the copies
 * that already exist.
 *
 * Groups user-owned templates by (createdBy, normalized name, exercise
 * content signature) — the exact shape the bug produced. For each group it
 * keeps one canonical template, re-points every reference at it, verifies
 * nothing still references the duplicates, then deletes them.
 *
 * Re-pointed collections:
 *  - calendarevents.workoutTemplateId — ALL statuses including completed
 *    (completed events keep their actual performed sets embedded; the link is
 *    a display affordance, and content-identical re-pointing is lossless —
 *    leaving it dangling after deletion would degrade history views);
 *  - plans.weeks[].workouts[].predefinedWorkoutId — a deleted id here breaks
 *    future schedule_plan_to_calendar runs;
 *  - userworkoutmodifications.workoutId — unless the canonical already has a
 *    modification for the same user (unique userId+workoutId index): then the
 *    duplicate is kept and reported instead of merged.
 *
 * Explicitly NOT touched: common templates, and same-content templates the
 * user deliberately named differently (reported as info, never merged).
 *
 * Usage:
 *   node scripts/dedupe-predefined-workouts.js             # dry run (default)
 *   node scripts/dedupe-predefined-workouts.js --apply     # write
 *   node scripts/dedupe-predefined-workouts.js --user <id> # limit to one user
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CalendarEvent = require('../src/models/CalendarEvent');
const PredefinedWorkout = require('../src/models/PredefinedWorkout');
const Plan = require('../src/models/Plan');
const UserWorkoutModification = require('../src/models/UserWorkoutModification');
const { flattenTemplateExercises } = require('../src/utils/volume');
const { contentSignature, normalizeTemplateName } = require('../src/services/templateMaterializer');

const APPLY = process.argv.includes('--apply');
const userFlagIdx = process.argv.indexOf('--user');
const USER_ID = userFlagIdx > -1 ? process.argv[userFlagIdx + 1] : null;
// A typo'd `--apply --user` with no id must never silently become a
// full-production apply.
if (userFlagIdx > -1 && (!USER_ID || USER_ID.startsWith('-'))) {
  console.error('--user requires a user id');
  process.exit(1);
}

// Month-anchored, matching ai-coach-service's dedup.py — a looser
// [A-Z][a-z]{2} would fold non-date parentheticals like "(Set 5)" into the
// grouping key.
const DATE_SUFFIX_RE = /\s*\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\)\s*$/;

async function eventCounts(templateId) {
  const rows = await CalendarEvent.aggregate([
    { $match: { workoutTemplateId: templateId } },
    { $group: { _id: '$status', n: { $sum: 1 } } }
  ]);
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return { total: rows.reduce((s, r) => s + r.n, 0), byStatus };
}

async function refCount(templateId) {
  const [events, plans, mods] = await Promise.all([
    CalendarEvent.countDocuments({ workoutTemplateId: templateId }),
    Plan.countDocuments({ 'weeks.workouts.predefinedWorkoutId': templateId }),
    UserWorkoutModification.countDocuments({ workoutId: templateId })
  ]);
  return { events, plans, mods, total: events + plans + mods };
}

async function repointPlans(dupId, canonicalId) {
  const plans = await Plan.find({ 'weeks.workouts.predefinedWorkoutId': dupId });
  for (const plan of plans) {
    for (const week of plan.weeks || []) {
      for (const workout of week.workouts || []) {
        if (String(workout.predefinedWorkoutId) === String(dupId)) {
          workout.predefinedWorkoutId = canonicalId;
        }
      }
    }
    // updateOne on the whole weeks path — .save() can trip validators on
    // legacy plan docs that predate today's schema.
    await Plan.updateOne({ _id: plan._id }, { $set: { weeks: plan.toObject().weeks } });
  }
  return plans.length;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${USER_ID ? ` user=${USER_ID}` : ''}`);

  const query = { isCommon: { $ne: true }, createdBy: { $ne: null } };
  if (USER_ID) query.createdBy = new mongoose.Types.ObjectId(USER_ID);

  const templates = await PredefinedWorkout.find(query).lean();
  console.log(`Examined: ${templates.length} user-owned template(s)`);

  // Primary grouping: owner + normalized name + content — the duplication
  // pattern schedule_to_calendar produced. Content-only groups (same content,
  // different names) are collected separately and only REPORTED.
  const groups = new Map();
  const byContent = new Map();
  for (const t of templates) {
    const signature = contentSignature(flattenTemplateExercises(t));
    if (!signature) continue; // empty templates are not this script's problem
    const key = `${t.createdBy}::${normalizeTemplateName(t.name)}::${signature}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
    const cKey = `${t.createdBy}::${signature}`;
    if (!byContent.has(cKey)) byContent.set(cKey, []);
    byContent.get(cKey).push(t);
  }

  const stats = {
    groups: 0, templatesDeleted: 0, eventsRepointed: 0,
    plansRepointed: 0, modsRepointed: 0, skippedConflicts: 0, renamed: 0
  };

  for (const [, members] of groups) {
    if (members.length < 2) continue;
    stats.groups++;

    // Canonical: un-dated stored name → most event references → oldest.
    const withCounts = [];
    for (const t of members) {
      withCounts.push({ t, events: await eventCounts(t._id) });
    }
    withCounts.sort((a, b) =>
      DATE_SUFFIX_RE.test(a.t.name) - DATE_SUFFIX_RE.test(b.t.name) ||
      b.events.total - a.events.total ||
      String(a.t._id).localeCompare(String(b.t._id))
    );
    const canonical = withCounts[0];
    const dups = withCounts.slice(1);

    const cleanName = canonical.t.name.replace(DATE_SUFFIX_RE, '').trim();
    console.log(`\nGroup "${cleanName}" (owner ${canonical.t.createdBy}):`);
    console.log(`  KEEP   ${canonical.t._id} "${canonical.t.name}" — events: ${JSON.stringify(canonical.events.byStatus)}`);

    if (cleanName !== canonical.t.name) {
      stats.renamed++;
      console.log(`  RENAME canonical -> "${cleanName}"`);
      if (APPLY) {
        await PredefinedWorkout.updateOne({ _id: canonical.t._id }, { $set: { name: cleanName } });
      }
    }

    for (const dup of dups) {
      const [planRefs, modDoc, canonicalMod] = await Promise.all([
        Plan.countDocuments({ 'weeks.workouts.predefinedWorkoutId': dup.t._id }),
        UserWorkoutModification.findOne({ workoutId: dup.t._id }).lean(),
        UserWorkoutModification.findOne({ workoutId: canonical.t._id }).lean()
      ]);

      // Both the dup and the canonical carry a user modification: merging is
      // out of scope (unique userId+workoutId index), keep the dup.
      if (modDoc && canonicalMod && String(modDoc.userId) === String(canonicalMod.userId)) {
        stats.skippedConflicts++;
        console.log(`  SKIP   ${dup.t._id} "${dup.t.name}" — both it and the canonical have a user modification`);
        continue;
      }

      console.log(`  MERGE  ${dup.t._id} "${dup.t.name}" — events: ${JSON.stringify(dup.events.byStatus)}, planRefs: ${planRefs}, mod: ${modDoc ? 'yes' : 'no'}`);

      if (APPLY) {
        const { modifiedCount } = await CalendarEvent.updateMany(
          { workoutTemplateId: dup.t._id },
          { $set: { workoutTemplateId: canonical.t._id } }
        );
        stats.eventsRepointed += modifiedCount;
        stats.plansRepointed += await repointPlans(dup.t._id, canonical.t._id);
        if (modDoc) {
          await UserWorkoutModification.updateOne(
            { _id: modDoc._id },
            { $set: { workoutId: canonical.t._id } }
          );
          stats.modsRepointed++;
        }

        // Verify-then-delete: nothing may still reference the duplicate.
        const remaining = await refCount(dup.t._id);
        if (remaining.total > 0) {
          stats.skippedConflicts++;
          console.log(`  ABORT-DELETE ${dup.t._id} — still referenced after re-pointing: ${JSON.stringify(remaining)}`);
          continue;
        }
        await PredefinedWorkout.deleteOne({ _id: dup.t._id });
        stats.templatesDeleted++;
      } else {
        stats.eventsRepointed += dup.events.total;
        stats.plansRepointed += planRefs;
        if (modDoc) stats.modsRepointed++;
        stats.templatesDeleted++;
      }
    }
  }

  // Informational: identical content under different names — a human call,
  // never merged automatically.
  let contentOnly = 0;
  for (const [, members] of byContent) {
    const names = new Set(members.map((t) => normalizeTemplateName(t.name)));
    if (members.length > 1 && names.size > 1) {
      contentOnly++;
      console.log(`\nINFO same content, different names (not merged): ${members.map((t) => `${t._id} "${t.name}"`).join(', ')}`);
    }
  }

  console.log('\nSummary:');
  console.log(`  Duplicate groups: ${stats.groups}`);
  console.log(`  ${APPLY ? 'Deleted' : 'Would delete'} templates: ${stats.templatesDeleted}`);
  console.log(`  ${APPLY ? 'Re-pointed' : 'Would re-point'} events: ${stats.eventsRepointed}, plans: ${stats.plansRepointed}, mods: ${stats.modsRepointed}`);
  console.log(`  Renamed canonicals: ${stats.renamed}`);
  console.log(`  Skipped (conflicts): ${stats.skippedConflicts}`);
  console.log(`  Same-content/different-name groups reported: ${contentOnly}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
