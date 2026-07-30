#!/usr/bin/env node

/**
 * One-off migration for the Strava↔planned-workout matcher (see
 * activityMatchingService): activities synced before matching existed each
 * have a standalone mirror CalendarEvent, possibly duplicating a planned
 * session on the same day. For every strava ExternalActivity with a linked
 * mirror event:
 *  - run the same classifier the sync now uses against its same-day sibling
 *    events (the mirror itself excluded);
 *  - merge  → link the planned event, delete the mirror, matchStatus 'auto';
 *  - pending → keep the mirror, backfill sessionDetails.source/stravaData
 *    (they were stripped by strict mode pre-fix), matchStatus 'pending'
 *    + candidates;
 *  - none  → same backfill, matchStatus 'unmatched'.
 * Activities that already have a matchStatus are skipped (idempotent).
 *
 * Usage:
 *   node scripts/migrate-merge-strava-mirror-duplicates.js             # dry run (default)
 *   node scripts/migrate-merge-strava-mirror-duplicates.js --apply     # write
 *   node scripts/migrate-merge-strava-mirror-duplicates.js --user <id> # limit to one user
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ExternalActivity = require('../src/models/ExternalActivity');
const CalendarEvent = require('../src/models/CalendarEvent');
const StravaIntegrationService = require('../src/services/StravaIntegrationService');
const ActivityMatchingService = require('../src/services/activityMatchingService');

const APPLY = process.argv.includes('--apply');
const userFlagIdx = process.argv.indexOf('--user');
const USER_ID = userFlagIdx > -1 ? process.argv[userFlagIdx + 1] : null;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${USER_ID ? ` user=${USER_ID}` : ''}`);

  const query = { source: 'strava', matchStatus: { $exists: false } };
  if (USER_ID) query.userId = new mongoose.Types.ObjectId(USER_ID);

  const activities = await ExternalActivity.find(query).lean();
  console.log(`Examined: ${activities.length} strava activit(ies) without matchStatus`);

  const stats = { merged: 0, pending: 0, unmatched: 0, noMirror: 0, errors: 0 };

  for (const activity of activities) {
    try {
      const mirror = await CalendarEvent.findOne({
        userId: activity.userId,
        externalActivityId: activity._id
      }).lean();

      const discipline = StravaIntegrationService.mapStravaTypeToDiscipline(activity.sportType);
      const events = (await ActivityMatchingService.findCandidateEvents(activity.userId, activity))
        .filter((e) => !mirror || String(e._id) !== String(mirror._id));
      const { decision, target, candidateIds } = ActivityMatchingService.classifyCandidates(
        activity, discipline, events
      );
      const localDay = ActivityMatchingService.activityLocalDay(activity);

      if (decision === 'merge') {
        stats.merged++;
        console.log(`MERGE     ${localDay} ${activity.name} → "${target.title}" (${String(target._id)})`);
        if (APPLY) {
          await ActivityMatchingService.mergeActivityIntoEvent(activity, target, {
            actor: 'system',
            matchStatus: 'auto',
            action: 'auto_merge',
            context: { candidateIds, discipline, localDay, decision }
          });
        }
      } else {
        const matchStatus = decision === 'pending' ? 'pending' : 'unmatched';
        stats[matchStatus]++;
        if (!mirror) stats.noMirror++;
        console.log(`${matchStatus.toUpperCase().padEnd(9)} ${localDay} ${activity.name} (${candidateIds.length} candidate(s))`);
        if (APPLY) {
          // Backfill the mirror's stripped source/stravaData; creates the
          // mirror if the consistency job hasn't yet.
          await ActivityMatchingService.upsertMirrorEvent(activity, activity.userId, discipline);
          await ExternalActivity.updateOne(
            { _id: activity._id },
            { $set: { matchStatus, matchCandidateIds: decision === 'pending' ? candidateIds : [] } }
          );
        }
      }
    } catch (error) {
      stats.errors++;
      console.error(`ERROR     ${activity._id}: ${error.message}`);
    }
  }

  console.log('\nSummary:', stats);
  if (!APPLY) console.log('Dry run — nothing written. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
