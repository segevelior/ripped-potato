/**
 * The MCP endpoint: Streamable HTTP transport at POST /mcp, behind OAuth bearer
 * auth. Run statelessly (a fresh McpServer + transport per request) so the
 * connector survives server restarts with no session store.
 *
 * This router carries ONLY the JSON-RPC endpoint — the consent/OAuth routes
 * live elsewhere (/oauth/consent, /authorize, ...) so nothing unauthenticated
 * shares this prefix.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');

const User = require('../models/User');
const { provider } = require('../mcp/authProvider');
const { buildMcpServer } = require('../mcp/server');
const { RESOURCE_METADATA_URL } = require('../mcp/config');

const router = express.Router();

// Generous per-IP limit: a single Claude conversation can fire many tool calls.
const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null }
});

const bearerAuth = requireBearerAuth({
  verifier: provider,
  resourceMetadataUrl: RESOURCE_METADATA_URL
});

function methodNotAllowed(req, res) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for the MCP endpoint.' },
    id: null
  });
}

router.post('/', mcpLimiter, bearerAuth, async (req, res) => {
  try {
    const userId = req.auth && req.auth.extra && req.auth.extra.userId;
    const user = userId ? await User.findById(userId) : null;
    if (!user) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unknown or deleted user' },
        id: null
      });
    }

    const server = buildMcpServer(user, req.auth.scopes || []);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // Tear down per-request server + transport when the response closes.
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

// Stateless server: no long-lived SSE stream or session to GET/DELETE.
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

module.exports = router;
