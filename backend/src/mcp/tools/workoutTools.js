const { z } = require('zod');
const workoutController = require('../../controllers/workoutController');
const { validateWorkout } = require('../../middleware/validation');
const { runTool } = require('../invoke');
const { withScope } = require('./util');

const WORKOUT_TYPES = ['strength', 'cardio', 'hybrid', 'recovery', 'hiit', 'flexibility', 'calisthenics', 'mobility'];
const STATUSES = ['planned', 'in_progress', 'completed', 'skipped'];

const setSchema = z.object({
  targetReps: z.number().optional(),
  actualReps: z.number().optional(),
  weight: z.number().optional().describe('kg'),
  time: z.number().optional().describe('seconds'),
  distance: z.number().optional().describe('meters'),
  rpe: z.number().int().min(1).max(10).optional(),
  restSeconds: z.number().optional(),
  notes: z.string().optional(),
  isCompleted: z.boolean().optional()
});

const exerciseSchema = z.object({
  exerciseId: z.string().length(24).optional().describe('MongoDB ObjectId of an exercise (from search_exercises)'),
  exerciseName: z.string().describe('Exercise name (required)'),
  order: z.number().int().optional(),
  sets: z.array(setSchema).optional(),
  notes: z.string().optional()
});

/**
 * Register workout tools. `ctx` = { user, scopes }.
 */
function register(server, ctx) {
  const { user, scopes } = ctx;
  const READ = 'workouts:read';
  const WRITE = 'workouts:write';

  server.registerTool('list_workouts', {
    title: 'List workouts',
    description: "List the user's workouts, most recent first. Optionally filter by date range, status, or type.",
    inputSchema: {
      startDate: z.string().optional().describe('ISO date, inclusive lower bound (e.g. 2026-07-01)'),
      endDate: z.string().optional().describe('ISO date, inclusive upper bound'),
      status: z.enum(STATUSES).optional(),
      type: z.enum(WORKOUT_TYPES).optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional()
    }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutController.getWorkouts, { user, query: args })
  ));

  server.registerTool('get_workout', {
    title: 'Get workout',
    description: 'Get a single workout by its id, including exercises and sets.',
    inputSchema: { id: z.string().length(24).describe('Workout id') }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutController.getWorkout, { user, params: { id: args.id } })
  ));

  server.registerTool('get_workout_stats', {
    title: 'Get workout stats',
    description: 'Aggregate workout statistics (totals, completion, average duration) over the last N days.',
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe('Look-back window, default 30') }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutController.getWorkoutStats, { user, query: args })
  ));

  server.registerTool('create_workout', {
    title: 'Create workout',
    description: 'Create a new workout for the user. Use search_exercises to find exerciseIds; exerciseName is required per exercise.',
    inputSchema: {
      title: z.string().min(2).max(100),
      date: z.string().describe('ISO date/datetime for the workout'),
      type: z.enum(WORKOUT_TYPES),
      status: z.enum(STATUSES).optional(),
      durationMinutes: z.number().optional(),
      notes: z.string().optional(),
      exercises: z.array(exerciseSchema).optional()
    }
  }, withScope(scopes, WRITE, (args) =>
    runTool(workoutController.createWorkout, { user, body: args }, { validators: validateWorkout })
  ));

  server.registerTool('update_workout', {
    title: 'Update workout',
    description: 'Update an existing workout by id. Provide only the fields to change (title/date/type/status are validated).',
    inputSchema: {
      id: z.string().length(24),
      title: z.string().min(2).max(100).optional(),
      date: z.string().optional(),
      type: z.enum(WORKOUT_TYPES).optional(),
      status: z.enum(STATUSES).optional(),
      durationMinutes: z.number().optional(),
      notes: z.string().optional(),
      exercises: z.array(exerciseSchema).optional()
    }
  }, withScope(scopes, WRITE, (args) => {
    // No express-validator chain here: the controller applies a partial
    // findByIdAndUpdate with mongoose runValidators, and validateWorkout would
    // wrongly require title/date/type on a partial update. Enum/range
    // constraints are enforced by the zod schema above and the Mongoose schema.
    const { id, ...body } = args;
    return runTool(workoutController.updateWorkout, { user, params: { id }, body });
  }));

  server.registerTool('delete_workout', {
    title: 'Delete workout',
    description: 'Delete a workout by id.',
    inputSchema: { id: z.string().length(24) }
  }, withScope(scopes, WRITE, (args) =>
    runTool(workoutController.deleteWorkout, { user, params: { id: args.id } })
  ));
}

module.exports = { register };
