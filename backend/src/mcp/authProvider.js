/**
 * OAuthServerProvider implementation backing the MCP connector's OAuth 2.0
 * authorization server (DCR + PKCE S256, authorization-code + refresh grants).
 *
 * The SDK's mcpAuthRouter drives the spec-level HTTP handling (metadata,
 * /authorize, /token, /register, /revoke) and does PKCE verification itself;
 * this provider supplies the storage-backed logic: client registration,
 * rendering the consent page, and minting/rotating/verifying opaque tokens.
 *
 * Design notes:
 * - Clients are forced to be PUBLIC (token_endpoint_auth_method: 'none'). Claude
 *   and Claude Code both register as public clients + PKCE, so we never store an
 *   OAuth client secret at rest.
 * - Tokens are opaque random strings stored only as SHA-256 hashes. They are
 *   structurally distinct from the app's login JWTs and independently revocable.
 * - Refresh tokens rotate on use; reuse of a rotated refresh token revokes the
 *   whole token family (OAuth 2.1 token-theft response).
 */

const crypto = require('crypto');
const {
  InvalidTokenError,
  InvalidGrantError,
  InvalidClientMetadataError
} = require('@modelcontextprotocol/sdk/server/auth/errors.js');

const OAuthClient = require('../models/OAuthClient');
const OAuthAuthorizationCode = require('../models/OAuthAuthorizationCode');
const OAuthToken = require('../models/OAuthToken');
const OAuthPendingAuthorization = require('../models/OAuthPendingAuthorization');
const { renderLoginConsent } = require('./consentPage');

const SCOPES = [
  'workouts:read',
  'workouts:write',
  'calendar:read',
  'calendar:write',
  'exercises:read'
];

const ACCESS_TTL = parseInt(process.env.MCP_ACCESS_TOKEN_TTL_SECONDS, 10) || 3600;
const REFRESH_TTL = parseInt(process.env.MCP_REFRESH_TOKEN_TTL_SECONDS, 10) || 2592000;
const CODE_TTL = parseInt(process.env.MCP_AUTH_CODE_TTL_SECONDS, 10) || 600;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix) {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

function isAllowedRedirectUri(uri) {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}

// Restrict requested scopes to the ones we support; default to all if none asked.
function normalizeScopes(requested) {
  const filtered = (requested || []).filter((s) => SCOPES.includes(s));
  return filtered.length ? filtered : SCOPES.slice();
}

/**
 * Mint an access + refresh token pair sharing a familyId. Returns the
 * OAuthTokens response object (with the plaintext tokens for the client).
 */
async function issueTokenPair({ userId, clientId, scope, resource, familyId }) {
  const family = familyId || crypto.randomUUID();
  const accessToken = randomToken('sfmcp_at_');
  const refreshToken = randomToken('sfmcp_rt_');
  const now = Date.now();

  await OAuthToken.create([
    {
      tokenHash: sha256(accessToken),
      kind: 'access',
      userId,
      clientId,
      scope,
      familyId: family,
      resource: resource || null,
      expiresAt: new Date(now + ACCESS_TTL * 1000)
    },
    {
      tokenHash: sha256(refreshToken),
      kind: 'refresh',
      userId,
      clientId,
      scope,
      familyId: family,
      resource: resource || null,
      expiresAt: new Date(now + REFRESH_TTL * 1000)
    }
  ]);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL,
    refresh_token: refreshToken,
    scope: scope.join(' '),
    _familyId: family
  };
}

const clientsStore = {
  async getClient(clientId) {
    const c = await OAuthClient.findOne({ clientId });
    if (!c) return undefined;

    // Fire-and-forget last-used bump (don't block the auth path).
    OAuthClient.updateOne({ clientId }, { lastUsedAt: new Date() }).catch(() => {});

    // Note: deliberately no `client_secret` field → the SDK treats this as a
    // public client and requires only PKCE, never a secret.
    return {
      client_id: c.clientId,
      redirect_uris: c.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: c.grantTypes,
      response_types: c.responseTypes,
      scope: c.scope || undefined,
      client_name: c.clientName || undefined,
      client_id_issued_at: c.clientIdIssuedAt
    };
  },

  async registerClient(clientInfo) {
    const redirectUris = clientInfo.redirect_uris || [];
    if (!redirectUris.length || !redirectUris.every(isAllowedRedirectUri)) {
      throw new InvalidClientMetadataError('redirect_uris must be https or loopback http URLs');
    }

    await OAuthClient.create({
      clientId: clientInfo.client_id,
      clientSecretHash: null,
      clientName: clientInfo.client_name || null,
      redirectUris,
      grantTypes: clientInfo.grant_types || ['authorization_code', 'refresh_token'],
      responseTypes: clientInfo.response_types || ['code'],
      tokenEndpointAuthMethod: 'none',
      scope: clientInfo.scope || null,
      clientIdIssuedAt: clientInfo.client_id_issued_at
    });

    // Return as a public client — strip any secret the SDK generated so the
    // client (Claude) never receives one and behaves as a public + PKCE client.
    const { client_secret, client_secret_expires_at, ...rest } = clientInfo;
    return {
      ...rest,
      token_endpoint_auth_method: 'none'
    };
  }
};

