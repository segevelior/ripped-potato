from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Dict

router = APIRouter()


@router.get("/")
async def health_check() -> Dict[str, str]:
    """Basic health check endpoint"""
    return {
        "status": "healthy",
        "service": "AI Coach Service",
        "version": "1.0.0"
    }


@router.get("/ready")
async def readiness_check() -> Dict[str, str]:
    """Readiness check - verifies MongoDB connection"""
    from app.main import db
    
    if db is None:
        return {
            "status": "not ready",
            "database": "disconnected"
        }
    
    # Try to ping MongoDB
    try:
        await db.command("ping")
        return {
            "status": "ready",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "not ready",
            "database": "error",
            "error": str(e)
        }