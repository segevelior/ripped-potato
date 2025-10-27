# Local Testing Guide for Streaming Feature

This guide helps you run all services locally to test the streaming feature.

## Prerequisites

1. **Redis** - Must be running locally
   ```bash
   # Check if Redis is running
   redis-cli ping
   # Should respond with: PONG

   # If not running, start Redis:
   # macOS (with Homebrew):
   brew services start redis
   # Linux:
   sudo systemctl start redis
   ```

2. **Python Environment** - For AI Coach service
   ```bash
   cd ai-coach-service
   poetry install  # or pip install -r requirements.txt
   ```

3. **Node.js Dependencies**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd frontend
   npm install
   ```

## Running All Services

### Option 1: VS Code Debug (Recommended)

1. Open VS Code
2. Go to Run and Debug (⌘+Shift+D or Ctrl+Shift+D)
3. Select **"🔥 Full Stack (All Services)"** from the dropdown
4. Click the green play button

This will start all three services:
- 🎯 Backend on http://localhost:5001
- 🤖 AI Coach Service on http://localhost:8001
- ⚛️ Frontend on http://localhost:5173

### Option 2: Manual Terminal Windows

Open 3 terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - AI Coach Service:**
```bash
cd ai-coach-service
poetry run uvicorn app.main:app --reload --port 8001
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

## Testing Streaming Feature

1. **Open the app** at http://localhost:5173

2. **Login** with your account

3. **Open the floating AI chat** (chat icon in bottom right)

4. **Verify streaming UI:**
   - You should see a ⚡ icon in the chat header
   - Click it to toggle streaming ON/OFF
   - You should see "Streaming" text next to the icon when ON
   - There should be a "Clear Chat" button below the input field

5. **Test streaming:**
   - Make sure streaming is toggled ON (⚡ should be highlighted)
   - Ask: "Create a 15 minute core workout"
   - You should see:
     - Text appearing character by character (not all at once)
     - Natural reasoning like "Let me create a workout for you..."
     - The cursor blinking as tokens stream in

6. **Test non-streaming:**
   - Toggle streaming OFF
   - Ask the same question
   - Response should appear all at once (no character-by-character)

## Troubleshooting

### Streaming not working?

1. **Check AI_PROVIDER is set:**
   ```bash
   grep AI_PROVIDER backend/.env
   # Should show: AI_PROVIDER=python
   ```

2. **Check AI Coach service is running:**
   ```bash
   curl http://localhost:8001/health
   # Should respond with: {"status":"ok"}
   ```

3. **Check backend can reach AI Coach:**
   ```bash
   curl http://localhost:5001/api/v1/ai/status
   # Should show: "python_service":"online"
   ```

4. **Check browser console** for errors (F12)

### Redis errors?

Make sure Redis is running:
```bash
redis-cli ping
# If no response, start Redis:
brew services start redis  # macOS
```

### Python module errors?

```bash
cd ai-coach-service
poetry install  # Reinstall dependencies
```

## Environment Variables Summary

All environment variables are pre-configured in the `.env` files:

- **backend/.env**: Points to Atlas MongoDB, AI_PROVIDER=python, AI_SERVICE_URL=http://localhost:8001
- **ai-coach-service/.env**: Points to same MongoDB, has JWT secret matching backend
- **Frontend**: Uses VITE_API_URL=http://localhost:5001 (set in launch.json)

## What to Look For

When testing, verify:
- [x] Streaming toggle (⚡) is visible
- [x] "Clear Chat" button is present
- [x] Tokens stream character-by-character when streaming ON
- [x] AI shows reasoning steps ("Let me...", "I'll...")
- [x] Can toggle between streaming/non-streaming modes
- [x] Both modes work correctly

## Differences from Production

Local setup uses:
- `http://` instead of `https://`
- Port 8001 for AI Coach (production uses deployed URL)
- Local Redis at localhost:6379
- Atlas MongoDB (same as production, different database)
