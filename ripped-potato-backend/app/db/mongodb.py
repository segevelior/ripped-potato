from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class MongoDB:
    client: AsyncIOMotorClient = None
    database = None


db = MongoDB()


async def connect_to_mongo():
    """Create database connection."""
    logger.info("Connecting to MongoDB...")
    db.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db.database = db.client[settings.DATABASE_NAME]
    
    # Import all document models here
    from app.models.user import User
    from app.models.exercise import Exercise
    
    # Initialize beanie with document models
    await init_beanie(
        database=db.database,
        document_models=[
            User,
            Exercise,
            # Add more models here as we create them
        ]
    )
    logger.info("Connected to MongoDB!")


async def close_mongo_connection():
    """Close database connection."""
    logger.info("Closing MongoDB connection...")
    db.client.close()
    logger.info("MongoDB connection closed!") 