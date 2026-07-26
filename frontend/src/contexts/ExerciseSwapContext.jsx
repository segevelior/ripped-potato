import { createContext, useContext } from "react";

/**
 * Bridge between coach-chat <exercise-swap> cards and a live workout session.
 *
 * LiveWorkout provides { applySwap(payload, { permanent }), canPersist } around
 * the replace-modal subtree. Anywhere else (main chat page, workout over) the
 * context is null and the card renders read-only by construction.
 */
export const ExerciseSwapContext = createContext(null);

export function useExerciseSwap() {
  return useContext(ExerciseSwapContext);
}
