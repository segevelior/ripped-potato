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
router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/auth?error=google_auth_failed' }),
  async (req, res) => {
    try {
      console.log('Google OAuth callback - User authenticated:', req.user ? 'Yes' : 'No');
      
      if (!req.user) {
        console.error('No user object after Google authentication');
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth?error=no_user`);
      }

      // MCP connector consent flow: if state is `mcp:<requestId>`, render the
      // connector consent page for this now-authenticated user instead of
      // redirecting to the SPA with a login JWT.
      const state = req.query.state;
      if (typeof state === 'string' && state.startsWith('mcp:')) {
        const requestId = state.slice('mcp:'.length);
        return await renderGoogleConsentAfterAuth(req, res, requestId);
      }

      // Generate JWT token for the authenticated user
      const token = req.user.generateToken();
      console.log('JWT token generated successfully');
      
      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${token}`;
      console.log('Redirecting to:', redirectUrl);
      
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Google auth callback error:', error);
      console.error('Error stack:', error.stack);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
    }
  }
);

module.exports = router;