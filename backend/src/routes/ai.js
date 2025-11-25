const express = require('express');
const router = express.Router();
const { auth: authMiddleware } = require('../middleware/auth');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration for AI provider
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // 'python' or 'openai'
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// Log configuration on module load
console.log('==============================================');
console.log('[AI CONFIG] AI_PROVIDER:', AI_PROVIDER);
console.log('[AI CONFIG] AI_SERVICE_URL:', AI_SERVICE_URL);
console.log('==============================================');

// Rate limiting for AI endpoints
const aiRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each user to 50 requests per windowMs
  message: 'Too many AI requests, please try again later.',
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Helper function to ensure JSON response
const parseAIResponse = (content) => {
  try {
    return JSON.parse(content);
  } catch (e) {
    // If parsing fails, return as message
    return { message: content };
  }
};

// Helper function to call Python AI service
async function callPythonAIService(prompt, req, schema = null) {
  try {
    // Use built-in fetch (Node 18+) or fall back to https module
    const url = `${AI_SERVICE_URL}/api/v1/chat/`;
    const body = JSON.stringify({
      message: prompt,
      context: {
        userId: req.user?.id,
        schema: schema
      }
    });
    
    // Use native https module for the request  
    const https = require('https'); // Use https for production
    const urlParts = new URL(url);
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: urlParts.hostname,
        port: urlParts.port,
        path: urlParts.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization,
          'Content-Length': Buffer.byteLength(body)
        }
      };
      
      const request = https.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response from AI service'));
            }
          } else {
            reject(new Error(`AI service returned status ${response.statusCode}`));
          }
        });
      });
      
      request.on('error', reject);
      request.write(body);
      request.end();
    });
  } catch (error) {
    throw error;
  }
}

// Generic chat endpoint
router.post('/chat', authMiddleware, aiRateLimit, async (req, res) => {
  try {
    const { prompt, response_json_schema } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    // Use Python AI service if configured
    if (AI_PROVIDER === 'python') {
      try {
        console.log('Using Python AI Coach Service...');
        const aiResponse = await callPythonAIService(prompt, req, response_json_schema);
        
        // Format response to match frontend expectations
        let formattedResponse = aiResponse.message;
        
        // If schema was requested, try to generate a structured response
        if (response_json_schema) {
          // Check if this is a CRUD proposal with pending change
          if (aiResponse.pending_change) {
            formattedResponse = {
              response: aiResponse.message,
              action: "crud_proposal",
              pending_change: aiResponse.pending_change
            };
          } else if (aiResponse.action) {
            // Python service provided action info
            formattedResponse = {
              response: aiResponse.message,
              action: aiResponse.action.type,
              ...aiResponse.action.data
            };
          } else {
            // Create a simple structured response
            formattedResponse = {
              action: "general_advice",
              response: aiResponse.message
            };
          }
        }
        
        return res.json({
          success: true,
          response: formattedResponse,
          pending_change: aiResponse.pending_change, // Pass through pending change
          tokens: 0, // Python service doesn't return tokens yet
          confidence: aiResponse.confidence,
          provider: 'python-ai-coach'
        });
        
      } catch (error) {
        console.error('Python AI service error:', error.message);
        console.error('Full error:', error);
        console.log('Falling back to OpenAI...');
        // Fall through to OpenAI implementation
      }
    }

    // Original OpenAI implementation
    let systemPrompt = `You are a helpful AI fitness coach for SynergyFit. 
    You help users with workout planning, exercise form, nutrition advice, and fitness goals.
    Always be encouraging, knowledgeable, and safety-conscious.`;
    
    if (response_json_schema) {
      systemPrompt += `\n\nYou must respond with valid JSON that matches this schema: ${JSON.stringify(response_json_schema)}`;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      ...(response_json_schema && { response_format: { type: "json_object" } })
    });

    const responseContent = completion.choices[0].message.content;
    const parsedResponse = response_json_schema ? parseAIResponse(responseContent) : responseContent;

    res.json({
      success: true,
      response: parsedResponse,
      tokens: completion.usage?.total_tokens || 0,
      provider: 'openai'
    });

  } catch (error) {
    console.error('AI chat error:', error);
    
    // Handle specific OpenAI errors
    if (error.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'AI service configuration error',
        response: { message: "I'm having trouble connecting to my AI service. Please try again later." }
      });
    }
    
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'AI service rate limit exceeded',
        response: { message: "I'm receiving too many requests right now. Please try again in a few moments." }
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process AI request',
      response: { message: "I encountered an error processing your request. Please try again." }
    });
  }
});

