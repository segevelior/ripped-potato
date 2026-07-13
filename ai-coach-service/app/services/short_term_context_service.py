"""
ShortTermContextService - the sensei's working memory.

Long-term memories (usermemories) hold durable facts; this collection holds
SHORT-TERM context that should follow the user across conversations for a
couple of weeks and then disappear: dashboard check-in answers and summaries
of recently-ended conversations. Per-entry TTL of 14 days via expiresAt +
Mongo TTL index.

Injected (alongside memories) into the chat orchestrator, coach-question
generation, and train-now generation so all three stay consistent.
"""

import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

logger = structlog.get_logger()

COLLECTION_NAME = "shortTermContext"
CONVERSATIONS_COLLECTION = "chatConversations"

ENTRY_TTL_DAYS = 14
CONTENT_MAX_CHARS = 400
STALE_CONVERSATION_MINUTES = 30

SUMMARIZE_PROMPT = (
    "Summarize this coaching conversation in 2-3 sentences. Focus on what the "
    "athlete reported (fatigue, soreness, injuries, mood), decisions made, and "
    "anything the coach should remember over the next two weeks. Write in third "
    "person ('The athlete...'). Return ONLY the summary text."
)

EXTRACT_DURABLE_FACTS_PROMPT = (
    "You extract DURABLE facts about an athlete from a coaching exchange, to store "
    "in long-term memory. Durable = still useful weeks or months from now: "
    "injuries / health conditions, lasting preferences (training style, equipment, "
    "schedule), goals, and lifestyle constraints. EXCLUDE transient state (today's "
    "fatigue/soreness/mood), one-off logistics, and anything the coach merely "
    "explained (how-to answers are not facts about the athlete).\n"
    "You are given the athlete's EXISTING memories. DO NOT emit anything already "
    "covered by them — only genuinely NEW facts.\n"
    'Return ONLY a JSON object: {"facts": [{"content": one concise sentence, '
    '"category": one of health|preference|goal|lifestyle|general, "importance": '
    'one of high|medium|low, "tags": [short strings]}]}. Return {"facts": []} if '
    "nothing durable and new."
)

# Keep strong references to fire-and-forget tasks: the event loop only holds
# weak refs, so a bare create_task() can be garbage-collected mid-run.
_background_tasks: set = set()


