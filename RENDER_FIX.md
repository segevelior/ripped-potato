# Render Deployment Fix

## The Problem
Render is looking for files in the wrong path:
- Looking for: `/opt/render/project/src/backend/backend/package.json`
- Actual location: `/opt/render/project/src/backend/package.json`

This suggests Render's working directory is already `/opt/render/project/src/`

## Solution: Update Build Commands in Render Dashboard

### Backend Service Settings:
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: `backend` (set this in Render settings)

### Frontend Static Site Settings:
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist` (not frontend/dist)
- **Root Directory**: `frontend` (set this in Render settings)

## Alternative: If Root Directory Setting Doesn't Work

### Backend Service:
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`

### Frontend Static Site:
- **Build Command**: `cd frontend && npm install && npm run build`
- **Publish Directory**: `frontend/dist`

## Environment Variables Already Set (Good!)

### Backend (synergyfit-api):
✅ MONGODB_URI
✅ JWT_SECRET
✅ ALLOWED_ORIGINS
✅ NODE_ENV
✅ CORS_CREDENTIALS
✅ RATE_LIMIT settings

### Frontend (synergyfit-app):
❌ VITE_API_URL should be: `https://synergyfit-api.onrender.com/api` (not internal address)
✅ Other VITE_ variables

## Important Notes:
1. Don't use internal addresses for frontend env vars - browsers can't access them
2. The `--prefix` flag doesn't work as expected in Render's environment
3. Setting the "Root Directory" in Render is the cleanest solution