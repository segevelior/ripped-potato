#!/bin/bash

# Pre-deployment checklist for Render

echo "🔍 Render Pre-Deployment Checklist"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if render.yaml exists
echo "1. Checking render.yaml..."
if [ -f "render.yaml" ]; then
    echo -e "${GREEN}✓ render.yaml exists${NC}"
    
    # Check for --prefix usage
    if grep -q "npm.*--prefix" render.yaml; then
        echo -e "${GREEN}✓ Using --prefix flag for npm commands${NC}"
    else
        echo -e "${RED}✗ Not using --prefix flag (might cause issues)${NC}"
    fi
    
    # Check static publish path
    if grep -q "staticPublishPath:.*frontend/dist" render.yaml; then
        echo -e "${GREEN}✓ Static publish path configured${NC}"
    else
        echo -e "${RED}✗ Static publish path might be incorrect${NC}"
    fi
    
    # Check rewrite rules
    if grep -q "type: rewrite" render.yaml; then
        echo -e "${GREEN}✓ Rewrite rules configured for SPA${NC}"
    else
        echo -e "${YELLOW}⚠ No rewrite rules found (needed for React Router)${NC}"
    fi
else
    echo -e "${RED}✗ render.yaml not found${NC}"
fi

echo ""
echo "2. Checking environment files..."

# Check for production env templates
if [ -f "backend/.env.production.template" ]; then
    echo -e "${GREEN}✓ Backend .env.production.template exists${NC}"
else
    echo -e "${YELLOW}⚠ Backend .env.production.template not found${NC}"
fi

if [ -f "frontend/.env.production.template" ]; then
    echo -e "${GREEN}✓ Frontend .env.production.template exists${NC}"
else
    echo -e "${YELLOW}⚠ Frontend .env.production.template not found${NC}"
fi

# Check for actual .env files (should not exist in git)
if [ -f "backend/.env.production" ] || [ -f "frontend/.env.production" ]; then
    echo -e "${YELLOW}⚠ Production .env files found locally (should not be committed)${NC}"
fi

echo ""
echo "3. Checking build setup..."

# Check backend package.json
if [ -f "backend/package.json" ]; then
    if grep -q '"start":' backend/package.json; then
        echo -e "${GREEN}✓ Backend has start script${NC}"
    else
        echo -e "${RED}✗ Backend missing start script${NC}"
    fi
fi

# Check frontend package.json
if [ -f "frontend/package.json" ]; then
    if grep -q '"build":' frontend/package.json; then
        echo -e "${GREEN}✓ Frontend has build script${NC}"
    else
        echo -e "${RED}✗ Frontend missing build script${NC}"
    fi
fi

# Check if frontend build output exists locally
if [ -d "frontend/dist" ]; then
    echo -e "${YELLOW}⚠ Frontend dist folder exists locally (will be rebuilt on Render)${NC}"
fi

echo ""
echo "4. Testing local build..."

# Try frontend build
echo "Testing frontend build..."
if npm run build --prefix frontend > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend builds successfully${NC}"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
fi

echo ""
echo "5. Required Environment Variables"
echo "---------------------------------"
echo "Backend (set in Render dashboard):"
echo "  - MONGODB_URI (your MongoDB connection string)"
echo "  - JWT_SECRET (generate with: openssl rand -base64 32)"
echo "  - CORS_ORIGIN (set after frontend deploys)"
echo ""
echo "Frontend (set in Render dashboard):"
echo "  - VITE_API_URL (set after backend deploys)"
echo ""
echo "6. Deployment Order"
echo "-------------------"
echo "  1. Deploy backend first"
echo "  2. Add MONGODB_URI and JWT_SECRET"
echo "  3. Deploy frontend"
echo "  4. Add VITE_API_URL (backend URL)"
echo "  5. Update backend CORS_ORIGIN (frontend URL)"
echo "  6. Test with: node test-render-deployment.js <backend-url> <frontend-url>"
echo ""
echo -e "${GREEN}✅ Checklist complete!${NC}"