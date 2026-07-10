const mongoose = require('mongoose');

/**
 * OAuth client registered via Dynamic Client Registration (RFC 7591).
 * Claude registers itself as a public client (token_endpoint_auth_method: 'none')
 * on each fresh connection. We store the client so subsequent token/refresh
 * requests can be validated against its redirect URIs.
 */
const oauthClientSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Only set for confidential clients. Claude connects as a public client and
  // has no secret; we never store plaintext secrets.
  clientSecretHash: {
    type: String,
    default: null
  },
  clientName: {
    type: String,
    default: null
  },
  redirectUris: {
    type: [String],
    required: true,
    validate: {
      validator: (uris) => Array.isArray(uris) && uris.length > 0,
      message: 'At least one redirect URI is required'
    }
  },
  grantTypes: {
    type: [String],
    default: ['authorization_code', 'refresh_token']
  },
  responseTypes: {
    type: [String],
    default: ['code']
  },
  tokenEndpointAuthMethod: {
    type: String,
    default: 'none'
  },
  scope: {
    type: String,
    default: null
  },
  clientIdIssuedAt: {
    type: Number // epoch seconds, per RFC 7591
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('OAuthClient', oauthClientSchema);