// Workout generation endpoint
router.post('/generate-workout', authMiddleware, aiRateLimit, async (req, res) => {
  try {
    const { preferences, goals, constraints, duration } = req.body;
    
    const prompt = `Generate a workout plan with these requirements:
    - Preferences: ${JSON.stringify(preferences || {})}
    - Goals: ${JSON.stringify(goals || [])}
    - Constraints: ${JSON.stringify(constraints || {})}
    - Duration: ${duration || '45-60 minutes'}
    
    Return a structured workout with warm-up, main exercises, and cool-down.
    Include sets, reps, rest times, and form tips.`;

    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        estimated_duration: { type: "number" },
        difficulty: { type: "string" },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              duration: { type: "number" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "number" },
                    reps: { type: "string" },
                    rest: { type: "string" },
                    notes: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: `You are a professional fitness trainer. Generate detailed workout plans that are safe, effective, and tailored to the user's needs. Always respond with JSON matching the provided schema.` 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const workout = parseAIResponse(completion.choices[0].message.content);

    res.json({
      success: true,
      workout,
      tokens: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Workout generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate workout',
      workout: null
    });
  }
});

// Progress analysis endpoint
router.post('/analyze-progress', authMiddleware, aiRateLimit, async (req, res) => {
  try {
    const { workoutHistory, goals, timeframe } = req.body;
    
    const prompt = `Analyze this fitness progress:
    - Recent workouts: ${JSON.stringify(workoutHistory || [])}
    - Goals: ${JSON.stringify(goals || [])}
    - Timeframe: ${timeframe || 'last 30 days'}
    
    Provide insights on:
    1. Progress towards goals
    2. Strengths and areas for improvement
    3. Recommendations for next steps
    4. Motivational feedback`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a supportive fitness coach analyzing user progress. Be encouraging while providing honest, actionable feedback.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    res.json({
      success: true,
      analysis: completion.choices[0].message.content,
      tokens: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Progress analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze progress',
      analysis: null
    });
  }
});

