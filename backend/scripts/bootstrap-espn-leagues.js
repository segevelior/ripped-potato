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
 * Usage: node scripts/bootstrap-espn-leagues.js [--out src/config/espnLeagues.json]
 */

const fs = require('fs');
const path = require('path');

const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports';
const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const DELAY_MS = 120;

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

  leagues.sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(outPath, JSON.stringify(leagues, null, 2) + '\n');
  console.log(`\nWrote ${leagues.length} leagues to ${outPath} (${dropped} dropped: dead feed or detail error)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
