#!/usr/bin/env python3
"""
Quick test script to verify the AI Coach Service is working
"""
import asyncio
import httpx
import json
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:8001"
TEST_TOKEN = None  # We'll get this from the Node.js backend

async def test_health():
    """Test health endpoints"""
    async with httpx.AsyncClient() as client:
        # Test basic health
        response = await client.get(f"{BASE_URL}/health/")
        print("✓ Health check:", response.json())
        
        # Test readiness (MongoDB connection)
        response = await client.get(f"{BASE_URL}/health/ready")
        print("✓ Readiness check:", response.json())
        return response.status_code == 200

async def get_token_from_backend():
    """Get a valid JWT token from the Node.js backend"""
    async with httpx.AsyncClient() as client:
        # Login to get a token
        response = await client.post(
            "http://localhost:5001/api/v1/auth/login",
            json={
                "email": "test@example.com",  # Use your test account
                "password": "password123"
            }
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"Failed to get token: {response.status_code}")
            print("Please ensure you have a test user in the Node.js backend")
            return None

async def test_chat(token):
    """Test chat endpoint with authentication"""
    if not token:
        print("⚠️  No token available, skipping chat test")
        return False
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/v1/ai/chat/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "message": "What's a good beginner chest workout?",
                "context": {}
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✓ Chat response received:")
            print(f"  Message: {result['message'][:100]}...")
            return True
        else:
            print(f"✗ Chat failed: {response.status_code}")
            print(f"  Response: {response.text}")
            return False

async def main():
    print("🧪 Testing AI Coach Service\n")
    
    # Test health endpoints
    print("1. Testing health endpoints...")
    health_ok = await test_health()
    
    if not health_ok:
        print("⚠️  MongoDB might not be connected")
        print("   Make sure MongoDB is running locally")
        return
    
    print("\n2. Getting auth token from Node.js backend...")
    token = await get_token_from_backend()
    
    if token:
        print(f"✓ Got token: {token[:20]}...")
        
        print("\n3. Testing chat endpoint...")
        await test_chat(token)
    else:
        print("\n⚠️  Authentication test skipped")
        print("   To test the chat endpoint:")
        print("   1. Make sure the Node.js backend is running")
        print("   2. Create a test user or use existing credentials")
        print("   3. Update the email/password in this script")
    
    print("\n✅ Basic tests complete!")
    print("\nTo manually test the chat endpoint:")
    print(f"curl -X POST {BASE_URL}/api/v1/ai/chat/ \\")
    print('  -H "Authorization: Bearer YOUR_TOKEN" \\')
    print('  -H "Content-Type: application/json" \\')
    print('  -d \'{"message": "Create a workout plan"}\'')

if __name__ == "__main__":
    asyncio.run(main())