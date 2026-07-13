#!/usr/bin/env node

/**
 * Clean up orphaned Sensei memories.
 *
 * Background: a usermemories document can end up attached to a phantom user id
 * (e.g. an all-zero sentinel) that does not exist in the `users` collection — so
 * it renders in no UI and belongs to no real account. This happens when a memory
 * is written under an old dev/seed/test token, before the save_memory user-id
 * guardrail existed.
 *
 * This script finds usermemories docs whose owner is a sentinel id OR does not
 * exist in `users`, and (with --apply) deletes them. It DEFAULTS to a dry run.
 *
 * Ownership note: these orphans are DELETED, not migrated to a real user. Their
 * owner cannot be identified, and if the content is health-related, importing an
 * unconfirmed health fact into a real user's coach memory could drive wrong
 * training advice. Only delete once ownership has been shown to be unconfirmable.
 *
 * Usage:
 *   node scripts/cleanup-orphaned-memories.js            # dry run (default)
 *   node scripts/cleanup-orphaned-memories.js --apply    # actually delete
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SENTINEL_IDS = [
  '000000000000000000000000',
  '000000000000000000000001',
];

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`✅ Connected to MongoDB (${APPLY ? 'APPLY' : 'DRY RUN'})`);

  const db = mongoose.connection.db;
  const userMemories = db.collection('usermemories');
  const users = db.collection('users');

  const allDocs = await userMemories.find({}).project({ user: 1, memories: 1 }).toArray();
  const orphans = [];

  for (const doc of allDocs) {
    const ownerId = doc.user ? String(doc.user) : null;
    let orphaned = false;
    let reason = '';

    if (!ownerId) {
      orphaned = true;
      reason = 'missing user field';
    } else if (SENTINEL_IDS.includes(ownerId)) {
      orphaned = true;
      reason = 'sentinel/placeholder user id';
    } else {
      const exists = await users.findOne({ _id: doc.user }, { projection: { _id: 1 } });
      if (!exists) {
        orphaned = true;
        reason = 'owner not found in users';
      }
    }

    if (orphaned) {
      orphans.push({ _id: doc._id, ownerId, reason, count: (doc.memories || []).length });
      console.log(`\n⚠️  Orphaned usermemories doc ${doc._id} (owner=${ownerId}) — ${reason}`);
      for (const m of doc.memories || []) {
        console.log(`     • [${m.category}/${m.importance}] ${m.content}`);
      }
    }
  }

  console.log(`\nFound ${orphans.length} orphaned usermemories document(s).`);

  if (!orphans.length) {
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('Dry run — nothing deleted. Re-run with --apply to delete the above.');
    await mongoose.disconnect();
    return;
  }

  const ids = orphans.map((o) => o._id);
  const result = await userMemories.deleteMany({ _id: { $in: ids } });
  console.log(`🗑️  Deleted ${result.deletedCount} orphaned usermemories document(s).`);

  await mongoose.disconnect();
  console.log('✅ Done.');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
