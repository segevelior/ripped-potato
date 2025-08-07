# AI Coach Service Integration Test Plan

## Current Capabilities (READ-ONLY)
- ✅ Read user data from MongoDB
- ✅ Generate workout suggestions
- ✅ Provide exercise alternatives
- ✅ Return structured actions (JSON)
- ❌ Cannot save/modify data

## Testing Steps

### 1. Start All Services
```bash
# Terminal 1: MongoDB (if not running)
mongod

# Terminal 2: Backend (Node.js)
cd backend
npm run dev

# Terminal 3: AI Coach Service (Python)
cd ai-coach-service
poetry run uvicorn app.main:app --reload --port 8001

# Terminal 4: Frontend
cd frontend
npm run dev
```

### 2. Test Current Flow
The AI returns actions like:
```json
{
  "message": "I've created a chest workout for you!",
  "action": {
    "type": "create_workout",
    "data": {
      "name": "Chest Day",
      "exercises": [...]
    }
  }
}
```

But the action is NOT executed - frontend would need to:
1. Receive the action
2. Call backend API to create the workout
3. Show success/failure to user

### 3. Integration Approaches

#### Approach A: Frontend Handles Actions
```javascript
// In FloatingAIAssistant.jsx
const response = await fetch('http://localhost:8001/api/v1/ai/chat/', {
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ message })
});

const result = await response.json();

// Handle action if present
if (result.action?.type === 'create_workout') {
  // Call backend to create workout
  await api.predefinedworkouts.create(result.action.data);
}
```

#### Approach B: Backend Proxies to AI
```javascript
// In backend/routes/ai.js
router.post('/chat', async (req, res) => {
  // Forward to Python AI service
  const aiResponse = await fetch('http://localhost:8001/api/v1/ai/chat/', {
    headers: { 'Authorization': req.headers.authorization },
    body: JSON.stringify(req.body)
  });
  
  const result = await aiResponse.json();
  
  // Execute action if present
  if (result.action?.type === 'create_workout') {
    const workout = await Workout.create({
      ...result.action.data,
      userId: req.user.id
    });
    result.action.executed = true;
    result.action.workoutId = workout._id;
  }
  
  res.json(result);
});
```

## What Works Now vs What's Coming

### Works Now (Week 2) ✅
- "What chest exercises can I do?" → Lists exercises
- "Create a workout plan" → Returns plan (not saved)
- "How do I do a squat?" → Form tips

### Coming Next (Week 3-4) 🚧
- "Create a workout plan" → Saves to database
- "Add bench press to my exercises" → Creates exercise
- "Update my fitness goal" → Modifies goal
- "Track my workout" → Records session

## Quick Test Commands

```bash
# Test health
curl http://localhost:8001/health/

# Get a token from backend
TOKEN=$(curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq -r '.token')

# Test AI chat
curl -X POST http://localhost:8001/api/v1/ai/chat/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Create a chest workout for beginners"}'
```