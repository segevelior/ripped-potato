#!/usr/bin/env node

/**
 * One-off migration for sports-news v2: convert legacy
 * settings.sportsNews.sports (fixed sport slugs, e.g. 'soccer') into
 * settings.sportsNews.follows ({ label, feeds } with bare ESPN league slugs),
 * and seed the sportresolutions cache with the legacy slugs so typing
 * "soccer" later never invokes the LLM.
 *
 * One follows entry per legacy feed, labeled from the espnLeagues.json
 * whitelist ('racing/f1' → "Formula 1") so migrated users' chips/badges match
 * what new users get from the resolver. Legacy slugs with no feeds (cycling,
 * running) are dropped and reported — they never produced articles.
 *
 * Idempotent: users who already have follows entries are skipped; the legacy
 * `sports` array is left in place (removed in the cleanup PR).
 *
 * Usage:
 *   node scripts/migrate-sports-news-follows.js             # dry run (default)
 *   node scripts/migrate-sports-news-follows.js --apply     # write
 *   node scripts/migrate-sports-news-follows.js --user <id> # limit to one user
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const SportResolution = require('../src/models/SportResolution');
const { SPORT_FEEDS, legacySlugFeeds, getLeagueBySlug } = require('../src/config/sportsNews');

const APPLY = process.argv.includes('--apply');
const userFlagIdx = process.argv.indexOf('--user');
const USER_ID = userFlagIdx > -1 ? process.argv[userFlagIdx + 1] : null;

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Legacy sport slug → cache-seed label: the whitelist league name when the
// sport maps to a single feed ('mma' → "UFC"), the capitalized sport when it
// maps to several ('soccer' → "Soccer").
function seedLabel(sport) {
  const feeds = legacySlugFeeds(sport);
  if (feeds.length === 1) {
    return getLeagueBySlug(feeds[0])?.name || capitalize(sport);
  }
  return capitalize(sport);
}

function followsForSports(sports, dropped) {
  const entries = [];
  const seenSlugs = new Set();
  for (const sport of sports) {
    const feeds = legacySlugFeeds(sport);
    if (feeds.length === 0) {
      dropped.push(sport);
      continue;
    }
    for (const slug of feeds) {
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      entries.push({ label: getLeagueBySlug(slug)?.name || capitalize(sport), feeds: [slug] });
    }
  }
  return entries;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${USER_ID ? ` user=${USER_ID}` : ''}`);

  const query = { 'settings.sportsNews.sports.0': { $exists: true } };
  if (USER_ID) query._id = new mongoose.Types.ObjectId(USER_ID);

  const users = await User.find(query, { email: 1, 'settings.sportsNews': 1 }).lean();
  console.log(`Examined: ${users.length} user(s) with legacy followed sports`);

  const stats = { migrated: 0, skippedHasFollows: 0, entriesCreated: 0 };
  const droppedBySport = {};

  for (const user of users) {
    const sportsNews = user.settings?.sportsNews || {};
    const label = `${user._id} <${user.email}>`;

    if ((sportsNews.follows || []).length > 0) {
      stats.skippedHasFollows++;
      console.log(`  SKIP already has follows: ${label}`);
      continue;
    }

    const dropped = [];
    const follows = followsForSports(sportsNews.sports || [], dropped);
    for (const sport of dropped) {
      droppedBySport[sport] = (droppedBySport[sport] || 0) + 1;
    }

    console.log(
      `  ${APPLY ? 'MIGRATE' : 'WOULD MIGRATE'}: ${label}\n` +
      `    ${JSON.stringify(sportsNews.sports)} → ${follows.map((f) => `"${f.label}" [${f.feeds}]`).join(', ') || '(nothing)'}` +
      (dropped.length ? `\n    dropped (no feed): ${dropped.join(', ')}` : '')
    );

    if (APPLY && follows.length > 0) {
      await User.updateOne(
        { _id: user._id, 'settings.sportsNews.follows.0': { $exists: false } },
        { $set: { 'settings.sportsNews.follows': follows } }
      );
    }
    stats.migrated++;
    stats.entriesCreated += follows.length;
  }

  // Seed the resolution cache with every feed-backed legacy slug, so the
  // old chip vocabulary resolves instantly and feeds GET /news/suggestions.
  console.log('\nSeeding sportresolutions with legacy sport slugs:');
  let seeded = 0;
  for (const sport of Object.keys(SPORT_FEEDS)) {
    const feeds = legacySlugFeeds(sport);
    if (feeds.length === 0) continue;
    const doc = {
      normalizedQuery: sport,
      originalQuery: sport,
      resolved: true,
      label: seedLabel(sport),
      feeds,
      source: 'seed',
      attempts: 0
    };
    console.log(`  ${APPLY ? 'SEED' : 'WOULD SEED'}: "${sport}" → "${doc.label}" [${feeds}]`);
    if (APPLY) {
      // $setOnInsert only: never clobber an entry the LLM already resolved.
      await SportResolution.updateOne(
        { normalizedQuery: sport },
        { $setOnInsert: doc },
        { upsert: true }
      );
    }
    seeded++;
  }

  console.log('\nSummary:');
  console.log(`  users migrated:        ${stats.migrated}`);
  console.log(`  follow entries:        ${stats.entriesCreated}`);
  console.log(`  skipped (has follows): ${stats.skippedHasFollows}`);
  console.log(`  seeds:                 ${seeded}`);
  const droppedReport = Object.entries(droppedBySport).map(([s, n]) => `${s}×${n}`).join(', ');
  console.log(`  dropped slugs:         ${droppedReport || '(none)'}`);
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
