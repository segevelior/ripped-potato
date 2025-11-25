from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis

from app.config import get_settings, Settings
from app.api.v1 import health, chat, chat_stream, conversations
from app.services.conversation_service import ConversationService

logger = structlog.get_logger()

# Global clients
mongo_client = None
redis_client = None
db = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    settings = get_settings()
    
    # Startup
    global mongo_client, redis_client, db
    
    # Connect to MongoDB (existing database)
    mongo_client = AsyncIOMotorClient(settings.mongodb_url)
    db = mongo_client[settings.mongodb_database]
    app.state.db = db
    logger.info("Connected to MongoDB")

    # Ensure indexes for conversations collection
    conversation_service = ConversationService(db)
    await conversation_service.ensure_indexes()
    
    # Connect to Redis
    try:
        redis_client = redis.from_url(settings.redis_url)
        await redis_client.ping()  # Test connection
        app.state.redis = redis_client
        logger.info("Connected to Redis")
    except Exception as e:
        logger.warning(f"Could not connect to Redis: {e}. CRUD operations will be disabled.")
        redis_client = None
    
    yield
    
    # Shutdown
    mongo_client.close()
    if redis_client:
        await redis_client.close()
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

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {"service": "AI Coach Service", "version": "1.0.0", "status": "running"}

# Include routers
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(chat_stream.router, prefix="/api/v1/chat", tags=["chat-streaming"])
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["conversations"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"}
    )