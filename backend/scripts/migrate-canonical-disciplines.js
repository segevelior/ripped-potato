#!/usr/bin/env node
/**
 * MANUAL ADMIN SCRIPT
 *
 * Phase B of the canonical-discipline migration: apply the human-reviewed
 * classification artifact produced by
 * ai-coach-service/scripts/classify_disciplines.py (Phase A) to
 * exercises.discipline and sessiontemplates.primary_disciplines.
 *
 * Refuses to run while ANY artifact row has approved !== true — review must
 * adjudicate every row (flip approved, editing `proposed` as needed). This is
 * load-bearing: the forward-validation PR's enums and this script's postflight
 * `distinct ⊆ canonical` check only hold if no doc keeps an off-vocab value.
 *
 * Modes:
 *   node migrate-canonical-disciplines.js <artifact.json>            → dry-run
 *   node migrate-canonical-disciplines.js <artifact.json> --apply    → write
 *   --collection exercises|sessiontemplates                          → filter
 *   --db <name>                                                      → override DB (rehearsal)
 *
 * Apply flow: preflight audit doc (write-once) + mongodump of both
 * collections → per-row $set of the deduped canonical array → postflight
 * verify (distinct ⊆ canonical, doc counts unchanged) + completion audit doc
 * recording artifact filename + git SHA. Idempotent: re-apply is a no-op.
 *
 * Rollback: mongorestore the dump (path printed).
 */

const { MongoClient, ObjectId } = require('mongodb');
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { DISCIPLINE_SET } = require('../src/config/disciplines');

const FIELD_BY_COLLECTION = {
  exercises: 'discipline',
  sessiontemplates: 'primary_disciplines',
};

