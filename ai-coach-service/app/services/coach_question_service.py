"""
CoachQuestionService - short-TTL cache for the Today-dashboard coach check-in
question, so repeated dashboard opens don't each pay a fresh LLM call.

One live document per user (unique userId index; upsert replaces). A cached
question is served only while fresh: generated within CACHE_TTL_MINUTES and
still on the same user-local calendar day. Answering a question deletes the
doc (see coach_question.py) so the next open generates a new question that
can reference the check-in. A Mongo TTL index on expiresAt garbage-collects
abandoned docs.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

logger = structlog.get_logger()

COLLECTION_NAME = "coachQuestions"

CACHE_TTL_MINUTES = 45
DOC_TTL_DAYS = 7


class CoachQuestionService:
    """Cache CRUD for the per-user Today-dashboard coach question."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[COLLECTION_NAME]

    async def ensure_indexes(self):
        """Create indexes for the single-live-doc-per-user cache + TTL cleanup"""
        try:
            await self.collection.create_index(
                "userId",
                unique=True,
                name="user_unique"
            )

            # TTL: Mongo deletes the doc once expiresAt passes
            await self.collection.create_index(
                "expiresAt",
                expireAfterSeconds=0,
                name="expires_at_ttl"
            )

            logger.info(f"Indexes ensured for {COLLECTION_NAME} collection")
            return True
        except Exception as e:
            logger.error(f"Failed to create {COLLECTION_NAME} indexes: {e}")
            return False

    async def get_fresh(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Return the cached question only while it's fresh: generated within
        CACHE_TTL_MINUTES and still on the same user-local calendar day. The
        doc carries its own timezone, so the hit path needs no profile load."""
        try:
            doc = await self.collection.find_one({"userId": ObjectId(user_id)})
            if not doc:
                return None
            generated_at = doc.get("generatedAt")
            if not isinstance(generated_at, datetime):
                return None
            if datetime.utcnow() - generated_at > timedelta(minutes=CACHE_TTL_MINUTES):
                return None
            try:
                tz = ZoneInfo(doc.get("timezone") or "UTC")
            except Exception:
                tz = ZoneInfo("UTC")
            if datetime.now(tz).strftime("%Y-%m-%d") != doc.get("localDate"):
                return None
            return doc
        except Exception as e:
            logger.error(f"Error fetching cached coach question for {user_id}: {e}")
            return None

    async def save(
        self,
        user_id: str,
        local_date: str,
        timezone: str,
        question: str,
        chips: List[str],
        source: str,
    ) -> bool:
        """Upsert the user's cached question. Best-effort: callers must never
        fail the user-facing response on a persist error."""
        now = datetime.utcnow()
        doc = {
            "userId": ObjectId(user_id),
            "localDate": local_date,
            "timezone": timezone,
            "question": question,
            "chips": chips,
            "source": source,
            "generatedAt": now,
            "updatedAt": now,
            "expiresAt": now + timedelta(days=DOC_TTL_DAYS),
        }
        filter_ = {"userId": ObjectId(user_id)}
        try:
            try:
                await self.collection.replace_one(filter_, {**doc, "createdAt": now}, upsert=True)
            except DuplicateKeyError:
                # Concurrent upsert race against the unique index — retry once,
                # this time it's a plain replace (last-write-wins is fine).
                await self.collection.replace_one(filter_, {**doc, "createdAt": now}, upsert=True)
            return True
        except Exception as e:
            logger.error(f"Error saving coach question for {user_id}: {e}")
            return False

    async def invalidate(self, user_id: str) -> None:
        """Best-effort: drop the cached question (the athlete answered it) so
        the next dashboard open generates a fresh one."""
        try:
            await self.collection.delete_one({"userId": ObjectId(user_id)})
        except Exception as e:
            logger.error(f"Error invalidating coach question for {user_id}: {e}")