def spawn_background(coro) -> None:
    """Fire-and-forget an async task without it being GC'd mid-run."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


class ShortTermContextService:
    """Short-term (14-day) context entries + lazy conversation summarization."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[COLLECTION_NAME]
        self.conversations = db[CONVERSATIONS_COLLECTION]

    async def ensure_indexes(self):
        """Create indexes for efficient querying + TTL cleanup"""
        try:
            await self.collection.create_index(
                [("userId", 1), ("createdAt", -1)],
                name="user_created_at"
            )
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

    async def add_entry(
        self,
        user_id: str,
        kind: str,
        content: str,
        meta: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Insert a short-term context entry. Best-effort: never raises."""
        try:
            now = datetime.utcnow()
            content = (content or "").strip()
            if not content:
                return False
            if len(content) > CONTENT_MAX_CHARS:
                content = content[:CONTENT_MAX_CHARS - 3] + "..."
            await self.collection.insert_one({
                "userId": ObjectId(user_id),
                "kind": kind,
                "content": content,
                "meta": meta or {},
                "createdAt": now,
                "expiresAt": now + timedelta(days=ENTRY_TTL_DAYS),
            })
            return True
        except Exception as e:
            logger.error(f"Error adding short-term context entry for {user_id}: {e}")
            return False

    async def get_recent(self, user_id: str, limit: int = 8) -> List[Dict[str, Any]]:
        """Most recent short-term entries, newest first."""
        try:
            cursor = self.collection.find(
                {"userId": ObjectId(user_id)}
            ).sort("createdAt", -1).limit(limit)
            return await cursor.to_list(limit)
        except Exception as e:
            logger.error(f"Error fetching short-term context for {user_id}: {e}")
            return []

    @staticmethod
    def format_for_prompt(entries: List[Dict[str, Any]]) -> str:
        """Render entries as a context block for the LLM. Empty string if none."""
        if not entries:
            return ""
        kind_labels = {"checkin": "check-in", "conversation_summary": "conversation"}
        lines = ["RECENT CONTEXT (short-term notes from the last 14 days, newest first):"]
        for entry in entries:
            created = entry.get("createdAt")
            date_str = created.strftime("%b %d") if isinstance(created, datetime) else ""
            label = kind_labels.get(entry.get("kind"), entry.get("kind", "note"))
            lines.append(f"- [{date_str}, {label}] {entry.get('content', '')}")
        return "\n".join(lines)

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join((text or "").lower().split())

    @classmethod
    def _is_duplicate(cls, candidate: str, existing_norm: List[str]) -> bool:
        """Cheap backstop dedup: substring either direction, or high Jaccard
        token overlap, against already-known (normalized) memory contents."""
        c = cls._normalize(candidate)
        if not c:
            return True
        c_tokens = set(c.split())
        for e in existing_norm:
            if not e:
                continue
            if c in e or e in c:
                return True
            e_tokens = set(e.split())
            if c_tokens and e_tokens:
                overlap = len(c_tokens & e_tokens) / len(c_tokens | e_tokens)
                if overlap >= 0.8:
                    return True
        return False

    async def promote_durable_facts(
        self,
        user_id: str,
        source_text: str,
        openai_client,
        settings,
        conversation_id: Optional[str] = None,
    ) -> int:
        """Extract durable facts from a coaching exchange and persist NEW ones to
        long-term usermemories. Best-effort; NEVER raises (callers rely on this so
        a failure can't release a summarizer claim). Returns count saved.
        """
        saved = 0
        try:
            if not getattr(settings, "memory_auto_promote_enabled", True):
                return 0
            source_text = (source_text or "").strip()
            if not source_text:
                return 0

            # Imported lazily to keep this module free of agent-layer imports.
            from app.core.agents.services.memory_service import MemoryService
            memory_service = MemoryService(self.db)

            # Load current memories fresh — both as dedup context for the extractor
            # and for the substring backstop. Callers may promote several sources
            # in a row, so this must be re-read per call, not cached.
            # Dedup must consider ALL memories, including DEACTIVATED ones: a memory
            # the user toggled off would otherwise be re-promoted every time the
            # fact is mentioned again. (get_user_memories filters to active — used
            # only for prompt injection — so read the raw doc here instead.)
            mem_doc = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            all_memories = (mem_doc or {}).get("memories", [])
            existing_contents = [m.get("content", "") for m in all_memories if m.get("content")]
            existing_block = "\n".join(f"- {c}" for c in existing_contents) or "(none)"

            prompt = (
                f"EXISTING MEMORIES:\n{existing_block}\n\n"
                f"COACHING EXCHANGE:\n{source_text}\n\n"
                f"{EXTRACT_DURABLE_FACTS_PROMPT}"
            )
            response = await openai_client.chat.completions.create(
                model=settings.openai_model_fast,
                messages=[{"role": "user", "content": prompt}],
                max_completion_tokens=400,
                response_format={"type": "json_object"},
                **settings.llm_tuning_params(temperature=0.2),
            )
            raw = (response.choices[0].message.content or "").strip()
            if not raw:
                return 0
            try:
                facts = json.loads(raw).get("facts", [])
            except Exception:
                logger.warning(f"promote_durable_facts: non-JSON extractor output for {user_id}")
                return 0
            if not isinstance(facts, list) or not facts:
                logger.info(f"Auto-promotion: 0 facts extracted for user {user_id}")
                return 0

            existing_norm = [self._normalize(c) for c in existing_contents]
            deduped = 0
            for fact in facts:
                if not isinstance(fact, dict):
                    continue
                content = (fact.get("content") or "").strip()
                if not content:
                    continue
                if self._is_duplicate(content, existing_norm):
                    deduped += 1
                    continue
                save_args = {
                    "content": content,
                    "category": fact.get("category", "general"),
                    "importance": fact.get("importance") or "medium",
                    "tags": fact.get("tags", []),
                    "meta": {
                        "origin": "auto_promotion",
                        **({"conversation_id": conversation_id} if conversation_id else {}),
                    },
                }
                result = await memory_service.save_memory(user_id, save_args)
                if result.get("success"):
                    saved += 1
                    existing_norm.append(self._normalize(content))  # guard intra-batch dupes

            if saved:
                await memory_service.enforce_cap(
                    user_id, getattr(settings, "memory_max_per_user", 60)
                )
            logger.info(
                f"Auto-promotion for user {user_id}: extracted={len(facts)} saved={saved} "
                f"deduped={deduped}"
            )
        except Exception as e:
            logger.error(f"promote_durable_facts failed for {user_id}: {e}")
        return saved

    async def summarize_stale_conversations(
        self,
        user_id: str,
        openai_client,
        settings,
        max_convs: int = 2,
    ) -> None:
        """Lazily summarize recently-ended conversations into short-term context.

        A conversation is "ended" once updatedAt is older than 30 minutes.
        Race-safety: each conversation is CLAIMED atomically (summarized_at set
        via find_one_and_update) BEFORE the LLM call, so concurrent triggers
        (dashboard load + new chat) can't double-summarize; on failure the claim
        is released so the next trigger retries.

        Designed to run via spawn_background() — never raises.
        """
        try:
            now = datetime.utcnow()
            stale_cutoff = now - timedelta(minutes=STALE_CONVERSATION_MINUTES)
            lookback = now - timedelta(days=ENTRY_TTL_DAYS)

            candidates = await self.conversations.find(
                {
                    "metadata.user_id": user_id,
                    "summarized_at": {"$exists": False},
                    "updatedAt": {"$lt": stale_cutoff, "$gte": lookback},
                    "messages.1": {"$exists": True},  # at least 2 messages
                },
                {"_id": 1}
            ).sort("updatedAt", -1).to_list(max_convs)

            for candidate in candidates:
                # Atomic claim: only one trigger wins this conversation
                conv = await self.conversations.find_one_and_update(
                    {"_id": candidate["_id"], "summarized_at": {"$exists": False}},
                    {"$set": {"summarized_at": now}},
                )
                if not conv:
                    continue  # another trigger claimed it

                messages = conv.get("messages", [])

                # Check-ins promoted via /continue are seeded with 3 turns the
                # user already saw — those are already covered by the "checkin"
                # entry. Only summarize if the user actually chatted further.
                if conv.get("checkin_seeded") and len(messages) <= 3:
                    continue  # claim kept: nothing new to summarize

                try:
                    transcript_lines = []
                    for msg in messages[-20:]:
                        role = "Athlete" if msg.get("role") == "human" else "Coach"
                        content = str(msg.get("content", ""))[:300]
                        transcript_lines.append(f"{role}: {content}")
                    transcript = "\n".join(transcript_lines)

                    response = await openai_client.chat.completions.create(
                        model=settings.openai_model_fast,
                        messages=[
                            {"role": "user", "content": f"{transcript}\n\n{SUMMARIZE_PROMPT}"},
                        ],
                        max_completion_tokens=150,
                        **settings.llm_tuning_params(temperature=0.3),
                    )
                    summary = response.choices[0].message.content.strip()
                    if not summary:
                        raise ValueError("Empty summary")

                    inserted = await self.add_entry(
                        user_id,
                        kind="conversation_summary",
                        content=summary,
                        meta={
                            "conversation_id": conv.get("conversation_id"),
                            "title": conv.get("title"),
                        },
                    )
                    if not inserted:
                        raise RuntimeError("Failed to insert summary entry")

                    logger.info(
                        f"Summarized conversation {conv.get('conversation_id')} "
                        f"into short-term context for user {user_id}"
                    )

                    # Promote durable facts from this conversation into long-term
                    # memory. ISOLATED in its own never-raising try: a promotion
                    # failure must NOT reach the outer except below, which unsets
                    # summarized_at and would cause re-summarization (duplicate
                    # summaries + doubled LLM cost). promote_durable_facts already
                    # never raises; this is belt-and-suspenders.
                    try:
                        await self.promote_durable_facts(
                            user_id,
                            source_text=transcript,
                            openai_client=openai_client,
                            settings=settings,
                            conversation_id=conv.get("conversation_id"),
                        )
                    except Exception as promo_err:
                        logger.error(
                            f"Promotion after summary failed (claim preserved) for "
                            f"conversation {conv.get('conversation_id')}: {promo_err}"
                        )
                except Exception as e:
                    # Release the claim so a later trigger retries
                    logger.error(f"Failed to summarize conversation {conv.get('conversation_id')}: {e}")
                    await self.conversations.update_one(
                        {"_id": candidate["_id"]},
                        {"$unset": {"summarized_at": ""}},
                    )
        except Exception as e:
            logger.error(f"summarize_stale_conversations failed for {user_id}: {e}")
