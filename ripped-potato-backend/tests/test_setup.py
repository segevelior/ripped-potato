#!/usr/bin/env python3
"""
Quick setup test script to verify all components are working.
Run this after setting up the environment.
"""

import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def test_mongodb_connection():
    """Test MongoDB connection."""
    print("Testing MongoDB connection...")
    try:
        client = AsyncIOMotorClient("mongodb://localhost:27017")
        # Test the connection
        await client.server_info()
        print("✅ MongoDB connection successful!")
        return True
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("Make sure MongoDB is running: docker-compose up -d")
        return False

def test_imports():
    """Test if all required packages are installed."""
    print("\nTesting package imports...")
    required_packages = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("motor", "Motor (MongoDB driver)"),
        ("beanie", "Beanie ODM"),
        ("jose", "Python-JOSE (JWT)"),
        ("passlib", "Passlib"),
        ("pydantic_settings", "Pydantic Settings"),
    ]
    
    all_good = True
    for module, name in required_packages:
        try:
            __import__(module)
            print(f"✅ {name} installed")
        except ImportError:
            print(f"❌ {name} not found")
            all_good = False
    
    return all_good

async def main():
    print("Ripped Potato Backend Setup Test")
    print("=" * 40)
    
    # Test imports
    imports_ok = test_imports()
    
    # Test MongoDB
    mongo_ok = await test_mongodb_connection()
    
    print("\n" + "=" * 40)
    if imports_ok and mongo_ok:
        print("✅ All tests passed! You're ready to run the server.")
        print("\nNext step: uvicorn app.main:app --reload")
    else:
        print("❌ Some tests failed. Please check the errors above.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main()) 