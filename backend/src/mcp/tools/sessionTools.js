const { z } = require('zod');
const sessionLogController = require('../../controllers/sessionLogController');
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
 * Register session tools over the user's session log (performed sessions).
 * `ctx` = { user, scopes }.
 */
function register(server, ctx) {
  const { user, scopes } = ctx;
  const READ = 'sessions:read';
  const WRITE = 'sessions:write';

  server.registerTool('list_sessions', {
    title: 'List sessions',
    description: "List the user's logged training sessions, most recent first. Optionally filter by look-back window or discipline.",
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('Look-back window in days, default 30'),
      discipline: z.string().optional().describe('Session discipline, e.g. strength, cardio, hiit'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results, default 20')
    }
  }, withScope(scopes, READ, (args) =>
    runTool(sessionLogController.getSessionLogs, { user, query: args })
  ));

  server.registerTool('get_session', {
    title: 'Get session',
    description: 'Get a single logged session by its id, including exercises and sets.',
    inputSchema: { id: z.string().length(24).describe('Session log id') }
  }, withScope(scopes, READ, (args) =>
    runTool(sessionLogController.getSessionLog, { user, params: { id: args.id } })
  ));

  server.registerTool('get_session_stats', {
    title: 'Get session stats',
    description: 'Aggregate statistics over logged sessions (totals, duration, strain) for the last N days.',
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe('Look-back window, default 30') }
  }, withScope(scopes, READ, (args) =>
    runTool(sessionLogController.getSessionLogStats, { user, query: args })
  ));

  server.registerTool('create_session', {
    title: 'Log session',
    description: 'Log a performed training session for the user (it appears in their history and on their calendar). Use search_exercises to find exerciseIds; exerciseName is required per exercise.',
    inputSchema: {
      title: z.string().min(1).max(100),
      discipline: z.string().describe('Session discipline, e.g. strength, cardio, hiit, climbing'),
      startedAt: z.string().describe('ISO datetime the session started'),
      completedAt: z.string().optional().describe('ISO datetime the session ended (defaults to now)'),
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
    return runTool(sessionLogController.createSessionLog, { user, body }, { validators: sessionLogController.validateSessionLog });
  }));

  server.registerTool('update_session', {
    title: 'Update session',
    description: 'Update a logged session by id. Provide only the fields to change.',
    inputSchema: {
      id: z.string().length(24),
      title: z.string().min(1).max(100).optional(),
      discipline: z.string().optional(),
      startedAt: z.string().optional().describe('ISO datetime'),
      completedAt: z.string().optional().describe('ISO datetime'),
      durationMinutes: z.number().optional(),
      notes: z.string().optional(),
      exercises: z.array(exerciseSchema).optional()
    }
  }, withScope(scopes, WRITE, (args) => {
    // Partial findOneAndUpdate with mongoose runValidators; the create-time
    // validator chain would wrongly require title/discipline/startedAt here.
    const { id, durationMinutes, ...rest } = args;
    const body = { ...rest };
    if (durationMinutes !== undefined) body.actualDuration = durationMinutes;
    return runTool(sessionLogController.updateSessionLog, { user, params: { id }, body });
  }));

  server.registerTool('delete_session', {
    title: 'Delete session',
    description: 'Delete a logged session by id (also removes its calendar entry).',
    inputSchema: { id: z.string().length(24) }
  }, withScope(scopes, WRITE, (args) =>
    runTool(sessionLogController.deleteSessionLog, { user, params: { id: args.id } })
  ));
}

module.exports = { register };
