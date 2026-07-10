const passport = require('passport');
const jwt = require('jsonwebtoken');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const normalizeEmail = require('../utils/normalizeEmail');

console.log('🔐 Initializing Google OAuth Strategy');
console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'NOT SET');
console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('⚠️  Google OAuth credentials missing! OAuth will not work.');
  module.exports = passport;
  return;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/v1/auth/google/callback',
      scope: ['profile', 'email'],
      // Needed so the verify callback can read `req.query.state` and tell an
      // account-linking request (`link:<jwt>`) apart from a normal login.
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google OAuth callback - Profile received:', profile.id);

        // ---- Account-linking flow -------------------------------------------
        // A logged-in user clicked "Connect Google" in Settings; the frontend
        // forwards their JWT as `state=link:<token>`. Bind this Google identity
        // to THAT user only — never match/create by email, which is what let a
        // different Google account silently switch or spawn an account.
        const state = req.query.state;
        if (typeof state === 'string' && state.startsWith('link:')) {
          const token = state.slice('link:'.length);
          let decoded;
          try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
          } catch (e) {
            return done(null, false, { reason: 'invalid_session' });
          }

          const currentUser = await User.findById(decoded.id);
          if (!currentUser) {
            return done(null, false, { reason: 'invalid_session' });
          }

          // Refuse to steal a Google identity already bound to a different user.
          const owner = await User.findOne({ googleId: profile.id });
          if (owner && !owner._id.equals(currentUser._id)) {
            return done(null, false, { reason: 'google_in_use' });
          }

          currentUser.googleId = profile.id;
          if (!currentUser.profilePicture) {
            currentUser.profilePicture = profile.photos?.[0]?.value;
          }
          currentUser.lastLogin = new Date();
          await currentUser.save();
          return done(null, currentUser);
        }
        // ---------------------------------------------------------------------

        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          // Update user info from Google if needed
          user.lastLogin = new Date();
          await user.save();
          return done(null, user);
        }

        // Check if user exists with same email. Normalize with the same canonical
        // rule used by register/login so a Google login links to (rather than
        // duplicates) an existing local account for the same address.
        const email = normalizeEmail(profile.emails[0].value);
        user = await User.findOne({ email });

        if (user) {
          // Link Google account to existing user
          user.googleId = profile.id;
          user.profilePicture = profile.photos[0]?.value;
          user.lastLogin = new Date();
          await user.save();
          return done(null, user);
        }

        // Create new user
        user = await User.create({
          googleId: profile.id,
          email,
          name: profile.displayName,
          profilePicture: profile.photos[0]?.value,
          isEmailVerified: true, // Google accounts are pre-verified
          authProvider: 'google',
          lastLogin: new Date()
        });

        console.log('New user created successfully:', user.email);
        done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error.message);
        console.error('Error stack:', error.stack);
        done(error, null);
      }
    }
  )
);

// Not using sessions, so no need for serialize/deserialize

module.exports = passport;