// Form check endpoint (text-based for now, video in future)
router.post('/check-form', authMiddleware, aiRateLimit, async (req, res) => {
  try {
    const { exercise, description, concerns } = req.body;
    
    const prompt = `Provide form tips for the exercise "${exercise}".
    ${description ? `User description: ${description}` : ''}
    ${concerns ? `Specific concerns: ${concerns}` : ''}
    
    Give clear, safety-focused advice on proper form, common mistakes, and modifications.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert fitness trainer focused on proper form and injury prevention. Provide clear, detailed form guidance.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 1000
    });

    res.json({
      success: true,
      tips: completion.choices[0].message.content,
      tokens: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Form check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to provide form tips',
      tips: null
    });
  }
});

// Streaming chat endpoint - proxies to Python AI Coach service
router.post('/stream', authMiddleware, aiRateLimit, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Check if Python service is configured
    console.log(`[STREAMING] AI_PROVIDER="${AI_PROVIDER}", AI_SERVICE_URL="${AI_SERVICE_URL}"`);

    if (AI_PROVIDER !== 'python') {
      console.log('[STREAMING] Falling back to non-streaming chat - AI_PROVIDER is not "python"');
      // Fallback to regular chat for non-Python providers
      return router.handle(Object.assign(req, {
        url: '/chat',
        body: { prompt: message }
      }), res);
    }

    console.log('[STREAMING] Using Python AI Coach streaming endpoint');

    // Set up SSE headers with CORS
    const origin = req.headers.origin;
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'none', // Disable compression for streaming
      'Transfer-Encoding': 'chunked' // Enable chunked transfer encoding
    };

    // Add CORS headers if origin is present
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    // Set status and headers
    res.writeHead(200, headers);
    // Flush headers immediately to establish the streaming connection
    res.flushHeaders();

    // Proxy to Python AI Coach streaming endpoint
    const urlParts = new URL(`${AI_SERVICE_URL}/api/v1/chat/stream`);
    const isHttps = urlParts.protocol === 'https:';
    const http = require(isHttps ? 'https' : 'http');

    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port,
      path: urlParts.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization,
        'x-stream': 'true'
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Pipe the streaming response directly to the client
      proxyRes.on('data', (chunk) => {
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        console.log('[STREAMING] Stream ended from AI Coach');
        res.end();
      });

      proxyRes.on('error', (error) => {
        console.error('[STREAMING] Proxy response error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      });
    });

    proxyReq.on('error', (error) => {
      console.error('[STREAMING] Proxy request error:', error);
      console.error('[STREAMING] Error details:', error.code, error.message);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to AI service' })}\n\n`);
      res.end();
    });

    // Send the request body - include conversation_id for message continuity
    const requestBody = JSON.stringify({
      message,
      conversation_id: req.body.conversation_id || null
    });
    proxyReq.write(requestBody);
    proxyReq.end();

  } catch (error) {
    console.error('Streaming error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to start streaming'
      });
    }
  }
});

// Status endpoint to check AI provider
router.get('/status', async (req, res) => {
  const status = {
    provider: AI_PROVIDER,
    providers: {
      current: AI_PROVIDER,
      available: ['openai', 'python'],
      python_service_url: AI_SERVICE_URL
    }
  };
  
  // Check if Python service is available
  if (AI_PROVIDER === 'python') {
    try {
      const https = require('https');
      const urlParts = new URL(`${AI_SERVICE_URL}/health`);
      
      await new Promise((resolve, reject) => {
        https.get({
          hostname: urlParts.hostname,
          port: urlParts.port,
          path: urlParts.pathname
        }, (response) => {
          if (response.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status ${response.statusCode}`));
          }
        }).on('error', reject);
      });
      
      status.python_service = 'online';
    } catch (error) {
      status.python_service = 'offline';
      status.error = error.message;
    }
  }
  
  res.json(status);
});

// Pending changes endpoints (proxy to Python AI Coach service)
router.post('/pending/confirm', authMiddleware, async (req, res) => {
  try {
    const { pending_change_id, action } = req.body;
    
    if (!pending_change_id || !action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'pending_change_id and action (accept/reject) are required'
      });
    }

    // Only proxy to Python service if it's configured
    if (AI_PROVIDER !== 'python') {
      return res.status(503).json({
        success: false,
        message: 'Pending changes require Python AI Coach service'
      });
    }

    // Proxy request to Python AI Coach service
    const url = `${AI_SERVICE_URL}/api/v1/ai/pending/confirm`;
    const body = JSON.stringify({
      pending_change_id,
      action
    });
    
    const https = require('https'); // Use https for production
    const urlParts = new URL(url);
    
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: urlParts.hostname,
        port: urlParts.port,
        path: urlParts.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization,
          'Content-Length': Buffer.byteLength(body)
        }
      };
      
      const request = https.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Invalid JSON response from AI service'));
            }
          } else {
            reject(new Error(`AI service returned status ${response.statusCode}: ${data}`));
          }
        });
      });
      
      request.on('error', reject);
      request.write(body);
      request.end();
    });

    res.json({
      success: true,
      ...response
    });

  } catch (error) {
    console.error('Pending change confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process pending change confirmation',
      error: error.message
    });
  }
});

module.exports = router;