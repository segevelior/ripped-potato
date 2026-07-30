/**
 * Session-block structure vocabulary — frontend mirror.
 *
 * Canonical source is BLOCK_TYPES in backend/src/models/SessionTemplate.js;
 * keep the values identical. A block with no `type` (all pre-typed-blocks
 * data) is treated as 'straight_sets' everywhere.
 */

export const BLOCK_TYPES = [
  'straight_sets',
  'circuit',
  'tabata',
  'amrap',
  'emom',
  'interval',
  'duration',
];

// Which structural fields are meaningful per type. Used by the live-session
// header and the template editors so they can't drift.
export const BLOCK_TYPE_META = {
  straight_sets: { label: 'Sets × reps', chip: null, fields: [] },
  circuit: { label: 'Circuit', chip: 'CIRCUIT', fields: ['rounds', 'rest_seconds'] },
  tabata: { label: 'Tabata', chip: 'TABATA', fields: ['rounds', 'work_seconds', 'rest_seconds'] },
  amrap: { label: 'AMRAP', chip: 'AMRAP', fields: ['duration_seconds'] },
  emom: { label: 'EMOM', chip: 'EMOM', fields: ['rounds', 'work_seconds'] },
  interval: { label: 'Intervals', chip: 'INTERVALS', fields: ['rounds', 'work_seconds', 'rest_seconds'] },
  duration: { label: 'Continuous', chip: 'CONTINUOUS', fields: ['duration_seconds'] },
};

// Types where one completed set per exercise means one finished round, so the
// live session shows a round counter and +/- round controls.
export const MULTI_ROUND_BLOCK_TYPES = new Set(['circuit', 'tabata', 'emom', 'interval']);

// Seconds → compact human label: 90 → "1:30", 600 → "10:00", 45 → "45s".
export const formatBlockSeconds = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

/**
 * One-line structural summary of a block, e.g. "8 × 20s on / 10s off",
 * "3 rounds · 1:00 rest", "Cap 20:00", "10:00 continuous".
 * Returns null for straight_sets / typeless blocks.
 */
export function formatBlockSummary(block) {
  if (!block) return null;
  const rounds = Math.max(1, block.rounds || 1);
  const work = formatBlockSeconds(block.work_seconds);
  const rest = formatBlockSeconds(block.rest_seconds);
  const duration = formatBlockSeconds(block.duration_seconds);

  switch (block.type) {
    case 'tabata':
      return `${rounds} × ${work || '20s'} on / ${rest || '10s'} off`;
    case 'circuit':
      return `${rounds} rounds${rest ? ` · ${rest} rest` : ''}`;
    case 'emom':
      return `Every minute for ${rounds} min${work ? ` · ${work} work` : ''}`;
    case 'interval':
      return `${rounds} × ${work || 'interval'}${rest ? ` / ${rest} rest` : ''}`;
    case 'amrap':
      return duration ? `As many rounds as possible in ${duration}` : 'As many rounds as possible';
    case 'duration':
      return duration ? `${duration} continuous` : 'Continuous effort';
    default:
      return null;
  }
}
