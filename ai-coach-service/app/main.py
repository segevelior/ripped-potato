from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings, Settings
from app.api.v1 import health, chat

logger = structlog.get_logger()

# Global clients
mongo_client = None
db = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    settings = get_settings()
    
    # Startup
    global mongo_client, db
    
    # Connect to MongoDB (existing database)
    mongo_client = AsyncIOMotorClient(settings.mongodb_url)
    db = mongo_client[settings.mongodb_database]
    app.state.db = db
    logger.info("Connected to MongoDB")
    
    yield
    
    # Shutdown
    mongo_client.close()
    logger.info("Closed database connections")


app = FastAPI(
    title="AI Coach Service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(chat.router, prefix="/api/v1/ai/chat", tags=["chat"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )