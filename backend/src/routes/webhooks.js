const express = require('express');
const StravaIntegrationService = require('../services/StravaIntegrationService');

const router = express.Router();

// ==================== STRAVA WEBHOOK ROUTES ====================

/**
 * GET /api/v1/webhooks/strava
 * Webhook subscription validation (Strava sends this to verify callback URL)
 * No auth required - Strava calls this directly
 */
router.get('/strava', async (req, res) => {
  try {
    // Handle both flat query params (hub.mode) and nested parsing (hub: { mode })
    // Express may parse "hub.mode" as nested object depending on query parser settings
    const hubMode = req.query['hub.mode'] || req.query.hub?.mode;
    const hubChallenge = req.query['hub.challenge'] || req.query.hub?.challenge;
    const hubVerifyToken = req.query['hub.verify_token'] || req.query.hub?.verify_token;

    console.log('Strava webhook validation request:', { hubMode, hubVerifyToken, rawQuery: req.query });

    const response = StravaIntegrationService.verifyWebhookSubscription(
      hubMode,
      hubChallenge,
      hubVerifyToken
    );

    // Strava expects the challenge to be echoed back
    res.json(response);

  } catch (error) {
    console.error('Strava webhook validation error:', error);
    res.status(403).json({
      success: false,
      message: 'Webhook validation failed',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/webhooks/strava
 * Receive webhook events from Strava
 * No auth required - Strava calls this directly
 */
router.post('/strava', async (req, res) => {
  try {
    const event = req.body;

    console.log('Strava webhook event received:', {
      object_type: event.object_type,
      object_id: event.object_id,
      aspect_type: event.aspect_type,
      owner_id: event.owner_id,
      subscription_id: event.subscription_id
    });

    // Respond immediately to acknowledge receipt (Strava requires response within 2 seconds)
    res.status(200).send('EVENT_RECEIVED');

    // Process event asynchronously
    setImmediate(async () => {
      try {
        const result = await StravaIntegrationService.handleWebhookEvent(event);
        console.log('Strava webhook event processed:', result);
      } catch (error) {
        console.error('Strava webhook event processing error:', error);
      }
    });

  } catch (error) {
    console.error('Strava webhook error:', error);
    // Still respond 200 to prevent Strava from retrying
    res.status(200).send('EVENT_RECEIVED');
  }
});

// ==================== WEBHOOK ADMIN ROUTES (for setup) ====================

/**
 * POST /api/v1/webhooks/strava/subscription
 * Create webhook subscription (admin/setup only)
 * This is typically done once during initial setup
 */
router.post('/strava/subscription', async (req, res) => {
  try {
    // Simple auth check - in production, use proper admin auth
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const { callbackUrl } = req.body;

    if (!callbackUrl) {
      return res.status(400).json({
        success: false,
        message: 'callbackUrl is required'
      });
    }

    const subscription = await StravaIntegrationService.createWebhookSubscription(callbackUrl);

    res.json({
      success: true,
      data: subscription,
      message: 'Webhook subscription created'
    });

  } catch (error) {
    console.error('Create webhook subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create webhook subscription',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/v1/webhooks/strava/subscription
 * Get current webhook subscription (admin only)
 */
router.get('/strava/subscription', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const subscriptions = await StravaIntegrationService.getWebhookSubscription();

    res.json({
      success: true,
      data: subscriptions
    });

  } catch (error) {
    console.error('Get webhook subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get webhook subscription',
      error: error.response?.data || error.message
    });
  }
});

/**
 * DELETE /api/v1/webhooks/strava/subscription/:id
 * Delete webhook subscription (admin only)
 */
router.delete('/strava/subscription/:id', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await StravaIntegrationService.deleteWebhookSubscription(req.params.id);

    res.json({
      success: true,
      message: 'Webhook subscription deleted'
    });

  } catch (error) {
    console.error('Delete webhook subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete webhook subscription',
      error: error.response?.data || error.message
    });
  }
});

module.exports = router;
