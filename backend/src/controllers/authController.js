const User = require('../models/User');
const { validationResult } = require('express-validator');
const { invalidateTodaysPick } = require('../utils/invalidateTodaysPick');

// Register new user
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { email, password, name, timezone } = req.body;

    // Check if user already exists. Select the password so we can tell a
    // Google-only account (no password) apart from a local one and guide the
    // user to the right sign-in method instead of a dead-end error.
    const existingUser = await User.findOne({ email }).select('+password');
    if (existingUser) {
      if (existingUser.googleId && !existingUser.password) {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered with Google sign-in. Please sign in with Google — you can add a password afterward in Settings.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user with timezone in settings
    const user = new User({
      email,
      password,
      name,
      settings: {
        timezone: timezone || 'UTC'
      }
    });
    await user.save();

    // Generate token
    const token = user.generateToken();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          profilePicture: user.profilePicture,
          role: user.role,
          profile: user.profile,
          settings: user.settings
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { email, password, timezone } = req.body;

    // Find user and include password
    let user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user signed up with Google and has no password
    if (!user.password && user.googleId) {
      return res.status(401).json({
        success: false,
        code: 'google_only',
        message: 'This account uses Google sign-in. Please sign in with Google.'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update timezone if provided (keeps it current with user's device)
    if (timezone) {
      user = await User.findByIdAndUpdate(
        user._id,
        { 'settings.timezone': timezone },
        { new: true }
      );
    }

    // Generate token
    const token = user.generateToken();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          profilePicture: user.profilePicture,
          role: user.role,
          profile: user.profile,
          settings: user.settings
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    // `req.user` excludes `password` (select: false). Do a lean, single-field
    // lookup (just `password`) to report whether the account can sign in with a
    // password — this endpoint is hit on most app loads, so keep it cheap.
    const withPassword = await User.findById(req.user._id).select('password').lean();

    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          phone: req.user.phone,
          dateOfBirth: req.user.dateOfBirth,
          address: req.user.address,
          profilePicture: req.user.profilePicture,
          authProvider: req.user.authProvider,
          // Which sign-in methods are active on this account
          hasPassword: !!(withPassword && withPassword.password),
          googleLinked: !!req.user.googleId,
          role: req.user.role,
          profile: req.user.profile,
          settings: req.user.settings,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error getting profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone, dateOfBirth, address, profilePicture, profile, settings } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (address !== undefined) updateData.address = address;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
    if (profile) {
      // Clients send '' for unset weight/height/gender, which would fail the
      // Number cast / gender enum. '' never means anything in this sub-schema,
      // so drop those keys instead of letting them wedge the whole update.
      const cleanProfile = Object.fromEntries(
        Object.entries(profile).filter(([, value]) => value !== '')
      );
      // Deep merge profile preferences
      const existingProfile = req.user.profile ? (req.user.profile.toObject ? req.user.profile.toObject() : req.user.profile) : {};
      updateData.profile = {
        ...existingProfile,
        ...cleanProfile,
        preferences: {
          ...(existingProfile.preferences || {}),
          ...(cleanProfile.preferences || {})
        }
      };
    }
    if (settings) {
      const existingSettings = req.user.settings ? (req.user.settings.toObject ? req.user.settings.toObject() : req.user.settings) : {};
      // Deep merge sportsNews (like profile.preferences above): a partial
      // update such as { sportsNews: { enabled: false } } must not wipe the
      // user's followed-sports list.
      updateData.settings = {
        ...existingSettings,
        ...settings,
        ...(settings.sportsNews
          ? { sportsNews: { ...(existingSettings.sportsNews || {}), ...settings.sportsNews } }
          : {})
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    // The day's cached AI pick bakes in the injury list it was generated with
    if (profile && profile.injuries !== undefined) {
      const oldInjuries = JSON.stringify(req.user.profile?.injuries || []);
      if (JSON.stringify(profile.injuries) !== oldInjuries) {
        invalidateTodaysPick(req.user._id);
      }
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          dateOfBirth: user.dateOfBirth,
          address: user.address,
          profilePicture: user.profilePicture,
          role: user.role,
          profile: user.profile,
          settings: user.settings
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};

// Set or change the account password.
// - Google-only accounts (no password yet) can set one directly — identity is
//   already proven by the valid JWT issued at Google login. This lets a user
//   who signed up with Google also sign in with email/password.
// - Accounts that already have a password must provide the correct
//   `currentPassword` to change it.
const setPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Changing an existing password requires verifying the current one.
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to change your password'
        });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password must be different from your current password'
        });
      }
    }

    user.password = newPassword; // hashed by the pre('save') hook
    await user.save();

    res.json({
      success: true,
      message: 'Password set successfully. You can now sign in with your email and password.'
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error setting password'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  setPassword
};