#!/usr/bin/env node
/**
 * One-off dev script: build src/config/espnLeagues.json from ESPN's public
 * league listings (unofficial API). Not part of runtime — the committed JSON
 * is the source of truth; re-run by hand and review the diff if ESPN's
 * catalog drifts.
 *
 * For every sport ESPN lists, enumerates its leagues, then keeps only
 * leagues whose news feed actually responds with a well-formed articles
 * array (the whole point of the whitelist is "feeds you can follow").
 *
 * Also appends the curated ONEFEED_LEAGUES below — sports ESPN covers only
 * through the oneFeed content API behind hub pages (espn.com/motogp/ etc.),
 * not as site/v2 leagues. Each is validated live (resultsCount > 0) before
 * inclusion. Extend that list by probing:
 *   curl 'https://onefeed.fan.api.espn.com/apis/v3/cached/contentEngine/oneFeed/leagues/<key>?limit=5'
 *
 * Usage: node scripts/bootstrap-espn-leagues.js [--out src/config/espnLeagues.json]
 */

const fs = require('fs');
const path = require('path');

const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports';
const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ONEFEED_BASE = 'https://onefeed.fan.api.espn.com/apis/v3/cached/contentEngine/oneFeed/leagues';
const DELAY_MS = 120;

// Curated oneFeed leagues (see header). Probed 2026-07-16 across ~90 sport
// keys; these were the ones with a real corpus. Freshness varies: cricket /
// olympics / boxing / wwe / poker publish weekly, motogp / x-games / nhra /
// tgl are seasonal or big-stories-only.
const ONEFEED_LEAGUES = [
  { slug: 'onefeed:boxing', sport: 'boxing', name: 'Boxing', aliases: [] },
  { slug: 'onefeed:cricket', sport: 'cricket', name: 'Cricket', aliases: [] },
  { slug: 'onefeed:horse-racing', sport: 'horse-racing', name: 'Horse Racing', aliases: [] },
  { slug: 'onefeed:motogp', sport: 'racing', name: 'MotoGP', aliases: ['Moto GP', 'MotoGP World Championship'] },
  { slug: 'onefeed:nhra', sport: 'racing', name: 'NHRA', aliases: ['Drag Racing'] },
  { slug: 'onefeed:olympics', sport: 'olympics', name: 'Olympics', aliases: ['Olympic Games'] },
  { slug: 'onefeed:poker', sport: 'poker', name: 'Poker', aliases: [] },
  { slug: 'onefeed:tgl', sport: 'golf', name: 'TGL', aliases: ['TGL Golf'] },
  { slug: 'onefeed:wwe', sport: 'wrestling', name: 'WWE', aliases: ['Pro Wrestling', 'Wrestling'] },
  { slug: 'onefeed:x-games', sport: 'action-sports', name: 'X Games', aliases: ['Action Sports', 'Skateboarding', 'BMX'] }
];

async function oneFeedIsAlive(key) {
  try {
    const res = await fetch(`${ONEFEED_BASE}/${key}?limit=5`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.resultsCount || 0) > 0;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function listRefs(url) {
  const refs = [];
  let page = 1;
  for (;;) {
    const data = await getJson(`${url}?limit=100&page=${page}`);
    refs.push(...(data.items || []).map((i) => i.$ref));
    if (page >= (data.pageCount || 1)) break;
    page++;
  }
  return refs;
}

function slugFromRef(ref) {
  return new URL(ref).pathname.split('/').filter(Boolean).pop();
}

async function feedIsAlive(sport, leagueSlug) {
  try {
    const res = await fetch(`${SITE_BASE}/${sport}/${leagueSlug}/news?limit=1`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.articles);
  } catch {
    return false;
  }
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outPath = path.resolve(
    __dirname,
    '..',
    outIdx > -1 ? process.argv[outIdx + 1] : 'src/config/espnLeagues.json'
  );

  const sportRefs = await listRefs(CORE_BASE);
  const sports = sportRefs.map(slugFromRef);
  console.log(`Sports: ${sports.join(', ')}`);

  const leagues = [];
  let dropped = 0;

  for (const sport of sports) {
    let leagueRefs;
    try {
      leagueRefs = await listRefs(`${CORE_BASE}/${sport}/leagues`);
    } catch (e) {
      console.warn(`  ${sport}: league listing failed (${e.message}), skipping sport`);
      continue;
    }
    console.log(`${sport}: ${leagueRefs.length} leagues listed`);

    for (const ref of leagueRefs) {
      await sleep(DELAY_MS);
      let detail;
      try {
        detail = await getJson(ref);
      } catch (e) {
        console.warn(`  ${slugFromRef(ref)}: detail failed (${e.message})`);
        dropped++;
        continue;
      }
      const leagueSlug = detail.slug || slugFromRef(ref);
      if (!(await feedIsAlive(sport, leagueSlug))) {
        dropped++;
        continue;
      }
      const name = detail.displayName || detail.name;
      const aliases = [...new Set([detail.name, detail.abbreviation, detail.shortName])]
        .filter((a) => a && a !== name);
      leagues.push({ slug: `${sport}/${leagueSlug}`, sport, name, aliases });
      console.log(`  + ${sport}/${leagueSlug} — ${name}`);
    }
  }

  console.log('\nValidating curated oneFeed leagues:');
  for (const entry of ONEFEED_LEAGUES) {
    await sleep(DELAY_MS);
    const key = entry.slug.replace(/^onefeed:/, '');
    if (await oneFeedIsAlive(key)) {
      leagues.push(entry);
      console.log(`  + ${entry.slug} — ${entry.name}`);
    } else {
      dropped++;
      console.warn(`  - ${entry.slug}: empty/unreachable, dropped`);
    }
  }

  leagues.sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(outPath, JSON.stringify(leagues, null, 2) + '\n');
  console.log(`\nWrote ${leagues.length} leagues to ${outPath} (${dropped} dropped: dead feed or detail error)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