const APPLY = process.argv.includes('--apply');
const COLLECTION_FILTER = (() => {
  const i = process.argv.indexOf('--collection');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const DB_OVERRIDE = (() => {
  const i = process.argv.indexOf('--db');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const artifactPath = process.argv.slice(2).find((a) => !a.startsWith('--')
  && a !== COLLECTION_FILTER && a !== DB_OVERRIDE);

const redact = (s) => String(s).replace(/\/\/[^@/]+@/, '//<credentials>@');

/** URI with its database path replaced by dbName (for mongodump --uri). */
function uriWithDb(uri, dbName) {
  const u = new URL(uri);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function main() {
  if (!artifactPath) throw new Error('Usage: migrate-canonical-disciplines.js <artifact.json> [--apply]');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  let rows = artifact.rows || [];
  if (COLLECTION_FILTER) {
    if (!FIELD_BY_COLLECTION[COLLECTION_FILTER]) throw new Error(`Unknown collection ${COLLECTION_FILTER}`);
    rows = rows.filter((r) => r.collection === COLLECTION_FILTER);
  }
  if (!rows.length) throw new Error('Artifact has no rows for the selected collection(s).');

  // Review contract: every row adjudicated. No partial applies — a row nobody
  // looked at must block the run, loudly.
  const unapproved = rows.filter((r) => r.approved !== true);
  if (unapproved.length) {
    console.error(`REFUSING to run: ${unapproved.length} row(s) not adjudicated (approved !== true):`);
    for (const r of unapproved) {
      console.error(`  ${r.collection}/${r._id} "${r.name}" current=${JSON.stringify(r.current)} proposed=${JSON.stringify(r.proposed)} (${r.confidence}: ${r.reason})`);
    }
    process.exit(1);
  }

  const bad = rows.filter((r) => !FIELD_BY_COLLECTION[r.collection]
    || !Array.isArray(r.proposed) || r.proposed.length === 0
    || r.proposed.some((d) => !DISCIPLINE_SET.has(d)));
  if (bad.length) {
    console.error(`REFUSING to run: ${bad.length} row(s) with an empty/off-vocabulary proposal or unknown collection:`);
    for (const r of bad) console.error(`  ${r.collection}/${r._id} proposed=${JSON.stringify(r.proposed)}`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  // Never fall back to a default DB silently.
  const uriDb = new URL(uri).pathname.replace(/^\//, '') || null;
  const dbName = DB_OVERRIDE || uriDb;
  if (!dbName) throw new Error('No database in MONGODB_URI path and no --db given — refusing to guess.');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'dry-run'} · DB: ${dbName} · artifact: ${path.basename(artifactPath)} · ${rows.length} rows`);

  const affected = [...new Set(rows.map((r) => r.collection))];
  const counts = async () => {
    const out = {};
    for (const c of affected) out[c] = await db.collection(c).countDocuments();
    return out;
  };
  const pre = await counts();
  console.table(pre);

  // Plan every write first; verify each doc still exists and report drift
  // between the artifact's `current` and what's in the DB now.
  let unchanged = 0; const ops = []; const missing = []; const drifted = [];
  for (const row of rows) {
    const field = FIELD_BY_COLLECTION[row.collection];
    const doc = await db.collection(row.collection).findOne(
      { _id: new ObjectId(row._id) }, { projection: { [field]: 1, name: 1 } }
    );
    if (!doc) { missing.push(row); continue; }
    const live = doc[field] == null ? [] : (Array.isArray(doc[field]) ? doc[field] : [doc[field]]);
    const proposed = [...new Set(row.proposed)];
    if (JSON.stringify(live) === JSON.stringify(proposed)) { unchanged++; continue; }
    if (JSON.stringify(live) !== JSON.stringify(row.current)) drifted.push({ row, live });
    ops.push({ row, field, live, proposed });
  }

  for (const { row, live, proposed } of ops) {
    console.log(`  ${row.collection}/${row._id} "${row.name}": ${JSON.stringify(live)} -> ${JSON.stringify(proposed)}`);
  }
  if (missing.length) console.log(`  ${missing.length} artifact row(s) reference docs that no longer exist (skipped)`);
  if (drifted.length) {
    console.log(`  WARNING: ${drifted.length} doc(s) changed since classification (live differs from artifact "current") — re-check before applying:`);
    for (const { row, live } of drifted) console.log(`    ${row.collection}/${row._id} live=${JSON.stringify(live)} artifact.current=${JSON.stringify(row.current)}`);
  }
  console.log(`\n${ops.length} write(s) planned, ${unchanged} already applied (no-op), ${missing.length} missing`);

  if (!APPLY) {
    console.log('Dry-run only. Re-run with --apply to write.');
    await client.close();
    return;
  }
  if (drifted.length) {
    console.error('REFUSING to apply while docs have drifted since classification — re-run Phase A or fix the artifact.');
    await client.close();
    process.exit(1);
  }

  // Preflight: write-once audit doc + dump (rollback path)
  await db.collection('_migration_audit').updateOne(
    { migration: 'canonical-disciplines', phase: 'preflight' },
    { $setOnInsert: { migration: 'canonical-disciplines', phase: 'preflight', at: new Date(), preCounts: pre, artifact: path.basename(artifactPath) } },
    { upsert: true }
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpDir = path.join(__dirname, '..', `migration-dump-${stamp}`);
  const dumpUri = uriWithDb(uri, dbName);
  const haveMongodump = spawnSync('mongodump', ['--version'], { stdio: 'pipe' }).status === 0;
  if (haveMongodump) {
    for (const c of affected) {
      const r = spawnSync('mongodump', [`--uri=${dumpUri}`, `--collection=${c}`, `--out=${dumpDir}`], { stdio: 'pipe' });
      if (r.status !== 0) {
        throw new Error(`mongodump failed for ${c} — aborting before any change: ${redact(r.stderr ? r.stderr.toString() : '(no stderr)')}`);
      }
    }
    console.log(`Dump written to ${dumpDir} (mongodump — rollback via mongorestore)`);
  } else {
    // Fallback when mongodump isn't installed: full-doc EJSON dump via the
    // driver. Rollback = replaceOne per doc from these files. Both
    // collections are small (hundreds of docs), so this is fine.
    const { EJSON } = require('bson');
    fs.mkdirSync(dumpDir, { recursive: true });
    for (const c of affected) {
      const docs = await db.collection(c).find({}).toArray();
      fs.writeFileSync(path.join(dumpDir, `${c}.ejson`), EJSON.stringify(docs, { relaxed: false }));
      console.log(`  dumped ${docs.length} ${c} docs`);
    }
    console.log(`Dump written to ${dumpDir} (driver EJSON fallback — mongodump not installed)`);
  }

  let applied = 0;
  for (const { row, field, proposed } of ops) {
    const res = await db.collection(row.collection).updateOne(
      { _id: new ObjectId(row._id) },
      { $set: { [field]: proposed, updatedAt: new Date() } }
    );
    if (res.modifiedCount) applied++;
  }
  console.log(`${applied} doc(s) updated`);

  // Postflight: counts unchanged + every stored value canonical
  const post = await counts();
  for (const c of affected) {
    if (post[c] !== pre[c]) throw new Error(`doc count changed for ${c}: ${pre[c]} -> ${post[c]}`);
  }
  const offVocab = {};
  for (const c of affected) {
    const values = await db.collection(c).distinct(FIELD_BY_COLLECTION[c]);
    const bad = values.filter((v) => v != null && !DISCIPLINE_SET.has(v));
    if (bad.length) offVocab[c] = bad;
  }
  if (Object.keys(offVocab).length) {
    console.error('POSTFLIGHT: off-vocabulary values remain (docs the artifact never covered?):', offVocab);
    console.error('Re-run Phase A against this DB to classify them.');
  } else {
    console.log('POSTFLIGHT OK: every stored discipline value is canonical.');
  }

  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim(); } catch { /* best effort */ }
  await db.collection('_migration_audit').insertOne({
    migration: 'canonical-disciplines', phase: 'complete', at: new Date(),
    postCounts: post, applied, artifact: path.basename(artifactPath), gitSha,
    offVocabRemaining: offVocab,
  });
  console.log('APPLY complete.');
  await client.close();
}

main().catch((err) => { console.error(redact(err.message)); process.exit(1); });
