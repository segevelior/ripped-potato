/**
 * Builds a per-request MCP server instance scoped to one authenticated user.
 *
 * The Streamable HTTP transport runs statelessly (a fresh server + transport
 * per POST), so we construct a new McpServer here on each request, registering
 * the workout/calendar/exercise tools with the user and their granted scopes
 * closed over. Tools enforce scope individually via `withScope`.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const workoutTools = require('./tools/workoutTools');
const calendarTools = require('./tools/calendarTools');
const exerciseTools = require('./tools/exerciseTools');

const APP_VERSION = process.env.APP_VERSION || '1.0.0';

/**
 * @param {object} user - full Mongoose User document
 * @param {string[]} scopes - granted OAuth scopes for this token
 */
function buildMcpServer(user, scopes) {
  const server = new McpServer({
    name: 'synergyfit',
    version: APP_VERSION
  }, {
    instructions:
      'Tools to view and modify the SynergyFit user\'s workouts and training calendar. ' +
      'Use search_exercises to resolve exercise ids before creating workouts. All actions ' +
      'apply to the authenticated user only.'
  });

  const ctx = { user, scopes: Array.isArray(scopes) ? scopes : [] };
  workoutTools.register(server, ctx);
  calendarTools.register(server, ctx);
  exerciseTools.register(server, ctx);

  return server;
}

module.exports = { buildMcpServer };
