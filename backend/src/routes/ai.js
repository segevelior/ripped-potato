const express = require('express');
const router = express.Router();
const { auth: authMiddleware } = require('../middleware/auth');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // Build system prompt based on schema if provided
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
      tokens: completion.usage?.total_tokens || 0
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

module.exports = router;