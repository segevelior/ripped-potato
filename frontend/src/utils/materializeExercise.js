import { apiService } from "@/services/api";

/**
 * Turn an AI-proposed exercise (no catalog id yet) into a real catalog
 * exercise so it can be swapped into a session / template. Dedups by exact
 * name first to avoid polluting the catalog with near-copies.
 *
 * @param {{ name: string, muscles?: string[], secondaryMuscles?: string[], discipline?: string[], equipment?: string[], difficulty?: string, strain?: Object }} opt
 * @returns {Promise<Object>} the existing or newly created catalog exercise
 */
export async function materializeExercise(opt) {
  const matches = await apiService.exercises.list({ search: opt.name, limit: 5 });
  const existing = (Array.isArray(matches) ? matches : []).find(
    (e) => (e.name || "").toLowerCase() === (opt.name || "").toLowerCase()
  );
  if (existing) return existing;

  return apiService.exercises.create({
    name: opt.name,
    muscles: opt.muscles || [],
    secondaryMuscles: opt.secondaryMuscles || [],
    discipline: opt.discipline || ["strength"],
    equipment: opt.equipment || [],
    difficulty: opt.difficulty || "beginner",
    strain: opt.strain || undefined,
  });
}
