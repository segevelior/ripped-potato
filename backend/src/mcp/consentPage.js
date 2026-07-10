/**
 * Server-rendered login + consent pages for the MCP OAuth flow.
 *
 * Pure functions returning HTML strings — NO client-side JavaScript, inline
 * CSS only, so the existing helmet CSP (`scriptSrc 'self'`) is untouched. All
 * forms post to same-origin `/oauth/consent/*`; the only cross-origin hop is
 * the final 302 to the client's redirect_uri (e.g. claude.ai), not a form action.
 */

const SCOPE_LABELS = {
  'workouts:read': 'View your workouts and training stats',
  'workouts:write': 'Create, update and delete your workouts',
  'calendar:read': 'View your training calendar',
  'calendar:write': 'Schedule and reschedule calendar events',
  'exercises:read': 'Search the exercise library'
};

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hiddenField(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

function scopeList(scopes) {
  const items = (scopes || [])
    .map((s) => `<li>${escapeHtml(SCOPE_LABELS[s] || s)}</li>`)
    .join('');
  return `<ul class="scopes">${items}</ul>`;
}

const PAGE_CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0; padding: 24px; background: #f5f6f8; color: #1a1a2e;
    display: flex; min-height: 100vh; align-items: center; justify-content: center;
  }
  .card {
    background: #fff; border-radius: 16px; padding: 32px; width: 100%; max-width: 420px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
  .app { font-weight: 600; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 16px 0 6px; }
  input[type=email], input[type=password] {
    width: 100%; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 10px;
    font-size: 16px; background: #fff; color: #1a1a2e;
  }
  .scopes { margin: 12px 0 24px; padding-left: 20px; font-size: 14px; color: #374151; }
  .scopes li { margin: 6px 0; }
  .box {
    background: #f0f1f5; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;
    font-size: 14px;
  }
  button {
    width: 100%; padding: 13px; border: none; border-radius: 10px; font-size: 16px;
    font-weight: 600; cursor: pointer; margin-top: 8px;
  }
  .primary { background: #4f46e5; color: #fff; }
  .secondary { background: transparent; color: #6b7280; }
  .divider { text-align: center; color: #9ca3af; font-size: 13px; margin: 18px 0; }
  .google {
    display: block; text-align: center; text-decoration: none; padding: 12px;
    border: 1px solid #d1d5db; border-radius: 10px; color: #1a1a2e; font-weight: 600; font-size: 15px;
  }
  .error { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 12px 14px; font-size: 14px; margin-bottom: 16px; }
  .foot { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 20px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1117; color: #e5e7eb; }
    .card { background: #1a1d29; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
    .sub, .scopes { color: #9ca3af; }
    input[type=email], input[type=password] { background: #0f1117; border-color: #374151; color: #e5e7eb; }
    .box { background: #0f1117; }
    .google { background: #1a1d29; border-color: #374151; color: #e5e7eb; }
  }
`;

function shell(title, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="card">
${inner}
<p class="foot">SynergyFit · Model Context Protocol connector</p>
</div>
</body>
</html>`;
}

/**
 * Password login + consent (the default /authorize screen). Everything is
 * keyed on `requestId` — the authoritative authorize parameters live in the
 * server-side pending-authorization record, never in trusted hidden fields.
 */
function renderLoginConsent(params) {
  const { clientName, scopes, requestId, error } = params;

  const googleHref = `/api/v1/auth/google?state=${encodeURIComponent('mcp:' + requestId)}`;

  const inner = `
<h1>Connect to Claude</h1>
<p class="sub"><span class="app">${escapeHtml(clientName || 'An MCP client')}</span> wants to access your SynergyFit account.</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<p class="sub">This will allow it to:</p>
${scopeList(scopes)}
<form method="POST" action="/oauth/consent/approve" autocomplete="on">
  ${hiddenField('request_id', requestId)}
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required autocomplete="email">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" required autocomplete="current-password">
  <button type="submit" class="primary">Sign in &amp; Allow</button>
</form>
<div class="divider">or</div>
<a class="google" href="${escapeHtml(googleHref)}">Continue with Google</a>
<form method="POST" action="/oauth/consent/deny">
  ${hiddenField('request_id', requestId)}
  <button type="submit" class="secondary">Cancel</button>
</form>`;

  return shell('Connect to Claude', inner);
}

/**
 * Consent confirmation after the user authenticated via Google. No password
 * fields — the user is identified by a short-lived signed `consentTicket`
 * (which itself carries the requestId).
 */
function renderGoogleConsent(params) {
  const { clientName, scopes, email, consentTicket, requestId } = params;

  const inner = `
<h1>Connect to Claude</h1>
<p class="sub"><span class="app">${escapeHtml(clientName || 'An MCP client')}</span> wants to access your SynergyFit account.</p>
<div class="box">Signed in as <strong>${escapeHtml(email)}</strong></div>
<p class="sub">This will allow it to:</p>
${scopeList(scopes)}
<form method="POST" action="/oauth/consent/approve">
  ${hiddenField('consent_ticket', consentTicket)}
  <button type="submit" class="primary">Allow</button>
</form>
<form method="POST" action="/oauth/consent/deny">
  ${hiddenField('request_id', requestId)}
  <button type="submit" class="secondary">Cancel</button>
</form>`;

  return shell('Connect to Claude', inner);
}

module.exports = {
  renderLoginConsent,
  renderGoogleConsent,
  SCOPE_LABELS
};
