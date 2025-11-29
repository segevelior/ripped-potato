const axios = require('axios');
const crypto = require('crypto');
const StravaCredential = require('../models/StravaCredential');
const ExternalActivity = require('../models/ExternalActivity');

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';

class StravaIntegrationService {
  /**
   * Generate OAuth authorization URL
   */
  static getAuthorizationUrl(userId) {
    const state = this.generateState(userId);
    const scopes = 'activity:read_all,profile:read_all';

    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      redirect_uri: process.env.STRAVA_REDIRECT_URI,
      response_type: 'code',
      scope: scopes,
      state: state,
      approval_prompt: 'auto'
    });

    return {
      url: `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`,
      state: state
    };
  }

  /**
   * Generate state parameter for OAuth (includes userId for callback)
   */
  static generateState(userId) {
    const randomPart = crypto.randomBytes(16).toString('hex');
    const data = JSON.stringify({ userId, random: randomPart });
    return Buffer.from(data).toString('base64url');
  }

  /**
   * Parse state parameter from callback
   */
  static parseState(state) {
    try {
      const data = Buffer.from(state, 'base64url').toString('utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  static async exchangeCodeForTokens(code) {
    try {
      const response = await axios.post(`${STRAVA_OAUTH_BASE}/token`, {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code'
      });

      return response.data;
    } catch (error) {
      // Handle Strava API errors with better messages
      if (error.response?.data) {
        const stravaError = error.response.data;
        console.error('Strava token exchange error:', stravaError);

        // Common Strava errors
        if (stravaError.message === 'Bad Request' || stravaError.errors) {
          throw new Error('Authorization code is invalid or expired. Please try connecting again.');
        }
      }
      throw error;
    }
  }

  /**
   * Handle OAuth callback - save credentials and trigger initial sync
   */
  static async handleCallback(code, state) {
    // Parse state to get userId
    const { userId } = this.parseState(state);

    // Exchange code for tokens
    const tokenData = await this.exchangeCodeForTokens(code);

    const {
      access_token,
      refresh_token,
      expires_at,
      athlete
    } = tokenData;

    // Check if this Strava account is already connected to another user
    const existingCredential = await StravaCredential.findOne({
      stravaAthleteId: athlete.id,
      userId: { $ne: userId }
    });

    if (existingCredential) {
      throw new Error('This Strava account is already connected to another user');
    }

    // Upsert credential (update if reconnecting, create if new)
    const credential = await StravaCredential.findOneAndUpdate(
      { userId },
      {
        userId,
        stravaAthleteId: athlete.id,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(expires_at * 1000),
        scope: tokenData.scope || 'activity:read_all,profile:read_all',
        athleteInfo: {
          username: athlete.username,
          firstname: athlete.firstname,
          lastname: athlete.lastname,
          city: athlete.city,
          state: athlete.state,
          country: athlete.country,
          sex: athlete.sex,
          premium: athlete.premium,
          profilePicture: athlete.profile,
          profilePictureMedium: athlete.profile_medium
        },
        isActive: true,
        deauthorizedAt: null,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return {
      credential,
      athlete,
      userId
    };
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(credential) {
    const response = await axios.post(`${STRAVA_OAUTH_BASE}/token`, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken
    });

    const { access_token, refresh_token, expires_at } = response.data;

    await credential.updateTokens(
      access_token,
      refresh_token,
      new Date(expires_at * 1000)
    );

    return access_token;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  static async getValidAccessToken(userId) {
    const credential = await StravaCredential.findActiveByUser(userId);

    if (!credential) {
      throw new Error('Strava not connected');
    }

    if (credential.isTokenExpired) {
      return await this.refreshAccessToken(credential);
    }

    return credential.accessToken;
  }

  /**
   * Fetch activities from Strava API
   */
  static async fetchActivities(accessToken, { before, after, page = 1, perPage = 50 } = {}) {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: Math.min(perPage, 200).toString() // Strava max is 200
    });

    if (before) params.append('before', Math.floor(before.getTime() / 1000).toString());
    if (after) params.append('after', Math.floor(after.getTime() / 1000).toString());

    const response = await axios.get(`${STRAVA_API_BASE}/athlete/activities`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params
    });

    return response.data;
  }

  /**
   * Fetch single activity with full details
   */
  static async fetchActivity(accessToken, activityId) {
    const response = await axios.get(`${STRAVA_API_BASE}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return response.data;
  }

  /**
   * Sanitize numeric value - returns null for undefined, null, NaN, or Infinity
   */
  static sanitizeNumber(value) {
    if (value === undefined || value === null) return null;
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return null;
    return num;
  }

  /**
   * Transform Strava activity to ExternalActivity format
   */
  static transformActivity(stravaActivity, userId) {
    const s = this.sanitizeNumber.bind(this);

    // Calculate calories - prefer direct value, then convert from kJ
    let calories = s(stravaActivity.calories);
    if (calories === null && stravaActivity.kilojoules) {
      const kj = s(stravaActivity.kilojoules);
      if (kj !== null) {
        const converted = kj * 0.239;
        // Ensure the conversion result is also valid
        calories = s(converted);
      }
    }

    return {
      userId,
      source: 'strava',
      externalId: stravaActivity.id.toString(),

      // Core data
      name: stravaActivity.name || 'Untitled Activity',
      description: stravaActivity.description || null,
      sportType: stravaActivity.sport_type || stravaActivity.type || 'Workout',

      // Timing
      startDate: new Date(stravaActivity.start_date),
      timezone: stravaActivity.timezone || null,
      movingTime: s(stravaActivity.moving_time),
      elapsedTime: s(stravaActivity.elapsed_time),

      // Distance & Elevation
      distance: s(stravaActivity.distance),
      elevationGain: s(stravaActivity.total_elevation_gain),
      elevationHigh: s(stravaActivity.elev_high),
      elevationLow: s(stravaActivity.elev_low),

      // Heart Rate
      avgHeartRate: s(stravaActivity.average_heartrate),
      maxHeartRate: s(stravaActivity.max_heartrate),

      // Speed
      avgSpeed: s(stravaActivity.average_speed),
      maxSpeed: s(stravaActivity.max_speed),

      // Power
      avgPower: s(stravaActivity.average_watts),
      maxPower: s(stravaActivity.max_watts),
      normalizedPower: s(stravaActivity.weighted_average_watts),

      // Cadence
      avgCadence: s(stravaActivity.average_cadence),

      // Energy
      calories: calories,
      kilojoules: s(stravaActivity.kilojoules),

      // Location
      city: stravaActivity.location_city || null,
      state: stravaActivity.location_state || null,
      country: stravaActivity.location_country || null,

      // Social
      kudosCount: s(stravaActivity.kudos_count),
      achievementCount: s(stravaActivity.achievement_count),

      // Equipment
      gearId: stravaActivity.gear_id || null,
      deviceName: stravaActivity.device_name || null,

      // Links
      stravaUrl: `https://www.strava.com/activities/${stravaActivity.id}`,

      // Visibility
      isPrivate: stravaActivity.private || false,

      // Sync metadata
      lastSyncedAt: new Date(),

      // Raw data for future use
      rawData: stravaActivity
    };
  }

  /**
   * Sync activities for a user
   * @param {string} userId - User ID
   * @param {Object} options - Sync options
   * @param {boolean} options.fullSync - If true, sync last 90 days; if false, sync since last cursor
   * @param {number} options.days - Number of days to sync (for full sync)
   */
  static async syncActivities(userId, { fullSync = false, days = 90 } = {}) {
    const credential = await StravaCredential.findActiveByUser(userId);

    if (!credential) {
      throw new Error('Strava not connected');
    }

    // Update sync status
    await credential.updateSyncStatus('in_progress');

    try {
      const accessToken = await this.getValidAccessToken(userId);

      // Determine time range
      let after;
      if (fullSync || !credential.syncCursor) {
        after = new Date();
        after.setDate(after.getDate() - days);
      } else {
        after = credential.syncCursor;
      }

      let page = 1;
      let hasMore = true;
      let totalSynced = 0;
      let latestActivityDate = credential.syncCursor;

      while (hasMore) {
        const activities = await this.fetchActivities(accessToken, {
          after,
          page,
          perPage: 100
        });

        if (activities.length === 0) {
          hasMore = false;
          break;
        }

        // Process each activity
        for (const stravaActivity of activities) {
          try {
            const activityDate = new Date(stravaActivity.start_date);

            // Track latest activity date
            if (!latestActivityDate || activityDate > latestActivityDate) {
              latestActivityDate = activityDate;
            }

            // Check for existing activity (dedup)
            const existing = await ExternalActivity.findBySourceAndExternalId(
              'strava',
              stravaActivity.id.toString()
            );

            const activityData = this.transformActivity(stravaActivity, userId);

            if (existing) {
              // Update existing
              await ExternalActivity.findByIdAndUpdate(existing._id, activityData);
            } else {
              // Create new
              await ExternalActivity.create(activityData);
              totalSynced++;
            }
          } catch (activityError) {
            // Log the error but continue processing other activities
            console.error(`Failed to sync activity ${stravaActivity.id}:`, activityError.message);
          }
        }

        // Check if there might be more pages
        if (activities.length < 100) {
          hasMore = false;
        } else {
          page++;
        }

        // Safety limit to prevent infinite loops
        if (page > 50) {
          hasMore = false;
        }
      }

      // Update credential with sync results
      credential.totalActivitiesSynced += totalSynced;
      await credential.updateSyncStatus('success', null, latestActivityDate);

      return {
        success: true,
        newActivities: totalSynced,
        latestActivityDate
      };

    } catch (error) {
      await credential.updateSyncStatus('failed', error.message);
      throw error;
    }
  }

  /**
   * Handle webhook event from Strava
   */
  static async handleWebhookEvent(event) {
    const { object_type, object_id, aspect_type, owner_id } = event;

    // Find credential by Strava athlete ID
    const credential = await StravaCredential.findByStravaAthleteId(owner_id);

    if (!credential) {
      console.log(`No credential found for Strava athlete ${owner_id}`);
      return { handled: false, reason: 'No credential found' };
    }

    // Handle athlete deauthorization
    if (object_type === 'athlete' && aspect_type === 'update') {
      // Check if this is a deauthorization (updates field contains "authorized": "false")
      if (event.updates && event.updates.authorized === 'false') {
        await credential.deauthorize();
        // Optionally: Delete all synced activities
        // await ExternalActivity.deleteMany({ userId: credential.userId, source: 'strava' });
        return { handled: true, action: 'deauthorized' };
      }
    }

    // Handle activity events
    if (object_type === 'activity') {
      const accessToken = await this.getValidAccessToken(credential.userId);

      switch (aspect_type) {
        case 'create':
        case 'update': {
          // Fetch full activity details
          const stravaActivity = await this.fetchActivity(accessToken, object_id);
          const activityData = this.transformActivity(stravaActivity, credential.userId);

          // Upsert activity
          await ExternalActivity.findOneAndUpdate(
            { source: 'strava', externalId: object_id.toString() },
            activityData,
            { upsert: true, new: true }
          );

          return { handled: true, action: aspect_type, activityId: object_id };
        }

        case 'delete': {
          await ExternalActivity.findOneAndDelete({
            source: 'strava',
            externalId: object_id.toString()
          });

          return { handled: true, action: 'delete', activityId: object_id };
        }

        default:
          return { handled: false, reason: `Unknown aspect_type: ${aspect_type}` };
      }
    }

    return { handled: false, reason: `Unknown object_type: ${object_type}` };
  }

  /**
   * Disconnect Strava (revoke access)
   * @param {string} userId - User ID
   * @param {boolean} deleteActivities - If true, delete all synced Strava activities
   */
  static async disconnect(userId, deleteActivities = false) {
    const credential = await StravaCredential.findActiveByUser(userId);

    if (!credential) {
      throw new Error('Strava not connected');
    }

    try {
      // Revoke access on Strava's side
      await axios.post(`${STRAVA_OAUTH_BASE}/deauthorize`, null, {
        headers: { Authorization: `Bearer ${credential.accessToken}` }
      });
    } catch (error) {
      // Continue even if revoke fails (token might already be invalid)
      console.error('Failed to revoke Strava token:', error.message);
    }

    // Delete the credential entirely (tokens are required fields, can't be emptied)
    await StravaCredential.deleteOne({ _id: credential._id });

    // Delete synced activities if requested
    let deletedCount = 0;
    if (deleteActivities) {
      const result = await ExternalActivity.deleteMany({ userId, source: 'strava' });
      deletedCount = result.deletedCount;
    }

    return { success: true, activitiesDeleted: deletedCount };
  }

  /**
   * Get connection status for a user
   */
  static async getStatus(userId) {
    const credential = await StravaCredential.findActiveByUser(userId);

    if (!credential) {
      return {
        connected: false
      };
    }

    return {
      connected: true,
      athlete: {
        id: credential.stravaAthleteId,
        name: credential.athleteFullName,
        username: credential.athleteInfo?.username,
        profilePicture: credential.athleteInfo?.profilePicture
      },
      lastSyncAt: credential.lastSyncAt,
      lastSyncStatus: credential.lastSyncStatus,
      totalActivitiesSynced: credential.totalActivitiesSynced,
      connectedAt: credential.connectedAt
    };
  }

  /**
   * Verify webhook subscription callback (for Strava validation)
   */
  static verifyWebhookSubscription(hubMode, hubChallenge, hubVerifyToken) {
    if (hubMode !== 'subscribe') {
      throw new Error('Invalid hub.mode');
    }

    if (hubVerifyToken !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      throw new Error('Invalid verify token');
    }

    return { 'hub.challenge': hubChallenge };
  }

  /**
   * Create webhook subscription (one-time setup, usually done manually)
   */
  static async createWebhookSubscription(callbackUrl) {
    const response = await axios.post(`${STRAVA_API_BASE}/push_subscriptions`, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
    });

    return response.data;
  }

  /**
   * Get current webhook subscription
   */
  static async getWebhookSubscription() {
    const response = await axios.get(`${STRAVA_API_BASE}/push_subscriptions`, {
      params: {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET
      }
    });

    return response.data;
  }

  /**
   * Delete webhook subscription
   */
  static async deleteWebhookSubscription(subscriptionId) {
    await axios.delete(`${STRAVA_API_BASE}/push_subscriptions/${subscriptionId}`, {
      params: {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET
      }
    });

    return { success: true };
  }
}

module.exports = StravaIntegrationService;
