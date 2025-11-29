const mongoose = require('mongoose');

const stravaCredentialSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Strava athlete identification
  stravaAthleteId: {
    type: Number,
    required: true,
    unique: true
  },

  // Athlete profile info (cached from Strava)
  athleteInfo: {
    username: String,
    firstname: String,
    lastname: String,
    city: String,
    state: String,
    country: String,
    sex: String,
    premium: Boolean,
    profilePicture: String,
    profilePictureMedium: String
  },

  // OAuth tokens
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  scope: {
    type: String,
    default: ''
  },

  // Sync tracking
  lastSyncAt: Date,
  lastSyncStatus: {
    type: String,
    enum: ['success', 'failed', 'partial', 'in_progress'],
    default: 'success'
  },
  lastSyncError: String,
  syncCursor: Date,           // Timestamp of most recent synced activity
  totalActivitiesSynced: {
    type: Number,
    default: 0
  },

  // Connection status
  isActive: {
    type: Boolean,
    default: true
  },
  deauthorizedAt: Date,
  connectedAt: {
    type: Date,
    default: Date.now
  }

}, { timestamps: true });

// Additional indexes (userId and stravaAthleteId already have unique: true in schema)
stravaCredentialSchema.index({ isActive: 1 });

// Virtual: Check if token is expired or expiring soon (within 10 minutes)
stravaCredentialSchema.virtual('isTokenExpired').get(function() {
  const bufferTime = 10 * 60 * 1000; // 10 minutes
  return this.expiresAt < new Date(Date.now() + bufferTime);
});

// Virtual: Full athlete name
stravaCredentialSchema.virtual('athleteFullName').get(function() {
  if (!this.athleteInfo) return null;
  return [this.athleteInfo.firstname, this.athleteInfo.lastname].filter(Boolean).join(' ');
});

// Method: Update tokens after refresh
stravaCredentialSchema.methods.updateTokens = function(accessToken, refreshToken, expiresAt) {
  this.accessToken = accessToken;
  this.refreshToken = refreshToken;
  this.expiresAt = expiresAt;
  return this.save();
};

// Method: Mark as deauthorized
stravaCredentialSchema.methods.deauthorize = function() {
  this.isActive = false;
  this.deauthorizedAt = new Date();
  this.accessToken = '';
  this.refreshToken = '';
  return this.save();
};

// Method: Update sync status
stravaCredentialSchema.methods.updateSyncStatus = function(status, error = null, cursor = null) {
  this.lastSyncAt = new Date();
  this.lastSyncStatus = status;
  this.lastSyncError = error;
  if (cursor) {
    this.syncCursor = cursor;
  }
  return this.save();
};

// Static: Find active credential by user
stravaCredentialSchema.statics.findActiveByUser = function(userId) {
  return this.findOne({ userId, isActive: true });
};

// Static: Find by Strava athlete ID (for webhook handling)
stravaCredentialSchema.statics.findByStravaAthleteId = function(stravaAthleteId) {
  return this.findOne({ stravaAthleteId, isActive: true });
};

// Ensure virtuals are included in JSON
stravaCredentialSchema.set('toJSON', { virtuals: true });
stravaCredentialSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StravaCredential', stravaCredentialSchema);
