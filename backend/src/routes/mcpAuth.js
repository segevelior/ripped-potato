/**
 * OAuth authorization-server routes for the MCP connector. Mounted at the app
 * ROOT (not under /api/v1) because OAuth discovery documents are origin-rooted
 * (`/.well-known/*`) and Claude expects the endpoints at the issuer origin.
 *
 * Provides (via the SDK's mcpAuthRouter):
 *   /.well-known/oauth-authorization-server   (RFC 8414, advertises S256)
 *   /.well-known/oauth-protected-resource/mcp (RFC 9728)
 *   /authorize  /token  /register  /revoke
 * Plus a bare-path PRM alias and the /oauth/consent/* handlers.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { mcpAuthRouter, createOAuthMetadata } = require('@modelcontextprotocol/sdk/server/auth/router.js');

const { provider, SCOPES } = require('../mcp/authProvider');
const { MCP_BASE_URL, MCP_RESOURCE_URL } = require('../mcp/config');
const consentController = require('../mcp/consentController');

const router = express.Router();

// Override the authorization-server metadata to advertise RFC 9207 issuer
// identification (the SDK omits this field). Must be registered BEFORE the SDK
// router so it wins for this path. Claude requires the `iss` param on the
// auth-code redirect; advertising support here signals that to the client.
const asMetadata = {
  ...createOAuthMetadata({ provider, issuerUrl: new URL(MCP_BASE_URL), scopesSupported: SCOPES }),
  authorization_response_iss_parameter_supported: true
};
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(asMetadata);
});

// SDK router: metadata + /authorize + /token + /register + /revoke.
router.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(MCP_BASE_URL),
    resourceServerUrl: new URL(MCP_RESOURCE_URL),
    scopesSupported: SCOPES,
    resourceName: 'SynergyFit'
  })
);

// Bare-path protected-resource metadata alias. Claude probes the path-suffixed
// URL first (served by the SDK above), then this bare path; other clients may
// only try the bare path. The `resource` value still points at `${origin}/mcp`.
router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: MCP_RESOURCE_URL,
    // Must exactly match the issuer the SDK advertises (its metadata uses the
    // normalized URL href, i.e. with a trailing slash), so Claude resolves the
    // same authorization server whichever PRM document it reads.
    authorization_servers: [new URL(MCP_BASE_URL).href],
    scopes_supported: SCOPES,
    resource_name: 'SynergyFit'
  });
});

// Consent POSTs: modest per-IP limit (the SDK already rate-limits its own
// /authorize, /token, /register endpoints).
const consentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

router.post('/oauth/consent/approve', consentLimiter, consentController.approve);
router.post('/oauth/consent/deny', consentLimiter, consentController.deny);

module.exports = router;
