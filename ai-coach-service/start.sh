#!/bin/bash

echo "🚀 Starting AI Coach Service..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first:"
    echo "   brew services start mongodb-community"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "   Please update .env with your API keys"
    exit 1
fi

# Install dependencies if needed
if [ ! -d ".venv" ]; then
    echo "📦 Installing dependencies..."
    poetry install
fi

# Start the service
echo "✅ Starting FastAPI server on port 8001..."
poetry run uvicorn app.main:app --reload --port 8001