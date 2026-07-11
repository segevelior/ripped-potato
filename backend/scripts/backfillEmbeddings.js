/**
 * One-shot backfill: generate embeddings for exercises that don't have one yet
 * (or whose embedText changed). New/edited exercises self-embed via the model's
 * pre-save hook — this is only for the existing catalog and re-runs.
 *
 * Uses updateOne to write BOTH `embedding` and `embeddingText` together, which
 * skips the pre-save hook (avoids a redundant second embed). Writing only
 * `embedding` would leave a stale embeddingText and cause the next real save to
 * re-embed needlessly.
 *
 * Usage:  node scripts/backfillEmbeddings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('../src/models/Exercise');
const { generateEmbeddings } = require('../src/services/EmbeddingService');

const BATCH_SIZE = 50; // exercises per OpenAI batch request

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set — cannot generate embeddings');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Pull every exercise with the fields needed to build embed text, plus the
  // stored embeddingText so we can skip ones that are already up to date.
  const exercises = await Exercise.find({}, {
    name: 1, muscles: 1, secondaryMuscles: 1, discipline: 1,
    equipment: 1, difficulty: 1, embeddingText: 1
  }).lean();

  console.log(`Loaded ${exercises.length} exercises`);

  // Determine which need (re)embedding by comparing the target embed text.
  const stale = [];
  for (const ex of exercises) {
    const target = Exercise.buildEmbedText(ex);
    if (ex.embeddingText !== target) {
      stale.push({ id: ex._id, text: target });
    }
  }

  console.log(`${stale.length} exercises need embedding (${exercises.length - stale.length} already current)`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE);
    const vectors = await generateEmbeddings(batch.map(b => b.text));

    if (!vectors) {
      console.error(`Batch ${i}-${i + batch.length} failed to embed; skipping`);
      failed += batch.length;
      continue;
    }

    // Write each result. Both fields together so the pre-save hook stays a no-op
    // on the next normal save.
    for (let j = 0; j < batch.length; j++) {
      const vector = vectors[j];
      if (!vector) { failed += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      await Exercise.updateOne(
        { _id: batch[j].id },
        { $set: { embedding: vector, embeddingText: batch[j].text } }
      );
      done += 1;
    }

    console.log(`Progress: ${done}/${stale.length} embedded`);
  }

  console.log(`Done. Embedded ${done}, failed ${failed}.`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
