const { z } = require('zod');
const exerciseController = require('../../controllers/exerciseController');
const { runTool } = require('../invoke');
const { withScope } = require('./util');

// Trim exercise docs to the fields Claude needs to reference/build workouts,
// keeping tool output token-efficient.
function trimExercise(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  const { _id, name, muscles, secondaryMuscles, discipline, equipment, difficulty, instructions } = ex;
  return { _id, name, muscles, secondaryMuscles, discipline, equipment, difficulty, instructions };
}

/**
 * Register read-only exercise tools. `ctx` = { user, scopes }.
 */
function register(server, ctx) {
  const { user, scopes } = ctx;
  const READ = 'exercises:read';

  server.registerTool('search_exercises', {
    title: 'Search exercises',
    description: 'Search the exercise library by name, muscle group, discipline, equipment or difficulty. Returns exerciseIds usable in create_workout.',
    inputSchema: {
      search: z.string().optional().describe('Free-text match on exercise name'),
      muscle: z.string().optional().describe('Comma-separated muscle groups, e.g. "chest,triceps"'),
      discipline: z.string().optional().describe('Comma-separated disciplines'),
      equipment: z.string().optional().describe('Comma-separated equipment, or "none" for bodyweight'),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(25).optional()
    }
  }, withScope(scopes, READ, (args) =>
    runTool(
      exerciseController.getExercises,
      { user, query: { limit: 25, ...args } },
      { transform: (data) => (data && Array.isArray(data.exercises)
        ? { ...data, exercises: data.exercises.map(trimExercise) }
        : data) }
    )
  ));

  server.registerTool('get_exercise', {
    title: 'Get exercise',
    description: 'Get a single exercise by id, including instructions and target muscles.',
    inputSchema: { id: z.string().length(24) }
  }, withScope(scopes, READ, (args) =>
    runTool(exerciseController.getExercise, { user, params: { id: args.id } }, { transform: trimExercise })
  ));
}

module.exports = { register };
