const express = require('express');
const router = express.Router();
const { auth: authMiddleware } = require('../middleware/auth');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// GET /api/v1/train-now - Get AI-generated workout suggestion for today
router.get('/', authMiddleware, async (req, res) => {
  try {
    const url = `${AI_SERVICE_URL}/api/v1/train-now`;
    const urlParts = new URL(url);
    const isHttps = urlParts.protocol === 'https:';
    const http = require(isHttps ? 'https' : 'http');

    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.status(proxyRes.statusCode).json(JSON.parse(data));
        } catch {
          res.status(proxyRes.statusCode).send(data);
        }
      });
    });

    proxyReq.on('error', (error) => {
      console.error('Error proxying to AI service:', error);
      res.status(500).json({
        success: false,
        suggestion: null,
        error: 'Unable to generate workout suggestion. You can go to the Calendar to add a workout for today.',
        source: 'error'
      });
    });

    proxyReq.end();
  } catch (error) {
    console.error('Error fetching train-now suggestion:', error);
    res.status(500).json({
      success: false,
      suggestion: null,
      error: 'Unable to generate workout suggestion. You can go to the Calendar to add a workout for today.',
      source: 'error'
    });
  }
});

module.exports = router;
