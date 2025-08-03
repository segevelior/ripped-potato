#!/bin/bash

# Pre-deployment check script for SynergyFit
# This script validates that everything is ready for Render deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} SynergyFit Pre-Deployment Check${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo
}

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_file() {
    if [ -f "$1" ]; then
        print_status "Found: $1"
        return 0
    else
        print_error "Missing: $1"
        return 1
    fi
}

check_directory() {
    if [ -d "$1" ]; then
        print_status "Found directory: $1"
        return 0
    else
        print_error "Missing directory: $1"
        return 1
    fi
}

print_header

# Check project structure
echo "🔍 Checking project structure..."
check_file "package.json" || exit 1
check_directory "backend" || exit 1
check_directory "frontend" || exit 1
check_file "render.yaml" || exit 1
echo

# Check backend files
echo "🔍 Checking backend files..."
cd backend
check_file "package.json" || exit 1
check_file "src/server.js" || exit 1
check_file ".env.production" || exit 1
check_file "scripts/test-atlas-connection.js" || exit 1

# Check backend dependencies
if [ -f "package.json" ]; then
    print_info "Checking backend dependencies..."
    if npm list --production --silent > /dev/null 2>&1; then
        print_status "Backend dependencies are valid"
    else
        print_warning "Backend dependencies may have issues - check with 'npm list'"
    fi
fi

# Test MongoDB connection
print_info "Testing MongoDB Atlas connection..."
if node scripts/test-atlas-connection.js > /dev/null 2>&1; then
    print_status "MongoDB Atlas connection working"
else
    print_error "MongoDB Atlas connection failed"
    echo "Run: node scripts/test-atlas-connection.js"
    exit 1
fi

cd ..
echo

# Check frontend files
echo "🔍 Checking frontend files..."
cd frontend
check_file "package.json" || exit 1
check_file "vite.config.js" || exit 1
check_file ".env.production" || exit 1
check_file "src/pages/Auth.jsx" || exit 1

# Check frontend dependencies
if [ -f "package.json" ]; then
    print_info "Checking frontend dependencies..."
    if npm list --silent > /dev/null 2>&1; then
        print_status "Frontend dependencies are valid"
    else
        print_warning "Frontend dependencies may have issues - check with 'npm list'"
    fi
fi

# Test frontend build
print_info "Testing frontend production build..."
if npm run build > /dev/null 2>&1; then
    print_status "Frontend builds successfully"
    if [ -d "dist" ]; then
        BUILD_SIZE=$(du -sh dist | cut -f1)
        print_info "Build size: $BUILD_SIZE"
    fi
    # Clean up test build
    rm -rf dist
else
    print_error "Frontend build failed"
    echo "Run: npm run build"
    exit 1
fi

cd ..
echo

# Check git status
echo "🔍 Checking git status..."
if git status --porcelain | grep -q .; then
    print_warning "You have uncommitted changes"
    echo "Consider committing changes before deployment"
else
    print_status "Git working directory is clean"
fi

# Check if on correct branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "feature/production-deployment" ]; then
    print_status "On deployment branch: $BRANCH"
else
    print_warning "Not on deployment branch (current: $BRANCH)"
    echo "Consider switching to feature/production-deployment"
fi

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 🎉 Pre-deployment check completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
print_info "Your app is ready for Render deployment!"
print_info "Follow the steps in RENDER_DEPLOYMENT.md"
echo
print_info "Quick deployment checklist:"
echo "1. Push code to GitHub: git push origin feature/production-deployment"
echo "2. Create Render account at render.com"
echo "3. Deploy backend web service first"
echo "4. Deploy frontend static site second"
echo "5. Update CORS and API URLs"
echo "6. Test your live app!"
echo