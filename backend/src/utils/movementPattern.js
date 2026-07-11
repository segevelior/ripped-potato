/**
 * Movement-pattern inference for exercises.
 *
 * The Exercise model has no movementPattern field. We infer a coarse pattern
 * from the exercise name, falling back to its primary muscle. Pure functions —
 * no DB. Used to enrich the text we embed so similarity carries movement
 * semantics, not just words.
 *
 * Ported from ai-coach-service/app/core/agents/skills/knowledge/movement.py.
 *
 * Patterns are the standard primal categories used for substitution matching:
 * push / pull / squat / hinge / carry / core / cardio.
 */

// Name keywords -> movement pattern. Order matters: earlier patterns win.
const MOVEMENT_PATTERNS = {
  hinge: ['deadlift', 'romanian', 'rdl', 'hip thrust', 'good morning', 'kettlebell swing', 'swing', 'hip hinge'],
  squat: ['squat', 'lunge', 'leg press', 'step-up', 'step up', 'split squat', 'pistol'],
  pull: ['pull-up', 'pullup', 'chin-up', 'chinup', 'row', 'lat pulldown', 'pulldown', 'curl', 'face pull', 'muscle-up'],
  push: ['bench', 'push-up', 'pushup', 'press', 'dip', 'overhead', 'ohp', 'fly', 'pushdown', 'extension', 'handstand'],
  carry: ['carry', 'farmer', 'suitcase', 'waiter'],
  core: ['plank', 'crunch', 'sit-up', 'situp', 'hollow', 'leg raise', 'knee raise', 'ab wheel', 'rollout', 'russian twist'],
  cardio: ['run', 'jog', 'sprint', 'bike', 'cycl', 'rowing', 'erg', 'burpee', 'jump rope', 'skip', 'swim', 'elliptical']
};

// Primary muscle -> pattern fallback when the name isn't recognized.
const MUSCLE_TO_PATTERN = {
  chest: 'push', shoulders: 'push', triceps: 'push', delts: 'push',
  back: 'pull', lats: 'pull', biceps: 'pull', traps: 'pull', rhomboids: 'pull',
  quads: 'squat', quadriceps: 'squat', calves: 'squat',
  glutes: 'hinge', hamstrings: 'hinge', 'lower back': 'hinge',
  core: 'core', abs: 'core', obliques: 'core'
};

/**
 * Best-effort pattern from name, then primary muscle. null if unknown.
 * @param {{ name?: string, muscles?: string[] }} exercise
 * @returns {string|null}
 */
function inferMovementPattern(exercise) {
  const name = (exercise?.name || '').toLowerCase();
  for (const [pattern, keywords] of Object.entries(MOVEMENT_PATTERNS)) {
    if (keywords.some((kw) => name.includes(kw))) return pattern;
  }
  for (const muscle of exercise?.muscles || []) {
    const pattern = MUSCLE_TO_PATTERN[(muscle || '').toLowerCase()];
    if (pattern) return pattern;
  }
  return null;
}

module.exports = { inferMovementPattern, MOVEMENT_PATTERNS, MUSCLE_TO_PATTERN };
