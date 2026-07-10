/**
 * Controller-reuse bridge for MCP tools.
 *
 * Existing Express controllers are `(req, res)` functions that read
 * `req.user/params/query/body`, run express-validator chains, and reply via
 * `res.status(x).json(y)`. Rather than duplicate that CRUD + validation logic,
 * a tool builds a minimal req, runs the same validator chains, and captures the
 * response with a chainable res stub.
 *
 * `req.user` is the full Mongoose User document, so both `req.user._id`
 * (workout/calendar controllers) and `req.user.id` (exercise controller) work.
 */

const { validationResult } = require('express-validator');

/**
 * Invoke a controller in-process and capture its response.
 * @returns {Promise<{statusCode:number, payload:any}>}
 */
async function callController(handler, { user, params = {}, query = {}, body = {} } = {}, validators = []) {
  const req = {
    user,
    params,
    query,
    body,
    headers: {},
    get() { return undefined },
    header() { return undefined }
  };

  // Run express-validator chains against the same req the handler will read,
  // so the controller's own validationResult(req) sees the results.
  for (const chain of validators) {
    // eslint-disable-next-line no-await-in-loop
    await chain.run(req);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (statusCode, payload) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, payload });
    };

    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { finish(this.statusCode, payload); return this; },
      send(payload) { finish(this.statusCode, payload); return this; },
      set() { return this; },
      setHeader() { return this; },
      end() { finish(this.statusCode, undefined); return this; }
    };

    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err) => finish(500, { success: false, message: err && err.message ? err.message : 'Server error' }));
  });
}

/**
 * Map a captured controller response to an MCP tool result. Non-2xx or
 * `{ success: false }` payloads become tool errors.
 * @param {object} result - { statusCode, payload } from callController
 * @param {(data:any)=>any} [transform] - optional shaper for the success data
 */
function toToolResult(result, transform) {
  const { statusCode, payload } = result;
  const ok = statusCode >= 200 && statusCode < 300 && !(payload && payload.success === false);

  if (!ok) {
    let msg;
    if (payload && payload.errors) {
      msg = payload.errors.map((e) => e.msg || e.message).filter(Boolean).join('; ') ||
        (payload.message || 'Validation failed');
    } else {
      msg = (payload && payload.message) || `Request failed (${statusCode})`;
    }
    return { isError: true, content: [{ type: 'text', text: `Error: ${msg}` }] };
  }

  // Prefer the conventional `data` envelope; fall back to the whole payload.
  let data = payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  if (typeof transform === 'function') data = transform(data);

  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/**
 * Convenience: run a controller and return the MCP tool result in one call.
 */
async function runTool(handler, ctx, { validators = [], transform } = {}) {
  const result = await callController(handler, ctx, validators);
  return toToolResult(result, transform);
}

module.exports = {
  callController,
  toToolResult,
  runTool,
  validationResult
};
