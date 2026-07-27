"""CoachQuestionService - fingerprint cache for the Today-dashboard coach
check-in question, so repeated dashboard opens don't each pay a fresh LLM call.

One live document per user (unique userId index; upsert replaces). A cached
question is served while its `inputsHash` still matches a fingerprint of the
freshly assembled prompt (see app/core/llm_cache.py) — so an athlete whose
context hasn't moved keeps the same question instead of paying for a
regeneration on a timer. `coach_question_cache_max_age_minutes` is a staleness
ceiling on top of that, not the mechanism: it bounds how long a held question
can linger and doubles as an env-only kill switch (0 = always regenerate).

Answering a question deletes the doc (see coach_question.py) so the next open
generates a new question that can reference the check-in. A Mongo TTL index on
expiresAt garbage-collects abandoned docs.
"""

from typing import Dict, Any, List, NamedTuple, Optional
from datetime import datetime, timedelta
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.llm_cache import PROMPT_VERSION

logger = structlog.get_logger()

COLLECTION_NAME = "coachQuestions"

# A doc is readable by get_matching only while its local date is in the
# fingerprint, and by get_pending_today only while localDate == today — both die
# at the end of the user's local day. 48h rather than exactly 24h leaves headroom
# for Mongo's ~60s TTL sweep granularity and the UTC-generatedAt / local-day
# boundary mismatch. (Docs written before this change keep a 7-day expiresAt;
# harmless, since both readers gate on the hash or on localDate long before.)
DOC_TTL_DAYS = 2


class CacheLookup(NamedTuple):
    """Result of a cache read. `reason` is what makes a miss diagnosable in
    prod — a subtly-volatile input shows up as a stream of "hash_changed" for
    athletes who changed nothing, and is otherwise completely silent."""

    doc: Optional[Dict[str, Any]]
    reason: str
    stored_hash: Optional[str] = None


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

    async def get_matching(
        self,
        user_id: str,
        inputs_hash: Optional[str],
        max_age_minutes: Optional[int] = None,
    ) -> CacheLookup:
        """Return the cached question only if it was generated from exactly
        these inputs — same context, same prompts, same model, same local date,
        same part-of-day bucket (all folded into inputs_hash by
        app/core/llm_cache.fingerprint).

        max_age_minutes is a ceiling, not the freshness mechanism: 0 disables the
        cache outright (kill switch), None means no ceiling.

        Docs written before fingerprinting have no inputsHash and simply miss
        once; the next generation rewrites them. Any Mongo error degrades to a
        miss — a cache read must never fail the endpoint.
        """
        if not inputs_hash:
            # Never match null-on-null: a doc saved without a hash (fingerprint
            # failure) exists only for get_pending_today, and must not serve.
            return CacheLookup(None, "no_hash")
        if max_age_minutes is not None and max_age_minutes <= 0:
            return CacheLookup(None, "disabled")
        try:
            doc = await self.collection.find_one({"userId": ObjectId(user_id)})
            if not doc:
                return CacheLookup(None, "no_doc")
            stored = doc.get("inputsHash")
            if stored != inputs_hash:
                return CacheLookup(None, "hash_changed", stored)
            generated_at = doc.get("generatedAt")
            if max_age_minutes:
                if not isinstance(generated_at, datetime):
                    return CacheLookup(None, "no_generated_at", stored)
                if datetime.utcnow() - generated_at > timedelta(minutes=max_age_minutes):
                    return CacheLookup(None, "max_age", stored)
            return CacheLookup(doc, "hit", stored)
        except Exception as e:
            logger.error(f"Error fetching cached coach question for {user_id}: {e}")
            return CacheLookup(None, "error")

    async def get_pending_today(self, user_id: str, today_date: str) -> Optional[Dict[str, Any]]:
        """Return the user's live question if it belongs to today's local date,
        regardless of whether it still matches the serve-cache fingerprint — an
        unanswered question stays visible on the dashboard even after its inputs
        have moved on. Answered questions are deleted (see invalidate), so any
        surviving doc is pending."""
        try:
            doc = await self.collection.find_one({"userId": ObjectId(user_id)})
            if doc and doc.get("localDate") == today_date:
                return doc
            return None
        except Exception as e:
            logger.error(f"Error fetching pending coach question for {user_id}: {e}")
            return None

    async def save(
        self,
        user_id: str,
        local_date: str,
        timezone: str,
        question: str,
        chips: List[str],
        source: str,
        inputs_hash: Optional[str] = None,
        part_of_day: Optional[str] = None,
    ) -> bool:
        """Upsert the user's cached question. Best-effort: callers must never
        fail the user-facing response on a persist error.

        Callers must NOT call this on a cache hit — generatedAt would creep
        forward on every dashboard open, letting a held question age invisibly
        and silently defeating the max_age_minutes ceiling.
        """
        now = datetime.utcnow()
        doc = {
            "userId": ObjectId(user_id),
            "localDate": local_date,
            "timezone": timezone,
            "question": question,
            "chips": chips,
            "source": source,
            # None = this doc can never serve a cache hit (fingerprinting
            # failed), but it still exists for get_pending_today.
            "inputsHash": inputs_hash,
            # Ops/debug only — neither is part of the match; both are already
            # folded into inputsHash.
            "partOfDay": part_of_day,
            "promptVersion": PROMPT_VERSION,
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
