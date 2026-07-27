/**
 * Canonical discipline vocabulary — backend mirror.
 *
 * The canonical source is ai-coach-service/app/core/disciplines.py; keep the
 * two lists identical (same values, same order). A "discipline" is the SPORT
 * a session belongs to. ADDITIVE ONLY: values are persisted on user profiles,
 * exercises, session templates and session logs, so removing or renaming a
 * value orphans real user data.
 */

const DISCIPLINES = [
  'strength',
  'cardio',
  'hiit',
  'hybrid',
  'recovery',
  'mobility',
  'flexibility',
  'calisthenics',
  'running',
  'cycling',
  'climbing',
  'swimming',
  'walking',
  'yoga',
  'meditation',
];

const DISCIPLINE_SET = new Set(DISCIPLINES);

/**
 * Known legacy synonyms → canonical values. This is the single pinned list;
 * the discipline-classification script's deterministic pass uses the same
 * semantics. Legacy values that need per-document judgment (warm_up, core,
 * corrective, balance, stability, General Fitness) are deliberately absent —
 * they were resolved one-by-one by the classification migration and are
 * rejected on new writes.
 */
const LEGACY_DISCIPLINE_MAP = {
  endurance: 'cardio',
  conditioning: 'cardio',
  powerlifting: 'strength',
  power: 'strength',
  'strength training': 'strength',
};

/**
 * Lowercase, map known legacy synonyms, dedupe. Values that are neither
 * canonical nor mapped are kept as-is (lowercased) so callers can detect and
 * reject them.
 */
const normalizeDisciplines = (values) => {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const lower = value.trim().toLowerCase();
    if (!lower) continue;
    const canonical = LEGACY_DISCIPLINE_MAP[lower] || lower;
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
};

module.exports = {
  DISCIPLINES,
  DISCIPLINE_SET,
  LEGACY_DISCIPLINE_MAP,
  normalizeDisciplines,
};
