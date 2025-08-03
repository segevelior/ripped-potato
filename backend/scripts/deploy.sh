#!/bin/bash

# Production Deployment Script for SynergyFit Backend
# Usage: ./scripts/deploy.sh [environment]
# Default environment: production

set -e  # Exit on any error

ENVIRONMENT=${1:-production}
echo "🚀 Starting deployment for environment: $ENVIRONMENT"

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

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    print_error "This script must be run from the backend directory"
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
required_vars=("NODE_ENV" "PORT" "MONGODB_URI" "JWT_SECRET")
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

# Validate MongoDB connection string format
if [[ ! $MONGODB_URI =~ ^mongodb(\+srv)?:// ]]; then
    print_error "Invalid MongoDB URI format in $ENV_FILE"
    exit 1
fi

print_status "MongoDB URI format is valid"

# Install production dependencies
print_status "Installing production dependencies..."
npm ci --only=production

# Run any database migrations or seeding if needed
if [ "$ENVIRONMENT" = "production" ]; then
    print_warning "Skipping database seeding in production"
else
    print_status "Running database setup..."
    npm run seed:prod 2>/dev/null || print_warning "Database seeding failed or not configured"
fi

# Create logs directory
mkdir -p logs
print_status "Logs directory created"

# Test the application
print_status "Testing application startup..."
timeout 10s npm run start:prod || {
    print_error "Application failed to start within 10 seconds"
    exit 1
}

print_status "✅ Deployment validation completed successfully!"
print_status "To start the application:"
echo "  npm run start:prod"
print_status "Health check will be available at:"
echo "  http://localhost:$PORT/api/v1/health"

# Optional: Start the application
read -p "Start the application now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting SynergyFit Backend..."
    npm run start:prod
fi