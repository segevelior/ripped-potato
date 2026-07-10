const mongoose = require('mongoose');

/**
 * Short-lived OAuth authorization code (RFC 6749 + PKCE RFC 7636).
 * The plaintext code is never stored — only its SHA-256 hash. Codes are
 * single-use: `usedAt` is stamped on redemption, and any reuse revokes the
 * tokens minted from it (token theft response).
 */
const oauthAuthorizationCodeSchema = new mongoose.Schema({
  codeHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  clientId: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  redirectUri: {
    type: String,
    required: true
  },
  // PKCE S256 challenge; verified against the code_verifier at token exchange.
  codeChallenge: {
    type: String,
    required: true
  },
  scope: {
    type: [String],
    default: []
  },
  // RFC 8707 resource indicator, if the client sent one.
  resource: {
    type: String,
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  // familyId of tokens minted from this code, so reuse can revoke them.
  issuedTokenFamilyId: {
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

// TTL index: MongoDB removes the document once `expiresAt` passes.
oauthAuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthAuthorizationCode', oauthAuthorizationCodeSchema);
