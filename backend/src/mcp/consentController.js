/**
 * Consent-flow handlers for the MCP OAuth authorize step. These live at
 * /oauth/consent/* — deliberately NOT under /mcp — so they stay outside the
 * bearer-auth boundary and any /mcp rate limiter.
 *
 * Two ways to reach `approve`:
 *  - Password: request_id + email + password (verified against the User model).
 *  - Google:   a signed consent_ticket minted after passport-google auth.
 *
 * Both resolve to a userId + the authoritative pending-authorization record
 * (never trusted hidden authorize params), then mint a single-use auth code and
 * 302 back to the client's redirect_uri.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OAuthClient = require('../models/OAuthClient');
const OAuthAuthorizationCode = require('../models/OAuthAuthorizationCode');
const OAuthPendingAuthorization = require('../models/OAuthPendingAuthorization');
const { renderLoginConsent, renderGoogleConsent } = require('./consentPage');
const { sha256, randomToken, CODE_TTL } = require('./authProvider');

const CONSENT_TICKET_SECRET = process.env.MCP_CONSENT_TICKET_SECRET || process.env.JWT_SECRET;
const CONSENT_TICKET_TTL = '5m';
const CONSENT_TICKET_AUD = 'mcp-consent';

function ticketFor(userId, requestId) {
  return jwt.sign({ userId: String(userId), requestId }, CONSENT_TICKET_SECRET, {
    expiresIn: CONSENT_TICKET_TTL,
    audience: CONSENT_TICKET_AUD
  });
}

function verifyTicket(token) {
  return jwt.verify(token, CONSENT_TICKET_SECRET, { audience: CONSENT_TICKET_AUD });
}

// Simple standalone HTML error (used when we can't safely redirect anywhere).
function errorPage(res, status, message) {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Error</title></head>` +
    `<body style="font-family:sans-serif;max-width:420px;margin:80px auto;padding:0 24px;text-align:center"><h1>Something went wrong</h1><p>${message}</p></body></html>`
  );
}

function redirectWithError(res, redirectUri, error, state) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  res.redirect(302, url.href);
}

async function issueCodeAndRedirect(res, { pending, userId }) {
  const code = randomToken('sfmcp_code_');
  await OAuthAuthorizationCode.create({
    codeHash: sha256(code),
    clientId: pending.clientId,
    userId,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    scope: pending.scope,
    resource: pending.resource,
    expiresAt: new Date(Date.now() + CODE_TTL * 1000)
  });

  // Pending record is single-use — consume it.
  await OAuthPendingAuthorization.deleteOne({ _id: pending._id });

  const url = new URL(pending.redirectUri);
  url.searchParams.set('code', code);
  if (pending.state) url.searchParams.set('state', pending.state);
  res.redirect(302, url.href);
}

// POST /oauth/consent/approve
async function approve(req, res) {
  try {
    const { consent_ticket, request_id, email, password } = req.body;

    let userId;
    let requestId;

    if (consent_ticket) {
      // Google branch — identity carried by the signed ticket.
      let decoded;
      try {
        decoded = verifyTicket(consent_ticket);
      } catch {
        return errorPage(res, 400, 'Your sign-in session expired. Please start again from Claude.');
      }
      userId = decoded.userId;
      requestId = decoded.requestId;
    } else {
      // Password branch.
      requestId = request_id;
      if (!email || !password) {
        // Re-render the form with an error if we can recover the request.
        const pendingForForm = requestId
          ? await OAuthPendingAuthorization.findOne({ requestId })
          : null;
        if (pendingForForm) {
          const client = await OAuthClient.findOne({ clientId: pendingForForm.clientId });
          return res.status(400).set('Content-Type', 'text/html; charset=utf-8').send(
            renderLoginConsent({
              clientName: client && client.clientName,
              scopes: pendingForForm.scope,
              requestId,
              error: 'Email and password are required.'
            })
          );
        }
        return errorPage(res, 400, 'Missing credentials.');
      }
    }

    const pending = await OAuthPendingAuthorization.findOne({ requestId });
    if (!pending) {
      return errorPage(res, 400, 'This request expired. Please start again from Claude.');
    }

    if (!consent_ticket) {
      // Verify password credentials.
      const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
      const invalid = !user || (!user.password && user.googleId) || !(await user.comparePassword(password));
      if (invalid) {
        const client = await OAuthClient.findOne({ clientId: pending.clientId });
        return res.status(401).set('Content-Type', 'text/html; charset=utf-8').send(
          renderLoginConsent({
            clientName: client && client.clientName,
            scopes: pending.scope,
            requestId,
            error: 'Invalid email or password.'
          })
        );
      }
      userId = user._id;
    }

    return await issueCodeAndRedirect(res, { pending, userId });
  } catch (err) {
    console.error('MCP consent approve error:', err);
    return errorPage(res, 500, 'Server error. Please try again.');
  }
}

// POST /oauth/consent/deny
async function deny(req, res) {
  try {
    const { request_id } = req.body;
    const pending = request_id
      ? await OAuthPendingAuthorization.findOne({ requestId: request_id })
      : null;
    if (!pending) {
      return errorPage(res, 400, 'Request cancelled.');
    }
    await OAuthPendingAuthorization.deleteOne({ _id: pending._id });
    return redirectWithError(res, pending.redirectUri, 'access_denied', pending.state);
  } catch (err) {
    console.error('MCP consent deny error:', err);
    return errorPage(res, 500, 'Server error.');
  }
}

/**
 * Called from the Google OAuth callback when `state` is `mcp:<requestId>`.
 * The user is already authenticated (req.user); mint a consent ticket and
 * render the Google consent confirmation page.
 */
async function renderGoogleConsentAfterAuth(req, res, requestId) {
  const pending = await OAuthPendingAuthorization.findOne({ requestId });
  if (!pending) {
    return errorPage(res, 400, 'This request expired. Please start again from Claude.');
  }
  const client = await OAuthClient.findOne({ clientId: pending.clientId });
  const consentTicket = ticketFor(req.user._id, requestId);

  res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(
    renderGoogleConsent({
      clientName: client && client.clientName,
      scopes: pending.scope,
      email: req.user.email,
      consentTicket,
      requestId
    })
  );
}

module.exports = {
  approve,
  deny,
  renderGoogleConsentAfterAuth
};
