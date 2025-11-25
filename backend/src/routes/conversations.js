const express = require('express');
const router = express.Router();
const { auth: authMiddleware } = require('../middleware/auth');

// Configuration for AI service
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Helper function to proxy requests to Python AI Coach service
async function proxyToAIService(method, path, req, body = null) {
  const url = `${AI_SERVICE_URL}${path}`;
  const urlParts = new URL(url);
  const isHttps = urlParts.protocol === 'https:';
  const http = require(isHttps ? 'https' : 'http');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname + urlParts.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const request = http.request(options, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: response.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: response.statusCode, data: data });
        }
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    if (body) {
      request.write(body);
    }
    request.end();
  });
}

// GET /api/v1/conversations/history - Get user's conversation history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const path = `/api/v1/conversations/history?limit=${limit}&skip=${skip}`;

    const result = await proxyToAIService('GET', path, req);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation history',
      error: error.message
    });
  }
});

// GET /api/v1/conversations/:id - Get a specific conversation
router.get('/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const path = `/api/v1/conversations/${conversationId}`;

    const result = await proxyToAIService('GET', path, req);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation',
      error: error.message
    });
  }
});

// DELETE /api/v1/conversations/:id - Delete a conversation
router.delete('/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const path = `/api/v1/conversations/${conversationId}`;

    const result = await proxyToAIService('DELETE', path, req);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete conversation',
      error: error.message
    });
  }
});

// PATCH /api/v1/conversations/:id/title - Update conversation title
router.patch('/:conversationId/title', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.query;
    const path = `/api/v1/conversations/${conversationId}/title?title=${encodeURIComponent(title)}`;

    const result = await proxyToAIService('PATCH', path, req);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error updating conversation title:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update conversation title',
      error: error.message
    });
  }
});

// POST /api/v1/conversations/:id/feedback - Submit feedback for a message
router.post('/:conversationId/feedback', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const path = `/api/v1/conversations/${conversationId}/feedback`;
    const body = JSON.stringify(req.body);

    const result = await proxyToAIService('POST', path, req, body);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
});

// POST /api/v1/conversations - Create a new conversation
router.post('/', authMiddleware, async (req, res) => {
  try {
    const path = `/api/v1/conversations/`;
    const body = JSON.stringify(req.body);

    const result = await proxyToAIService('POST', path, req, body);

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create conversation',
      error: error.message
    });
  }
});

module.exports = router;
