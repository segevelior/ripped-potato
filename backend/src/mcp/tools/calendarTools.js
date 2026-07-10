const { z } = require('zod');
const calendarController = require('../../controllers/calendarController');
const { runTool } = require('../invoke');
const { withScope } = require('./util');

const EVENT_TYPES = ['workout', 'rest', 'deload', 'event', 'milestone'];
// Must match the CalendarEvent model enum (default 'scheduled') — NOT the
// workout statuses.
const EVENT_STATUSES = ['scheduled', 'in_progress', 'completed', 'skipped', 'cancelled'];

/**
 * Register calendar tools. `ctx` = { user, scopes }.
 */
function register(server, ctx) {
  const { user, scopes } = ctx;
  const READ = 'calendar:read';
  const WRITE = 'calendar:write';

  server.registerTool('list_calendar_events', {
    title: 'List calendar events',
    description: "List the user's training calendar events within a date range (both dates required).",
    inputSchema: {
      startDate: z.string().describe('ISO date, inclusive lower bound (required)'),
      endDate: z.string().describe('ISO date, inclusive upper bound (required)'),
      type: z.enum(EVENT_TYPES).optional(),
      status: z.enum(EVENT_STATUSES).optional()
    }
  }, withScope(scopes, READ, (args) =>
    runTool(calendarController.getEvents, { user, query: args })
  ));

  server.registerTool('create_calendar_event', {
    title: 'Create calendar event',
    description: 'Add an event to the training calendar (a workout, rest day, deload, etc.).',
    inputSchema: {
      date: z.string().describe('ISO date/datetime for the event'),
      title: z.string().min(1),
      type: z.enum(EVENT_TYPES),
      status: z.enum(EVENT_STATUSES).optional(),
      notes: z.string().optional(),
      workoutTemplateId: z.string().length(24).optional().describe('Optional predefined-workout template id to attach')
    }
  }, withScope(scopes, WRITE, (args) =>
    runTool(calendarController.createEvent, { user, body: args })
  ));

  server.registerTool('update_calendar_event', {
    title: 'Update or reschedule calendar event',
    description: 'Update a calendar event by id. If only the date changes, the event is rescheduled to that date.',
    inputSchema: {
      id: z.string().length(24),
      date: z.string().optional().describe('New ISO date to reschedule to'),
      title: z.string().optional(),
      type: z.enum(EVENT_TYPES).optional(),
      status: z.enum(EVENT_STATUSES).optional(),
      notes: z.string().optional()
    }
  }, withScope(scopes, WRITE, (args) => {
    const { id, ...changes } = args;
    const keys = Object.keys(changes);
    // Date-only change → use the dedicated reschedule (move) handler.
    if (keys.length === 1 && keys[0] === 'date') {
      return runTool(calendarController.moveEvent, { user, params: { id }, body: { newDate: changes.date } });
    }
    return runTool(calendarController.updateEvent, { user, params: { id }, body: changes });
  }));

  server.registerTool('delete_calendar_event', {
    title: 'Delete calendar event',
    description: 'Delete a calendar event by id.',
    inputSchema: { id: z.string().length(24) }
  }, withScope(scopes, WRITE, (args) =>
    runTool(calendarController.deleteEvent, { user, params: { id: args.id } })
  ));
}

module.exports = { register };
