const mongoose = require('mongoose');

/**
 * MCP access and refresh tokens for the OAuth flow. Stored hashed (SHA-256),
 * never plaintext. These are deliberately distinct from the app's login JWTs:
 * an MCP token is an opaque random string that can never validate as a JWT
 * (and vice versa), and it is scope-limited and independently revocable.
 *
 * Refresh tokens are rotated on use. All tokens minted from a single
 * authorization code share a `familyId`; detecting reuse of a rotated refresh
 * token revokes the entire family.
 */
const oauthTokenSchema = new mongoose.Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  kind: {
    type: String,
    enum: ['access', 'refresh'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  clientId: {
    type: String,
    required: true
  },
  scope: {
    type: [String],
    default: []
  },
  familyId: {
    type: String,
    required: true,
    index: true
  },
  resource: {
    type: String,
    default: null
  },
  // For refresh tokens: set when the token has been rotated (consumed). The
  // record is kept (until its TTL removes it) so a later replay of the spent
  // token can be detected as reuse and revoke the whole family.
  rotatedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index: expired tokens are removed automatically.
oauthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OAuthToken', oauthTokenSchema);