const provider = {
  clientsStore,

  /**
   * Render the login/consent page. The SDK has already validated client_id,
   * redirect_uri (against registered URIs), response_type=code and PKCE.
   */
  async authorize(client, params, res) {
    const scopes = normalizeScopes(params.scopes);

    // Persist the authorize request so the "Continue with Google" hop can
    // recover it after the Google round-trip (keyed by requestId in `state`).
    const requestId = crypto.randomUUID();
    await OAuthPendingAuthorization.create({
      requestId,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state || null,
      scope: scopes,
      resource: params.resource ? params.resource.href : null,
      expiresAt: new Date(Date.now() + CODE_TTL * 1000)
    });

    const html = renderLoginConsent({
      clientName: client.client_name,
      scopes,
      requestId
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    const record = await OAuthAuthorizationCode.findOne({ codeHash: sha256(authorizationCode) });
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return record.codeChallenge;
  },

  /**
   * Redeem a single-use authorization code for a token pair. The SDK has
   * already verified PKCE (code_verifier vs the stored challenge).
   */
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    const codeHash = sha256(authorizationCode);
    const record = await OAuthAuthorizationCode.findOne({ codeHash });

    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }

    // Single-use enforcement: a replayed code means the code leaked — revoke
    // every token minted from it.
    if (record.usedAt) {
      if (record.issuedTokenFamilyId) {
        await OAuthToken.deleteMany({ familyId: record.issuedTokenFamilyId });
      }
      throw new InvalidGrantError('Authorization code already used');
    }

    if (redirectUri && redirectUri !== record.redirectUri) {
      throw new InvalidGrantError('redirect_uri mismatch');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new InvalidGrantError('Authorization code expired');
    }

    const tokens = await issueTokenPair({
      userId: record.userId,
      clientId: client.client_id,
      scope: record.scope,
      resource: record.resource
    });

    record.usedAt = new Date();
    record.issuedTokenFamilyId = tokens._familyId;
    await record.save();

    delete tokens._familyId;
    return tokens;
  },

  /**
   * Rotate a refresh token. Reuse of an already-rotated token revokes the
   * whole family.
   */
  async exchangeRefreshToken(client, refreshToken, scopes) {
    const tokenHash = sha256(refreshToken);
    const record = await OAuthToken.findOne({ tokenHash, kind: 'refresh' });

    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token');
    }

    // Reuse detection: a refresh token that was already rotated is being
    // replayed. Treat it as token theft (OAuth 2.1) and revoke the whole
    // family — both the attacker's and the legitimate client's tokens.
    if (record.rotatedAt) {
      await OAuthToken.deleteMany({ familyId: record.familyId });
      throw new InvalidGrantError('Refresh token reuse detected');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new InvalidGrantError('Refresh token expired');
    }

    // Requested scopes (if any) must be a subset of the originally granted set.
    let scope = record.scope;
    if (scopes && scopes.length) {
      if (!scopes.every((s) => record.scope.includes(s))) {
        throw new InvalidGrantError('Requested scope exceeds original grant');
      }
      scope = scopes;
    }

    // Rotate: mark the old refresh token spent (kept for reuse detection until
    // its TTL removes it) rather than deleting it, then issue the new pair in
    // the same family.
    record.rotatedAt = new Date();
    await record.save();

    const tokens = await issueTokenPair({
      userId: record.userId,
      clientId: client.client_id,
      scope,
      resource: record.resource,
      familyId: record.familyId
    });

    delete tokens._familyId;
    return tokens;
  },

  async verifyAccessToken(token) {
    const record = await OAuthToken.findOne({ tokenHash: sha256(token), kind: 'access' });
    if (!record) {
      throw new InvalidTokenError('Invalid or expired access token');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new InvalidTokenError('Access token expired');
    }
    return {
      token,
      clientId: record.clientId,
      scopes: record.scope,
      expiresAt: Math.floor(record.expiresAt.getTime() / 1000), // epoch seconds
      extra: { userId: record.userId.toString() }
    };
  },

  async revokeToken(client, request) {
    if (!request || !request.token) return;
    await OAuthToken.deleteOne({ tokenHash: sha256(request.token) });
  }
};

module.exports = {
  provider,
  SCOPES,
  sha256,
  randomToken,
  CODE_TTL
};
