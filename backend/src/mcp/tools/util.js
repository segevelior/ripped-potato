/**
 * Shared helpers for MCP tool modules.
 */

// Return an MCP tool-error result when the token lacks a required scope.
function scopeError(scope) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: this connector is not authorized for "${scope}".` }]
  };
}

// Guard a tool handler behind a required scope.
function withScope(scopes, required, handler) {
  return async (args, extra) => {
    if (!scopes.includes(required)) return scopeError(required);
    return handler(args, extra);
  };
}

module.exports = { scopeError, withScope };
