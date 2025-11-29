const User = require('../models/User');
const { validationResult } = require('express-validator');

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

    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create new user
    const user = new User({ email, password, name });
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

    const { email, password } = req.body;

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
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
      // Deep merge profile preferences
      const existingProfile = req.user.profile ? (req.user.profile.toObject ? req.user.profile.toObject() : req.user.profile) : {};
      updateData.profile = {
        ...existingProfile,
        ...profile,
        preferences: {
          ...(existingProfile.preferences || {}),
          ...(profile.preferences || {})
        }
      };
    }
    if (settings) {
      const existingSettings = req.user.settings ? (req.user.settings.toObject ? req.user.settings.toObject() : req.user.settings) : {};
      updateData.settings = { ...existingSettings, ...settings };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

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
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile
};