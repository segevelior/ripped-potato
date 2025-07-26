import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

// Health check endpoint
router.get('/', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({
    success: true,
    message: 'Ripped Potato Backend is running!',
    database: {
      type: 'MongoDB',
      status: dbStatus,
      name: mongoose.connection.name
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Database status endpoint
router.get('/db', (req: Request, res: Response) => {
  const connection = mongoose.connection;
  
  res.json({
    success: true,
    database: {
      status: connection.readyState === 1 ? 'connected' : 'disconnected',
      name: connection.name,
      host: connection.host,
      port: connection.port,
      collections: Object.keys(connection.collections)
    },
    timestamp: new Date().toISOString()
  });
});

export default router; 