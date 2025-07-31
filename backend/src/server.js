const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const exerciseRoutes = require('./routes/exercises');
const workoutRoutes = require('./routes/workouts');
const goalRoutes = require('./routes/goals');
const planRoutes = require('./routes/plans');
const predefinedWorkoutRoutes = require('./routes/predefinedWorkouts');
const externalActivityRoutes = require('./routes/externalActivities');
const disciplineRoutes = require('./routes/disciplines');
const workoutTypeRoutes = require('./routes/workoutTypes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato')
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// API Routes
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SynergyFit API is running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/exercises', exerciseRoutes);
app.use('/api/v1/workouts', workoutRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/predefined-workouts', predefinedWorkoutRoutes);
app.use('/api/v1/external-activities', externalActivityRoutes);
app.use('/api/v1/disciplines', disciplineRoutes);
app.use('/api/v1/workout-types', workoutTypeRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/v1/health`);
});