/**
 * Shared MCP/OAuth URL configuration.
 *
 * MCP_BASE_URL is the public origin of this backend as users type it into
 * Claude (no trailing slash), e.g. https://synergyfit-api.onrender.com. The
 * OAuth issuer is this origin; the protected resource is `${origin}/mcp` and
 * MUST exactly match the connector URL the user enters.
 */

const RAW_BASE = process.env.MCP_BASE_URL || `http://localhost:${process.env.PORT || 5001}`;
const MCP_BASE_URL = RAW_BASE.replace(/\/+$/, '');
const MCP_PATH = '/mcp';
const MCP_RESOURCE_URL = `${MCP_BASE_URL}${MCP_PATH}`;

// OAuth issuer identifier, exactly as advertised in the authorization-server
// metadata (the SDK uses new URL(issuerUrl).href, which includes a trailing
// slash). Used for the RFC 9207 `iss` parameter on the auth-code redirect.
const MCP_ISSUER = new URL(MCP_BASE_URL).href;

// The SDK serves protected-resource metadata at the RFC 9728 path-suffixed URL.
const RESOURCE_METADATA_URL = `${MCP_BASE_URL}/.well-known/oauth-protected-resource${MCP_PATH}`;

module.exports = {
  MCP_BASE_URL,
  MCP_PATH,
  MCP_RESOURCE_URL,
  RESOURCE_METADATA_URL,
  MCP_ISSUER
};
