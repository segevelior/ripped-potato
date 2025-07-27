#!/bin/bash

echo "🚀 Setting up Ripped Potato Backend"
echo "=================================="

# Check if Poetry is installed
if ! command -v poetry &> /dev/null; then
    echo "❌ Poetry is not installed. Please install it first:"
    echo "   pip install poetry"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
poetry install

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your actual values"
fi

# Start MongoDB
echo "🍃 Starting MongoDB..."
docker-compose -f scripts/docker/docker-compose.yml up -d

# Wait for MongoDB to start
echo "⏳ Waiting for MongoDB to be ready..."
sleep 5

# Run setup test
echo "🧪 Running setup test..."
poetry run python tests/test_setup.py

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your .env file with proper values"
echo "2. Run the server: make dev"
echo "3. Visit API docs: http://localhost:8000/api/v1/docs" 