const passport = require('passport');
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
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google OAuth callback - Profile received:', profile.id);
        
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