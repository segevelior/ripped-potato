const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile, setPassword } = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { validateRegister, validateLogin, validateSetPassword } = require('../middleware/validation');
const passport = require('../config/passport');
const { renderGoogleConsentAfterAuth } = require('../mcp/consentController');

// @route   POST /api/v1/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', validateRegister, register);

// @route   POST /api/v1/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateLogin, login);

// @route   GET /api/v1/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', auth, getProfile);

// @route   PUT /api/v1/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, updateProfile);

// @route   POST /api/v1/auth/set-password
// @desc    Set (Google-only account) or change the account password
// @access  Private
router.post('/set-password', auth, validateSetPassword, setPassword);

// @route   GET /api/v1/auth/google
// @desc    Initiate Google OAuth login
// @access  Public
// Forwards an optional `state` param (e.g. `mcp:<requestId>` for the MCP
// connector consent flow) through the Google round-trip.
router.get('/google', (req, res, next) =>
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: req.query.state
  })(req, res, next)
);

// @route   GET /api/v1/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
// Uses a custom passport callback so we can route the three flows distinctly:
//   - `link:<jwt>`  → account-linking from Settings (success/error back to Settings)
//   - `mcp:<id>`    → MCP connector consent page
//   - (none)        → normal login/signup (issue a fresh JWT to the SPA)
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, async (err, user, info) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const state = req.query.state;
    const isLink = typeof state === 'string' && state.startsWith('link:');
    const isMcp = typeof state === 'string' && state.startsWith('mcp:');

    try {
      if (err) {
        console.error('Google auth callback error:', err);
        return res.redirect(isLink
          ? `${frontendUrl}/Settings?google=error&reason=server_error`
          : `${frontendUrl}/auth?error=oauth_failed&message=${encodeURIComponent(err.message)}`);
      }

      if (!user) {
        // Authentication/link failed. For a link attempt, surface a friendly
        // reason on the Settings page instead of bouncing to the login screen.
        if (isLink) {
          const reason = (info && info.reason) || 'google_link_failed';
          return res.redirect(`${frontendUrl}/Settings?google=error&reason=${encodeURIComponent(reason)}`);
        }
        return res.redirect(`${frontendUrl}/auth?error=google_auth_failed`);
      }

      // Downstream helpers (MCP consent) read the authenticated user off req.
      req.user = user;

      // MCP connector consent flow
      if (isMcp) {
        const requestId = state.slice('mcp:'.length);
        return await renderGoogleConsentAfterAuth(req, res, requestId);
      }

      // Account-linking succeeded: googleId is now bound to the already
      // logged-in user (done in the verify step). Keep their existing session
      // and return them to Settings with a confirmation.
      if (isLink) {
        return res.redirect(`${frontendUrl}/Settings?google=connected`);
      }

      // Normal login/signup: issue a fresh JWT for the SPA to consume.
      const token = user.generateToken();
      return res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('Google auth callback error:', error);
      console.error('Error stack:', error.stack);
      return res.redirect(isLink
        ? `${frontendUrl}/Settings?google=error&reason=server_error`
        : `${frontendUrl}/auth?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
    }
  })(req, res, next);
});

module.exports = router;