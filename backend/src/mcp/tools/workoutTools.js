const { z } = require('zod');
const workoutLogController = require('../../controllers/workoutLogController');
const { runTool } = require('../invoke');
const { withScope } = require('./util');

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
  sets: z.array(setSchema).optional(),
  notes: z.string().optional()
});

/**
 * Register workout tools over the user's workout log (performed sessions).
 * `ctx` = { user, scopes }.
 */
function register(server, ctx) {
  const { user, scopes } = ctx;
  const READ = 'workouts:read';
  const WRITE = 'workouts:write';

  server.registerTool('list_workouts', {
    title: 'List workouts',
    description: "List the user's logged workouts (performed sessions), most recent first. Optionally filter by look-back window or type.",
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('Look-back window in days, default 30'),
      type: z.string().optional().describe('Workout type, e.g. strength, cardio, hiit'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results, default 20')
    }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutLogController.getWorkoutLogs, { user, query: args })
  ));

  server.registerTool('get_workout', {
    title: 'Get workout',
    description: 'Get a single logged workout by its id, including exercises and sets.',
    inputSchema: { id: z.string().length(24).describe('Workout log id') }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutLogController.getWorkoutLog, { user, params: { id: args.id } })
  ));

  server.registerTool('get_workout_stats', {
    title: 'Get workout stats',
    description: 'Aggregate statistics over logged workouts (totals, duration, strain) for the last N days.',
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe('Look-back window, default 30') }
  }, withScope(scopes, READ, (args) =>
    runTool(workoutLogController.getWorkoutLogStats, { user, query: args })
  ));

  server.registerTool('create_workout', {
    title: 'Log workout',
    description: 'Log a performed workout for the user (it appears in their history and on their calendar). Use search_exercises to find exerciseIds; exerciseName is required per exercise.',
    inputSchema: {
      title: z.string().min(1).max(100),
      type: z.string().describe('Workout type, e.g. strength, cardio, hiit, climbing'),
      startedAt: z.string().describe('ISO datetime the workout started'),
      completedAt: z.string().optional().describe('ISO datetime the workout ended (defaults to startedAt + durationMinutes, or startedAt — never "now", so historical logs stay honest)'),
      durationMinutes: z.number().optional().describe('Actual duration in minutes (derived from start/end when omitted)'),
      notes: z.string().optional(),
      exercises: z.array(exerciseSchema).optional()
    }
  }, withScope(scopes, WRITE, (args) => {
    const { durationMinutes, exercises, ...rest } = args;
    const body = {
      ...rest,
      actualDuration: durationMinutes,
      exercises: exercises || []
    };
    return runTool(workoutLogController.createWorkoutLog, { user, body }, { validators: workoutLogController.validateWorkoutLog });
  }));

  server.registerTool('update_workout', {
    title: 'Update workout',
    description: 'Update a logged workout by id. Provide only the fields to change.',
    inputSchema: {
      id: z.string().length(24),
      title: z.string().min(1).max(100).optional(),
      type: z.string().optional(),
      startedAt: z.string().optional().describe('ISO datetime'),
      completedAt: z.string().optional().describe('ISO datetime'),
      durationMinutes: z.number().optional(),
      notes: z.string().optional(),
      exercises: z.array(exerciseSchema).optional()
    }
  }, withScope(scopes, WRITE, (args) => {
    // Partial findOneAndUpdate with mongoose runValidators; the create-time
    // validator chain would wrongly require title/type/startedAt here.
    const { id, durationMinutes, ...rest } = args;
    const body = { ...rest };
    if (durationMinutes !== undefined) body.actualDuration = durationMinutes;
    return runTool(workoutLogController.updateWorkoutLog, { user, params: { id }, body });
  }));

  server.registerTool('delete_workout', {
    title: 'Delete workout',
    description: 'Delete a logged workout by id (also removes its calendar entry).',
    inputSchema: { id: z.string().length(24) }
  }, withScope(scopes, WRITE, (args) =>
    runTool(workoutLogController.deleteWorkoutLog, { user, params: { id: args.id } })
  ));
}

module.exports = { register };
