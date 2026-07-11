"""
RecommendationService - persists the daily "Train Now" recommendation so that:
1. Every surface (TrainNow page, Dashboard) reads the SAME suggestion for the day.
2. The sensei can answer "what did you suggest me today and why" from context.

One document per user per user-local date, TTL 30 days (expiresAt + Mongo TTL
index, same pattern as backend OAuth models).
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

logger = structlog.get_logger()

COLLECTION_NAME = "dailyRecommendations"

RECOMMENDATION_TTL_DAYS = 30
CONTEXT_SNAPSHOT_MAX_CHARS = 8000


class RecommendationService:
    """CRUD for the per-day persisted train-now recommendation."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[COLLECTION_NAME]

    async def ensure_indexes(self):
        """Create indexes for efficient querying + TTL cleanup"""
        try:
            # One recommendation per user per local date
            await self.collection.create_index(
                [("userId", 1), ("localDate", 1)],
                unique=True,
                name="user_local_date_unique"
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

    async def get_for_date(self, user_id: str, local_date: str) -> Optional[Dict[str, Any]]:
        """Fetch the persisted recommendation for a user-local date (YYYY-MM-DD)."""
        try:
            return await self.collection.find_one({
                "userId": ObjectId(user_id),
                "localDate": local_date
            })
        except Exception as e:
            logger.error(f"Error fetching recommendation for {user_id}/{local_date}: {e}")
            return None

    async def save(
        self,
        user_id: str,
        local_date: str,
        timezone: str,
        suggestion: Dict[str, Any],
        context_str: str,
        model: str,
    ) -> bool:
        """Upsert today's recommendation (force-refresh overwrites). Best-effort:
        callers must never fail the user-facing response on a persist error."""
        now = datetime.utcnow()
        doc = {
            "userId": ObjectId(user_id),
            "localDate": local_date,
            "timezone": timezone,
            "suggestion": suggestion,
            "reasoning": suggestion.get("reasoning", ""),
            "contextSnapshot": {
                "context_str": context_str[:CONTEXT_SNAPSHOT_MAX_CHARS],
                "model": model,
            },
            "source": "ai",
            "generatedAt": now,
            "updatedAt": now,
            "expiresAt": now + timedelta(days=RECOMMENDATION_TTL_DAYS),
        }
        filter_ = {"userId": ObjectId(user_id), "localDate": local_date}
        try:
            try:
                await self.collection.replace_one(filter_, {**doc, "createdAt": now}, upsert=True)
            except DuplicateKeyError:
                # Concurrent upsert race against the unique index — retry once,
                # this time it's a plain replace (last-write-wins is fine).
                await self.collection.replace_one(filter_, {**doc, "createdAt": now}, upsert=True)
            return True
        except Exception as e:
            logger.error(f"Error saving recommendation for {user_id}/{local_date}: {e}")
            return False

    async def get_recent(self, user_id: str, local_dates: List[str]) -> List[Dict[str, Any]]:
        """Fetch recommendations for a small set of local dates (e.g. today + yesterday),
        projected down to what prompt injection needs."""
        try:
            cursor = self.collection.find(
                {"userId": ObjectId(user_id), "localDate": {"$in": local_dates}},
                {
                    "localDate": 1,
                    "reasoning": 1,
                    "suggestion.type": 1,
                    "suggestion.name": 1,
                    "suggestion.estimated_duration": 1,
                    "suggestion.difficulty_level": 1,
                }
            ).sort("localDate", -1)
            return await cursor.to_list(len(local_dates))
        except Exception as e:
            logger.error(f"Error fetching recent recommendations for {user_id}: {e}")
            return []

    @staticmethod
    def format_for_prompt(recs: List[Dict[str, Any]], today_date: str) -> str:
        """Render recommendations as a context block for the LLM. Empty string if none."""
        if not recs:
            return ""
        lines = ["TRAINING RECOMMENDATIONS YOU GAVE (Train Now — you already suggested these, be consistent with them):"]
        for rec in recs:
            local_date = rec.get("localDate", "")
            label = f"TODAY ({local_date})" if local_date == today_date else local_date
            suggestion = rec.get("suggestion") or {}
            reasoning = (rec.get("reasoning") or "").strip()
            if len(reasoning) > 300:
                reasoning = reasoning[:297] + "..."
            if suggestion.get("type") == "rest":
                desc = "Rest Day"
            else:
                name = suggestion.get("name", "Workout")
                duration = suggestion.get("estimated_duration")
                level = suggestion.get("difficulty_level")
                details = ", ".join(str(d) for d in [f"{duration} min" if duration else None, level] if d)
                desc = f'Workout "{name}"' + (f" ({details})" if details else "")
            line = f"- {label}: {desc}"
            if reasoning:
                line += f" Why: {reasoning}"
            lines.append(line)
        return "\n".join(lines)
