const express = require('express');
const { auth } = require('../middleware/auth');
const StravaIntegrationService = require('../services/StravaIntegrationService');

const router = express.Router();

// ==================== STRAVA ROUTES ====================

/**
 * GET /api/v1/integrations/strava/authorize
 * Get Strava OAuth authorization URL
 * Requires authentication
 */
router.get('/strava/authorize', auth, async (req, res) => {
  try {
    const { url, state } = StravaIntegrationService.getAuthorizationUrl(req.user.id);

    // Store state in session or return for frontend to handle
    // For stateless JWT auth, we encode userId in state itself
    res.json({
      success: true,
      data: {
        authorizationUrl: url,
        state: state
      }
    });
  } catch (error) {
    console.error('Strava authorize error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/integrations/strava/callback
 * OAuth callback from Strava
 * No auth required (Strava redirects here)
 */
router.get('/strava/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Handle OAuth errors (user denied, etc.)
    if (oauthError) {
      console.error('Strava OAuth error:', oauthError, error_description);
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/Settings?strava=error`);
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing code or state parameter'
      });
    }

    // Handle the callback
    const result = await StravaIntegrationService.handleCallback(code, state);

    // Trigger initial sync in background (don't await)
    StravaIntegrationService.syncActivities(result.userId, { fullSync: true, days: 90 })
      .then(syncResult => {
        console.log(`Initial Strava sync complete for user ${result.userId}:`, syncResult);
      })
      .catch(syncError => {
        console.error(`Initial Strava sync failed for user ${result.userId}:`, syncError);
      });

    // Redirect to frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/Settings?strava=connected`);

  } catch (error) {
    console.error('Strava callback error:', error.message);
    console.error('Strava callback error stack:', error.stack);

    // Check if it's a duplicate key error (user trying to reconnect same account)
    const errorMessage = error.message || '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // If the error is from Strava API (e.g., code already used)
    if (error.response?.data) {
      console.error('Strava API error response:', error.response.data);
    }

    // Redirect to frontend with error
    res.redirect(`${frontendUrl}/Settings?strava=error`);
  }
});

/**
 * GET /api/v1/integrations/strava/status
 * Get Strava connection status
 * Requires authentication
 */
router.get('/strava/status', auth, async (req, res) => {
  try {
    const status = await StravaIntegrationService.getStatus(req.user.id);

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Strava status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Strava status',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/integrations/strava/sync
 * Trigger manual sync of Strava activities
 * Requires authentication
 */
router.post('/strava/sync', auth, async (req, res) => {
  try {
    const { fullSync = false, days = 30 } = req.body;

    const result = await StravaIntegrationService.syncActivities(req.user.id, {
      fullSync,
      days: parseInt(days)
    });

    res.json({
      success: true,
      data: result,
      message: `Synced ${result.newActivities} new activities`
    });
  } catch (error) {
    console.error('Strava sync error:', error);

    // Handle specific errors
    if (error.message === 'Strava not connected') {
      return res.status(400).json({
        success: false,
        message: 'Strava is not connected. Please connect your Strava account first.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to sync Strava activities',
      error: error.message
    });
  }
});

/**
 * DELETE /api/v1/integrations/strava/disconnect
 * Disconnect Strava account
 * Requires authentication
 * Query params:
 *   - deleteActivities: if 'true', deletes all synced Strava activities
 */
router.delete('/strava/disconnect', auth, async (req, res) => {
  try {
    const deleteActivities = req.query.deleteActivities === 'true';
    const result = await StravaIntegrationService.disconnect(req.user.id, deleteActivities);

    res.json({
      success: true,
      message: deleteActivities
        ? `Strava disconnected and ${result.activitiesDeleted} activities deleted`
        : 'Strava disconnected successfully',
      data: { activitiesDeleted: result.activitiesDeleted }
    });
  } catch (error) {
    console.error('Strava disconnect error:', error);

    if (error.message === 'Strava not connected') {
      return res.status(400).json({
        success: false,
        message: 'Strava is not connected'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Strava',
      error: error.message
    });
  }
});

module.exports = router;
