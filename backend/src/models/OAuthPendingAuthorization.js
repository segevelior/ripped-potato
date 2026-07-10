const mongoose = require('mongoose');

/**
 * Bridges the Google-login hop during the OAuth authorize flow. When a user
 * chooses "Continue with Google" on the consent page, we can't carry the
 * authorize parameters through the Google round-trip, so we persist them here
 * keyed by `requestId` (passed as the OAuth `state` to Google as `mcp:<id>`).
 * After Google auth completes, the callback loads this record to render the
 * consent page for the now-authenticated user.
 */
const oauthPendingAuthorizationSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  clientId: {
    type: String,
    required: true
  },
  redirectUri: {
    type: String,
    required: true
  },
  codeChallenge: {
    type: String,
    required: true
  },
  state: {
    type: String,
    default: null
  },
  scope: {
    type: [String],
    default: []
  },
  resource: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index: pending authorizations expire quickly (10 min).
oauthPendingAuthorizationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthPendingAuthorization', oauthPendingAuthorizationSchema);
