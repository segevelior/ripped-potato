import { useState } from "react";
import { ArrowRight, Repeat, Loader2, Plus } from "lucide-react";
import { useExerciseSwap } from "@/contexts/ExerciseSwapContext";

// Same null-safe decode idiom as CalendarPreviewCard: a malformed payload
// renders nothing rather than crashing the chat.
function decodePayload(payload) {
  try {
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/**
 * Tappable swap proposal card emitted by the propose_exercise_swap skill as
 * <exercise-swap payload="b64"></exercise-swap>.
 *
 * Inside a live workout (ExerciseSwapContext present) it offers Apply /
 * Apply + update workout; anywhere else it renders read-only. Uses divs +
 * not-prose only — react-markdown nests the tag inside a <p>.
 */
export default function ExerciseSwapCard({ payload }) {
  const swap = useExerciseSwap();
  const [applying, setApplying] = useState(null); // null | 'session' | 'permanent' | 'done'
  const [applyError, setApplyError] = useState(null);
  const card = decodePayload(payload);
  if (!card || !card.new?.name) return null;

  const { old = {}, reason, note } = card;
  const next = card.new;

  const apply = async (permanent) => {
    if (!swap || applying) return;
    setApplying(permanent ? "permanent" : "session");
    setApplyError(null);
    try {
      await swap.applySwap(card, { permanent });
      setApplying("done");
    } catch {
      setApplying(null);
      setApplyError("Couldn't apply the swap — try the Browse tab.");
    }
  };

  // Both scopes are always offered when the session is template-linked; the
  // skill's offerPermanent flag is advisory only (the user asked for the
  // permanent option to be available regardless).
  const offerPermanent = Boolean(old.id && swap?.canPersist);

  return (
    <span className="not-prose block my-2 max-w-sm">
      <span className="block bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <span className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <Repeat className="w-3.5 h-3.5 text-primary-500" /> Swap proposal
        </span>
        <span className="flex items-center gap-2 px-4 py-3">
          <span className="text-sm text-gray-500 line-through truncate">{old.name}</span>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-900 truncate">{next.name}</span>
          {next.isNew && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium shrink-0">
              <Plus className="w-3 h-3" /> New
            </span>
          )}
        </span>
        {(next.muscles?.length > 0 || reason) && (
          <span className="block px-4 pb-2 text-xs text-gray-500">
            {next.muscles?.length > 0 && <span>{next.muscles.join(", ")}</span>}
            {next.muscles?.length > 0 && reason && <span> · </span>}
            {reason && <span>{reason}</span>}
          </span>
        )}
        {note && <span className="block px-4 pb-2 text-xs text-gray-400">{note}</span>}
        {applyError && <span className="block px-4 pb-2 text-xs text-red-600">{applyError}</span>}

        {swap ? (
          applying === "done" ? (
            <span className="block px-4 py-2.5 bg-emerald-50 text-emerald-700 text-sm font-medium text-center">
              Swapped in ✓
            </span>
          ) : (
            <span className="flex gap-2 px-3 pb-3 pt-1">
              <button
                onClick={() => apply(false)}
                disabled={Boolean(applying)}
                className="flex-1 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {applying === "session" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Apply
              </button>
              {offerPermanent && (
                <button
                  onClick={() => apply(true)}
                  disabled={Boolean(applying)}
                  className="flex-1 py-2 bg-white border border-gray-300 text-gray-800 rounded-xl text-sm font-semibold hover:border-gray-400 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {applying === "permanent" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Apply + update workout
                </button>
              )}
            </span>
          )
        ) : (
          <span className="block px-4 py-2 bg-gray-50 text-xs text-gray-400 text-center">
            Open your active workout to apply this swap.
          </span>
        )}
      </span>
    </span>
  );
}
