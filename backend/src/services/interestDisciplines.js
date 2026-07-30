const {
  DISCIPLINE_SET,
  SPORT_SPECIFIC_DISCIPLINE_SET,
  normalizeDisciplines,
} = require('../config/disciplines');
const SportInterestResolution = require('../models/SportInterestResolution');

/**
 * Resolve a user's free-text sport preferences to canonical disciplines.
 *
 * Canonical labels (after legacy-synonym normalization) map to themselves;
 * custom labels ("triathlon") resolve through the ai-coach's shared
 * sportinterestresolutions cache. A label with no cache entry contributes
 * nothing — the caller's filter is built so that can only ever UNDER-hide,
 * never hide everything (mirrors interest_mix.py's stance that an unmappable
 * label is unmeasurable, not absent).
 *
 * @param {string[]} sportPreferences - raw profile.sportPreferences values
 * @returns {Promise<Set<string>>} canonical disciplines the user trains
 */
async function resolveInterestDisciplines(sportPreferences) {
  const disciplines = new Set();
  const customLabels = [];

  for (const raw of Array.isArray(sportPreferences) ? sportPreferences : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const [normalized] = normalizeDisciplines([raw]);
    if (normalized && DISCIPLINE_SET.has(normalized)) {
      disciplines.add(normalized);
    } else {
      customLabels.push(raw.trim().toLowerCase());
    }
  }

  if (customLabels.length > 0) {
    const resolutions = await SportInterestResolution
      .find({ label: { $in: customLabels } })
      .lean();
    for (const resolution of resolutions) {
      for (const discipline of resolution.disciplines || []) {
        if (DISCIPLINE_SET.has(discipline)) disciplines.add(discipline);
      }
    }
  }

  return disciplines;
}

/**
 * Should this common template be hidden from a user with these disciplines?
 *
 * Hidden only when ALL of the template's disciplines are sport-specific
 * (running/cycling/climbing/swimming), none of them is among the user's, and
 * the user hasn't opted in by favoriting/modifying it. Generic commons
 * (strength, cardio, mobility, ...) and mixed templates are always visible,
 * so the filter fails open for users with no or unresolvable interests.
 *
 * @param {Object} template - lean template, possibly with the per-user
 *   userMetadata/isModified overlay from SessionService
 * @param {Set<string>} userDisciplines
 * @returns {boolean}
 */
function isHiddenSportTemplate(template, userDisciplines) {
  if (!template?.isCommon) return false;
  const disciplines = template.primary_disciplines || [];
  if (disciplines.length === 0) return false;
  if (!disciplines.every((d) => SPORT_SPECIFIC_DISCIPLINE_SET.has(d))) return false;
  if (disciplines.some((d) => userDisciplines.has(d))) return false;
  // A modification row (favorite, completions, renames) means the user opted
  // into this template — hiding it would look like data loss.
  if (template.userMetadata || template.isModified) return false;
  return true;
}

module.exports = { resolveInterestDisciplines, isHiddenSportTemplate };
