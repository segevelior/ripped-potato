#!/usr/bin/env node

/**
 * Apply the collection-level $jsonSchema validator on predefinedworkouts:
 * every blocks[].exercises[] entry must have a real (objectId) exercise_id
 * and a non-empty exercise_name, and every document must have blocks.
 *
 * This is the DB-level backstop for writers that bypass Mongoose (the Python
 * coach service writes with raw motor). Kept minimal on purpose — only the
 * integrity invariant, so unrelated schema evolution is never blocked.
 *
 * Rollout (run fix-null-exercise-ids.js FIRST — it must report clean):
 *   node scripts/add-predefinedworkouts-validator.js --warn    # log violations, allow writes
 *   node scripts/add-predefinedworkouts-validator.js --error   # reject violations (after quiet warn period)
 *   node scripts/add-predefinedworkouts-validator.js --status  # show current validator
 *   node scripts/add-predefinedworkouts-validator.js --remove  # drop the validator
 *
 * Violations in warn mode appear in the mongod/Atlas logs as
 * "Document would fail validation".
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MODE = process.argv.includes('--error') ? 'error'
  : process.argv.includes('--status') ? 'status'
  : process.argv.includes('--remove') ? 'remove'
  : 'warn';

// blocks is required at the top level: prod has zero blocks-less documents,
// and without it a malformed writer could skip the invariant entirely by
// omitting blocks (properties-only $jsonSchema doesn't apply to absent fields).
const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['blocks'],
    properties: {
      blocks: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          properties: {
            exercises: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['exercise_id', 'exercise_name'],
                properties: {
                  exercise_id: { bsonType: 'objectId' }, // rejects null AND missing
                  exercise_name: { bsonType: 'string', minLength: 1 },
                },
              },
            },
          },
        },
      },
    },
  },
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`✅ Connected to MongoDB (mode: ${MODE})`);

  if (MODE === 'status') {
    const info = await db.command({ listCollections: 1, filter: { name: 'predefinedworkouts' } });
    const options = info.cursor.firstBatch[0]?.options || {};
    console.log(JSON.stringify({
      validator: options.validator || null,
      validationLevel: options.validationLevel || null,
      validationAction: options.validationAction || null,
    }, null, 2));
  } else if (MODE === 'remove') {
    await db.command({ collMod: 'predefinedworkouts', validator: {}, validationLevel: 'off' });
    console.log('🗑️  Validator removed');
  } else {
    // Refuse to tighten over dirty data: strict validation fires on ANY update
    // to an invalid document, not just inserts.
    const bad = await db.collection('predefinedworkouts').countDocuments({
      $or: [
        { blocks: { $exists: false } },
        { 'blocks.exercises': { $elemMatch: { $or: [
          { exercise_id: null },
          { exercise_id: { $exists: false } },
          { exercise_name: '' },
          { exercise_name: { $exists: false } },
        ] } } },
      ],
    });
    if (bad > 0) {
      console.error(`❌ ${bad} document(s) violate the schema — run fix-null-exercise-ids.js first.`);
      process.exit(1);
    }

    await db.command({
      collMod: 'predefinedworkouts',
      validator: VALIDATOR,
      validationLevel: 'strict',
      validationAction: MODE, // 'warn' logs + allows; 'error' rejects
    });
    console.log(`✅ Validator applied (validationAction: ${MODE})`);
    if (MODE === 'warn') {
      console.log('👀 Watch the mongod/Atlas logs for "Document would fail validation", then re-run with --error.');
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
