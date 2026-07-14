// Volume strings ("3x10", "4 x 8-12") are the template-side rep scheme.
// Calendar events no longer embed exercises, so every consumer that needs
// sets/reps derives them from the linked PredefinedWorkout via these helpers.

const VOLUME_RE = /^\s*(\d+)\s*[xX]\s*(\d+)/;

const parseVolume = (volume) => {
  const match = typeof volume === 'string' ? volume.match(VOLUME_RE) : null;
  if (!match) return { sets: 3, reps: 10 };
  return { sets: parseInt(match[1], 10), reps: parseInt(match[2], 10) };
};

// Flatten template.blocks[].exercises[] into the shape calendar consumers
// (WorkoutLog creation, API responses) expect. Entries without an
// exercise_id keep their name — the id is optional downstream.
const flattenTemplateExercises = (template) => {
  if (!template?.blocks?.length) return [];
  return template.blocks.flatMap((block) =>
    (block.exercises || []).map((ex) => {
      const { sets, reps } = parseVolume(ex.volume);
      return {
        ...(ex.exercise_id ? { exerciseId: ex.exercise_id } : {}),
        exerciseName: ex.exercise_name,
        targetSets: sets,
        targetReps: reps,
        notes: ex.notes || ''
      };
    })
  );
};

module.exports = { parseVolume, flattenTemplateExercises };
