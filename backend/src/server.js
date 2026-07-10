const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const winston = require('winston');
const passport = require('./config/passport');
require('dotenv').config();

// Configure Winston logger for production
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'synergyfit-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Console transport in ALL environments — on Render (and most container hosts)
// stdout is the log stream, so file-only logging is effectively invisible.
logger.add(new winston.transports.Console({
  format: process.env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.simple()
}));

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
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const conversationRoutes = require('./routes/conversations');
const suggestionsRoutes = require('./routes/suggestions');
const progressionRoutes = require('./routes/progressions');
const calendarRoutes = require('./routes/calendar');
const feedbackRoutes = require('./routes/feedback');
const memoriesRoutes = require('./routes/memories');
const integrationRoutes = require('./routes/integrations');
const webhookRoutes = require('./routes/webhooks');
const workoutLogRoutes = require('./routes/workoutLogs');
const trainNowRoutes = require('./routes/trainNow');
const mcpAuthRoutes = require('./routes/mcpAuth');
const mcpRoutes = require('./routes/mcp');

// Log Strava config on startup (helps debug production issues)
console.log('==============================================');
console.log('[STRAVA CONFIG] Client ID:', process.env.STRAVA_CLIENT_ID ? `${process.env.STRAVA_CLIENT_ID.substring(0, 5)}...` : 'NOT SET');
console.log('[STRAVA CONFIG] Client Secret:', process.env.STRAVA_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('[STRAVA CONFIG] Redirect URI:', process.env.STRAVA_REDIRECT_URI || 'NOT SET');
console.log('[STRAVA CONFIG] Webhook Verify Token:', process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ? 'SET' : 'NOT SET');
console.log('==============================================');

const app = express();

// Trust proxy for production deployment behind reverse proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Health check endpoint - placed before rate limiting to ensure Render health checks never get 429
app.get('/api/v1/health', (req, res) => {
  const healthCheck = {
    status: 'ok',
    message: 'SynergyFit API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };

  if (process.env.NODE_ENV !== 'production') {
    healthCheck.nodeVersion = process.version;
    healthCheck.platform = process.platform;
  }

  res.json(healthCheck);
});

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      // The MCP OAuth consent pages POST to /oauth/consent/approve, which 302s
      // to the connector's redirect_uri (claude.ai for hosted Claude, loopback
      // for Claude Code). Chrome enforces form-action across that redirect, so
      // 'self' alone silently blocks the navigation and the code never reaches
      // Claude. Allow the Claude callback origins.
      formAction: ["'self'", "https://claude.ai", "http://localhost:*", "http://127.0.0.1:*"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [process.env.FRONTEND_URL || 'http://localhost:5173'];

// MCP connector + OAuth paths are public API surfaces (Claude calls them
// server-side; MCP Inspector and other browser clients call them cross-origin).
// They must not go through the SPA origin allowlist.
const MCP_PUBLIC_PREFIXES = ['/mcp', '/.well-known', '/authorize', '/token', '/register', '/revoke', '/oauth/consent'];
const isMcpPublicPath = (path) =>
  MCP_PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

app.use(cors((req, callback) => {
  // Permissive CORS for MCP/OAuth endpoints; expose WWW-Authenticate so browser
  // clients can read the 401 challenge.
  if (isMcpPublicPath(req.path)) {
    return callback(null, {
      origin: true,
      credentials: false,
      exposedHeaders: ['WWW-Authenticate'],
      optionsSuccessStatus: 200
    });
  }

  // Existing SPA behaviour for all other paths.
  const origin = req.header('Origin');
  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true, optionsSuccessStatus: 200 });
  }
  const msg = `CORS policy violation: Origin ${origin} not allowed`;
  logger.warn(msg);
  return callback(new Error(msg), { credentials: true, optionsSuccessStatus: 200 });
}));

// Compression middleware - skip for SSE streaming endpoints
app.use(compression({
  filter: (req, res) => {
    // Don't compress SSE/streaming responses (AI stream + MCP Streamable HTTP)
    if (req.path === '/api/v1/ai/stream' || req.path === '/mcp' || req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Data sanitization
app.use(mongoSanitize());

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Passport middleware (without sessions for stateless JWT auth)
app.use(passport.initialize());

// Logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  }));
} else {
  app.use(morgan('dev'));
}

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(parseInt(process.env.REQUEST_TIMEOUT) || 30000);
  next();
});

// Database connection with production configuration
const mongooseOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4 // Use IPv4, skip trying IPv6
  // SSL is handled automatically by the mongodb+srv:// protocol
};

const { ensureIndexes, createSearchIndexes } = require('./utils/ensureIndexes');
const jobScheduler = require('./jobs/scheduler');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ripped-potato', mongooseOptions)
.then(async () => {
  const message = '✅ MongoDB connected successfully';
  console.log(message);
  logger.info(message, { database: mongoose.connection.name });

  // Ensure all indexes are created on startup
  try {
    await ensureIndexes(logger);
    await createSearchIndexes(logger);
    logger.info('✅ Database indexes verified');
  } catch (indexErr) {
    logger.warn('⚠️ Index verification had issues (non-fatal)', { error: indexErr.message });
  }

  // Start background job scheduler (only in production to avoid running during development)
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_JOB_SCHEDULER === 'true') {
    jobScheduler.start();
    logger.info('✅ Job scheduler started');
  }
})
.catch(err => {
  const message = '❌ MongoDB connection error';
  console.error(message, err);
  logger.error(message, { error: err.message, stack: err.stack });
  process.exit(1);
});

// MongoDB connection event handlers
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

// API Routes

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/exercises', exerciseRoutes);
app.use('/api/v1/workouts', workoutRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/predefined-workouts', predefinedWorkoutRoutes);
app.use('/api/v1/external-activities', externalActivityRoutes);
app.use('/api/v1/disciplines', disciplineRoutes);
app.use('/api/v1/workout-types', workoutTypeRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/suggestions', suggestionsRoutes);
app.use('/api/v1/progressions', progressionRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/memories', memoriesRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/workout-logs', workoutLogRoutes);
app.use('/api/v1/train-now', trainNowRoutes);

// MCP connector: OAuth authorization-server routes (mounted at root — the
// `.well-known` discovery documents are origin-rooted) and the /mcp endpoint.
app.use(mcpAuthRoutes);
app.use('/mcp', mcpRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error details
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Don't expose error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse = {
    success: false,
    message: isDevelopment ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { 
      stack: err.stack,
      details: err 
    })
  };
  
  // Send appropriate status code
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
  logger.warn('404 - Route not found:', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    message: 'Route not found',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5001;

// Graceful shutdown handling
const server = app.listen(PORT, () => {
  const message = `🚀 SynergyFit API server running on port ${PORT}`;
  console.log(message);
  console.log(`📍 Health check: http://localhost:${PORT}/api/v1/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  logger.info('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV,
    nodeVersion: process.version
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  jobScheduler.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  jobScheduler.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});