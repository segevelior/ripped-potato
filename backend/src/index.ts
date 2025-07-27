import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import healthRoutes from './routes/health';
import exercisesRoutes from './routes/exercises';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Ripped Potato API! 💪',
    description: 'A comprehensive fitness tracking backend',
    version: '1.0.0',
    status: 'Running',
    documentation: {
      health: '/health',
      api_info: '/api/v1',
      exercises: '/api/v1/exercises'
    },
    database: 'MongoDB connected',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/health', healthRoutes);
app.use('/api/v1/exercises', exercisesRoutes);

// API info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'Ripped Potato API v1',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      exercises: '/api/v1/exercises',
      // More endpoints will be added here
    },
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong!'
    },
    timestamp: new Date().toISOString()
  });
});

// Start server with database connection
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 API endpoints: http://localhost:${PORT}/api/v1`);
      console.log(`🍃 MongoDB connected successfully`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 