const express = require('express');
const router = express.Router();
const { auth: authMiddleware } = require('../middleware/auth');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Fallback returned when the AI service is unreachable
const FALLBACK = {
  success: true,
  question: "How are you feeling before today's session? I can adjust it if you need.",
  chips: ['Fresh', 'A bit heavy', 'Cooked'],
  source: 'readiness check',
  fallback: true
};

// GET /api/v1/coach-question - Get a memory-driven coach check-in question for Today
router.get('/', authMiddleware, async (req, res) => {
  try {
    const url = `${AI_SERVICE_URL}/api/v1/coach-question`;
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
      res.status(200).json(FALLBACK);
    });

    proxyReq.end();
  } catch (error) {
    console.error('Error fetching coach question:', error);
    res.status(200).json(FALLBACK);
  }
});

// POST /api/v1/coach-question/reply - Short inline coach reply to a tapped answer
router.post('/reply', authMiddleware, async (req, res) => {
  const REPLY_FALLBACK = {
    success: true,
    reply: "Got it — I've noted that. Tap continue if you want to talk it through.",
    fallback: true
  };

  try {
    const body = JSON.stringify(req.body || {});
    const url = `${AI_SERVICE_URL}/api/v1/coach-question/reply`;
    const urlParts = new URL(url);
    const isHttps = urlParts.protocol === 'https:';
    const http = require(isHttps ? 'https' : 'http');

    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
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
      console.error('Error proxying coach reply to AI service:', error);
      res.status(200).json(REPLY_FALLBACK);
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (error) {
    console.error('Error fetching coach reply:', error);
    res.status(200).json(REPLY_FALLBACK);
  }
});

// POST /api/v1/coach-question/continue - Promote the mini check-in into a full conversation
router.post('/continue', authMiddleware, async (req, res) => {
  try {
    const body = JSON.stringify(req.body || {});
    const url = `${AI_SERVICE_URL}/api/v1/coach-question/continue`;
    const urlParts = new URL(url);
    const isHttps = urlParts.protocol === 'https:';
    const http = require(isHttps ? 'https' : 'http');

    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
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
      console.error('Error proxying coach continue to AI service:', error);
      res.status(200).json({ success: false, message: 'AI service unavailable' });
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (error) {
    console.error('Error creating coach conversation:', error);
    res.status(200).json({ success: false, message: 'error' });
  }
});

module.exports = router;
