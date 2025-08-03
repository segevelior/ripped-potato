# 🚀 Render Deployment Guide for SynergyFit

This guide will help you deploy your SynergyFit app to Render with zero DevOps hassle.

## Step 1: Push to GitHub

Make sure your code is pushed to GitHub:
```bash
git push origin feature/production-deployment
```

## Step 2: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account
3. Authorize Render to access your repositories

## Step 3: Deploy Backend (API)

1. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select branch: `feature/production-deployment`

2. **Configure Backend Service**:
   - **Name**: `synergyfit-api`
   - **Region**: Oregon (US West)
   - **Branch**: `feature/production-deployment`
   - **Root Directory**: `backend`
   - **Environment**: Node
   - **Build Command**: `npm ci --only=production`
   - **Start Command**: `npm run start:prod`

3. **Set Environment Variables**:
   Click "Advanced" → "Add Environment Variable":
   ```
   NODE_ENV=production
   PORT=5001
   MONGODB_URI=mongodb+srv://synergy-fit:Ip9QFWH0TuNjdiqg@fitness.ymgwmek.mongodb.net/production?retryWrites=true&w=majority
   JWT_SECRET=264ed90127319f2841126d5d084fd3b391e75176f4ec2a241e9a0ab76fed98cf
   JWT_EXPIRE=7d
   CORS_CREDENTIALS=true
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   TRUST_PROXY=1
   SESSION_SECURE=true
   COOKIE_SECURE=true
   ```

4. **Deploy**: Click "Create Web Service"

## Step 4: Deploy Frontend

1. **Create Static Site**:
   - Click "New +" → "Static Site"
   - Connect same GitHub repository
   - Select branch: `feature/production-deployment`

2. **Configure Frontend**:
   - **Name**: `synergyfit-app`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`

3. **Set Environment Variables**:
   ```
   NODE_ENV=production
   VITE_ENV=production
   VITE_APP_NAME=SynergyFit
   VITE_APP_VERSION=1.0.0
   VITE_SECURE_COOKIES=true
   VITE_ENABLE_PWA=true
   ```

4. **Deploy**: Click "Create Static Site"

## Step 5: Connect Frontend to Backend

After both services deploy, you'll get URLs like:
- Backend: `https://synergyfit-api.onrender.com`
- Frontend: `https://synergyfit-app.onrender.com`

Update environment variables:

1. **Update Backend CORS**:
   - Go to backend service → Environment
   - Add: `CORS_ORIGIN=https://synergyfit-app.onrender.com`
   - Add: `FRONTEND_URL=https://synergyfit-app.onrender.com`

2. **Update Frontend API URL**:
   - Go to frontend service → Environment  
   - Add: `VITE_API_URL=https://synergyfit-api.onrender.com/api/v1`

3. **Redeploy Both Services** (they'll auto-redeploy with new env vars)

## Step 6: Test Your Deployed App

1. **Backend Health Check**:
   Visit: `https://synergyfit-api.onrender.com/api/v1/health`
   Should show: `{"status":"ok","message":"SynergyFit API is running"}`

2. **Frontend App**:
   Visit: `https://synergyfit-app.onrender.com`
   Should load your login page

3. **Test Authentication**:
   - Create a new account
   - Login with existing account
   - Test CRUD operations

## Step 7: Custom Domain (Optional)

If you have a domain:

1. **Backend**: 
   - Add custom domain like `api.yourdomain.com`
   - Update frontend `VITE_API_URL` to use custom domain

2. **Frontend**:
   - Add custom domain like `yourdomain.com`
   - Update backend `CORS_ORIGIN` to use custom domain

## Render Benefits You Get:

✅ **Automatic SSL** - HTTPS out of the box
✅ **Auto-deploys** - Pushes to GitHub auto-deploy
✅ **Free tier** - No cost for testing
✅ **Zero server management** - Render handles everything
✅ **Built-in monitoring** - See logs and metrics
✅ **Scaling** - Auto-scales based on traffic

## Troubleshooting

### Build Failing?
- Check build logs in Render dashboard
- Ensure all dependencies are in package.json
- Verify build commands are correct

### API Not Connecting?
- Check CORS_ORIGIN matches frontend URL exactly
- Verify MongoDB Atlas allows connections from 0.0.0.0/0
- Check environment variables are set correctly

### Frontend 404s?
- Ensure React Router redirects are configured
- Check that publish directory is `dist`
- Verify build command produces files in dist/

## Auto-Deployment

Once set up, any push to your main branch will:
1. Automatically build and deploy backend
2. Automatically build and deploy frontend
3. Zero downtime deployments
4. Instant rollback if issues occur

Your app will be live and production-ready! 🎉