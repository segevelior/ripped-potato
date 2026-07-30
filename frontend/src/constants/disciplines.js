/**
 * Canonical discipline vocabulary — frontend mirror.
 *
 * The canonical source is ai-coach-service/app/core/disciplines.py; keep the
 * lists identical (same values, same order). Not derived from designTokens'
 * discipline color map: that map COVERS the vocabulary, it doesn't define it.
 * ADDITIVE ONLY — see disciplines.py for why.
 */

export const DISCIPLINES = [
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

// Disciplines that imply a dedicated sport commitment (gear, venue, skill).
// Mirror of backend/src/config/disciplines.js SPORT_SPECIFIC_DISCIPLINES —
// the backend uses it to hide sport-specific common templates from users who
// don't list that sport in their interests. Walking is deliberately generic.
export const SPORT_SPECIFIC_DISCIPLINES = ['running', 'cycling', 'climbing', 'swimming'];

// Grouping for the Settings "Training Interests" picker — presentation only.
export const DISCIPLINE_GROUPS = [
  { label: 'Gym & strength', disciplines: ['strength', 'calisthenics', 'hiit', 'hybrid'] },
  { label: 'Endurance', disciplines: ['running', 'cycling', 'swimming', 'walking', 'cardio'] },
  { label: 'Climb & skill', disciplines: ['climbing'] },
  { label: 'Mind & mobility', disciplines: ['yoga', 'mobility', 'flexibility', 'meditation', 'recovery'] },
];
