# Render Deployment Guide

## Environment Variables Configuration

### Backend Environment Variables (Required in Render Dashboard)

These environment variables MUST be set manually in the Render dashboard for security:

#### 1. **MONGODB_URI** (Required)
- **Description**: MongoDB connection string
- **Example**: `mongodb+srv://username:password@cluster.mongodb.net/synergyfit?retryWrites=true&w=majority`
- **Setup**: 
  - Get from MongoDB Atlas or your MongoDB provider
  - Include database name in the connection string
  - Ensure IP whitelist includes `0.0.0.0/0` for Render's dynamic IPs

#### 2. **JWT_SECRET** (Required)
- **Description**: Secret key for JWT token signing
- **Example**: A random 32+ character string
- **Generate**: `openssl rand -base64 32`
- **Important**: Must be kept secret and unique per environment

#### 3. **CORS_ORIGIN** (Required)
- **Description**: Frontend URL for CORS
- **Value**: Your frontend Render URL (e.g., `https://synergyfit-app.onrender.com`)
- **Note**: Set this AFTER the frontend is deployed and you have the URL

### Frontend Environment Variables (Required in Render Dashboard)

#### 1. **VITE_API_URL** (Required)
- **Description**: Backend API URL
- **Value**: Your backend Render URL (e.g., `https://synergyfit-api.onrender.com`)
- **Note**: Set this AFTER the backend is deployed and you have the URL

## Deployment Steps

### 1. Initial Deployment
1. Push your code to GitHub
2. Connect your GitHub repo to Render
3. Deploy the backend first (it will fail initially due to missing env vars)
4. Deploy the frontend (it will also fail initially)

### 2. Configure Backend
1. Go to your backend service in Render dashboard
2. Navigate to "Environment" tab
3. Add the required environment variables:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: Generate a secure random string
   - `CORS_ORIGIN`: Will be set after frontend deploys
4. Save and redeploy

### 3. Configure Frontend
1. Go to your frontend service in Render dashboard
2. Navigate to "Environment" tab
3. Add the required environment variable:
   - `VITE_API_URL`: Copy the backend service URL from step 2
4. Save and redeploy

### 4. Update Backend CORS
1. Go back to your backend service
2. Update `CORS_ORIGIN` with the frontend URL
3. Save and redeploy

### 5. Verify Deployment
Run the test script:
```bash
node test-render-deployment.js https://your-backend.onrender.com https://your-frontend.onrender.com
```

## Common Issues and Solutions

### Frontend "Not Found" Error
- **Cause**: Static files not being served correctly
- **Solution**: The updated render.yaml uses `--prefix` flag and correct publish path

### Backend API 404 Errors
- **Cause**: Testing root `/` instead of actual endpoints
- **Solution**: Test `/api/v1/health` endpoint

### CORS Errors
- **Cause**: CORS_ORIGIN not set or incorrect
- **Solution**: Ensure CORS_ORIGIN matches your frontend URL exactly

### Database Connection Errors
- **Cause**: MongoDB URI incorrect or IP not whitelisted
- **Solution**: 
  - Verify MongoDB URI is correct
  - Whitelist `0.0.0.0/0` in MongoDB Atlas

### Build Failures
- **Cause**: Using `cd` command in build scripts
- **Solution**: Updated to use `--prefix` flag in render.yaml

## Testing Endpoints

### Health Check
```bash
curl https://your-backend.onrender.com/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "environment": "production",
  "version": "1.0.0",
  "uptime": 123.456,
  "database": "connected"
}
```

### Frontend Routes
All these should return the React app HTML:
- `/` - Home page
- `/login` - Login page
- `/register` - Registration page
- `/workouts` - Workouts page

## Monitoring

1. Check Render dashboard for:
   - Build logs
   - Deploy logs
   - Runtime logs

2. Use the test script regularly to ensure both services are running

3. Monitor the health endpoint for database connectivity

## Security Notes

1. Never commit `.env` files with real values
2. Use Render's environment variable management
3. Rotate JWT_SECRET periodically
4. Keep MongoDB connection string secure
5. Use HTTPS for all production URLs