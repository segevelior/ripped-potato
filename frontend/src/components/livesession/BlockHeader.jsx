import { Plus, Minus, Check } from "lucide-react";
import { BLOCK_TYPE_META, MULTI_ROUND_BLOCK_TYPES, formatBlockSummary } from "@/constants/blocks";

/**
 * Header card above a live-session block's exercise cards: block name, type
 * chip, structural summary, round progress and +/- round controls.
 *
 * The current round is DERIVED from set completion (min completed sets across
 * the block's exercises), so it survives reloads and stays consistent with
 * per-set logging. AMRAP blocks have no set-derived rounds — they count
 * `rounds_completed` via the +/- controls instead.
 */
export default function BlockHeader({ block, items, onCompleteRound, onAdjustRounds }) {
  if (!block) return null;
  const meta = BLOCK_TYPE_META[block.type] || BLOCK_TYPE_META.straight_sets;
  const summary = formatBlockSummary(block);
  const isMultiRound = MULTI_ROUND_BLOCK_TYPES.has(block.type);
  const isAmrap = block.type === 'amrap';

  const completedRounds = isMultiRound && items.length > 0
    ? Math.min(...items.map(({ exercise }) => exercise.sets.filter(s => s.is_completed).length))
    : 0;
  const totalRounds = Math.max(1, block.rounds || 1);
  const blockDone = isMultiRound && completedRounds >= totalRounds;
  const currentRound = Math.min(completedRounds + 1, totalRounds);

  return (
    <div className="bg-gray-900 text-white rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base truncate">{block.name}</h2>
            {meta.chip && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold tracking-wider">
                {meta.chip}
              </span>
            )}
          </div>
          {summary && <p className="text-xs text-white/60 mt-0.5">{summary}</p>}
        </div>

        {(isMultiRound || isAmrap) && (
          <div className="shrink-0 flex items-center gap-1.5">
            <button
              onClick={() => onAdjustRounds(-1)}
              aria-label="One round less"
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center active:bg-white/25"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums min-w-[64px] text-center">
              {isAmrap
                ? `${block.rounds_completed || 0} rounds`
                : blockDone
                  ? `${totalRounds}/${totalRounds} ✓`
                  : `Round ${currentRound}/${totalRounds}`}
            </span>
            <button
              onClick={() => onAdjustRounds(1)}
              aria-label="One round more"
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center active:bg-white/25"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {block.instructions && (
        <p className="text-xs text-white/70 mt-2">{block.instructions}</p>
      )}

      {isMultiRound && !blockDone && (
        <button
          onClick={onCompleteRound}
          className="mt-2.5 w-full py-2 rounded-xl bg-white/10 active:bg-white/25 text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" /> Complete round {currentRound}
        </button>
      )}
    </div>
  );
}
