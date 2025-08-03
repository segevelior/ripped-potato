#!/bin/bash

# Production Deployment Script for SynergyFit Frontend
# Usage: ./scripts/deploy.sh [environment]
# Default environment: production

set -e  # Exit on any error

ENVIRONMENT=${1:-production}
echo "🚀 Starting frontend build for environment: $ENVIRONMENT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the frontend directory
if [ ! -f "package.json" ]; then
    print_error "This script must be run from the frontend directory"
    exit 1
fi

# Check if environment file exists
ENV_FILE=".env.${ENVIRONMENT}"
if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file $ENV_FILE not found"
    print_warning "Please create $ENV_FILE with your production configuration"
    exit 1
fi

print_status "Environment file $ENV_FILE found"

# Load environment variables for validation
export $(cat $ENV_FILE | grep -v '^#' | xargs)

# Validate required environment variables
required_vars=("VITE_API_URL" "VITE_ENV")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    print_error "Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

print_status "All required environment variables are set"

# Validate API URL format
if [[ ! $VITE_API_URL =~ ^https?:// ]]; then
    print_error "Invalid API URL format in $ENV_FILE. Must start with http:// or https://"
    exit 1
fi

print_status "API URL format is valid: $VITE_API_URL"

# Clean previous build
if [ -d "dist" ]; then
    print_status "Cleaning previous build..."
    rm -rf dist
fi

# Install dependencies
print_status "Installing dependencies..."
npm ci

# Build the application
print_status "Building application for $ENVIRONMENT..."
npm run build -- --mode $ENVIRONMENT

# Verify build output
if [ ! -d "dist" ]; then
    print_error "Build failed - dist directory not found"
    exit 1
fi

# Check if index.html exists
if [ ! -f "dist/index.html" ]; then
    print_error "Build failed - index.html not found in dist directory"
    exit 1
fi

# Get build size information
BUILD_SIZE=$(du -sh dist | cut -f1)
print_status "Build completed successfully!"
print_status "Build size: $BUILD_SIZE"

# List build files
print_status "Build contents:"
ls -la dist/

# Optional: Preview the build
read -p "Preview the production build? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting preview server..."
    print_status "Preview will be available at http://localhost:4173"
    npm run preview
fi

print_status "✅ Frontend build completed successfully!"
print_status "The dist/ directory is ready for deployment to your web server."