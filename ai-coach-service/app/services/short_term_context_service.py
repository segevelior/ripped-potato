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
    "Summarize what happened in THIS coaching conversation in 1-3 sentences, "
    "written in third person ('The athlete...'). Include only NEW information "
    "from this conversation: symptoms or conditions the athlete newly reported "
    "or said had changed, decisions made, and commitments for the coming days. "
    "Do NOT restate standing facts the coach already has on file (existing "
    "injuries, profile details, long-term goals) unless the athlete said they "
    "changed. Do NOT pad with negatives like 'no fatigue, soreness, or injuries "
    "were reported' — simply omit topics that didn't come up. If the "
    "conversation contains nothing worth remembering (greetings, small talk, a "
    "simple question the coach answered), respond with exactly: SKIP. "
    "Otherwise return ONLY the summary text."
)

EXTRACT_AND_RECONCILE_PROMPT = (
    "You maintain an athlete's LONG-TERM memory from a coaching exchange. A fact "
    "belongs in long-term memory ONLY if it will still matter in 4+ weeks: "
    "injuries and health conditions, lasting training preferences (style, "
    "equipment, schedule constraints), goals, and lifestyle facts.\n"
    "NEVER store: today's fatigue/soreness/sleep/mood; one-off requests or tasks "
    "(\"wanted to add X to a workout\", \"asked to move Friday's session\"); "
    "anything the coach did in the app (created/edited a workout, plan, or "
    "calendar event); questions the coach merely answered; plans for a specific "
    "date. When in doubt, store nothing.\n"
    "You are given the athlete's EXISTING memories, each with an id like [m3]. "
    "For each durable fact in the exchange decide:\n"
    "- UPDATE: it contradicts, corrects, or refreshes an existing memory (an "
    "injury got better or worse, a preference or goal changed) -> return that "
    "id and one concise sentence that REPLACES the old content.\n"
    "- ADD: genuinely new, covered by no existing memory.\n"
    "- Otherwise emit nothing for it (already known, transient, or one-off).\n"
    "Never re-add anything in the DELETED-BY-USER list.\n"
    'Return ONLY a JSON object: {"decisions": [{"action": "ADD" or "UPDATE", '
    '"target": "m3" (UPDATE only), "content": one concise sentence, "category": '
    'one of health|preference|goal|lifestyle|general, "importance": one of '
    'high|medium|low, "tags": [short strings]}]}. Return {"decisions": []} if '
    "nothing qualifies."
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

    async def get_recent(
        self,
        user_id: str,
        limit: int = 8,
        checkin_max_age_days: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Most recent short-term entries, newest first.

        checkin_max_age_days is a read-time gate: "checkin" entries older than
        that (transient state — sleep/fatigue/mood) are excluded from prompt
        context so the coach can't fixate on them. Conversation summaries keep
        the full window; the 14-day physical TTL is untouched.
        """
        try:
            query: Dict[str, Any] = {"userId": ObjectId(user_id)}
            if checkin_max_age_days is not None:
                cutoff = datetime.utcnow() - timedelta(days=checkin_max_age_days)
                query["$or"] = [
                    {"kind": {"$ne": "checkin"}},
                    {"createdAt": {"$gte": cutoff}},
                ]
            cursor = self.collection.find(query).sort("createdAt", -1).limit(limit)
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
        lines = [
            "RECENT CONTEXT (short-term notes, newest first; stale check-ins are "
            "already omitted — if a note conflicts with the profile or memories "
            "above, the newer information wins):"
        ]
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
        """Extract durable facts from a coaching exchange and reconcile them with
        long-term usermemories: ADD genuinely new facts, UPDATE (supersede)
        contradicted/refreshed ones. Best-effort; NEVER raises (callers rely on
        this so a failure can't release a summarizer claim). Returns write count.
        """
        written = 0
        try:
            if not getattr(settings, "memory_auto_promote_enabled", True):
                return 0
            source_text = (source_text or "").strip()
            if not source_text:
                return 0

            # Imported lazily to keep this module free of agent-layer imports.
            from app.core.agents.services.memory_service import MemoryService
            memory_service = MemoryService(self.db)

            # Load current memories fresh — callers may promote several sources
            # in a row, so this must be re-read per call, not cached. The raw doc
            # (not get_user_memories) because deactivated/tombstoned items are
            # needed as dedup context. Four buckets, per deactivation state:
            # - active: shown to the LLM with [mN] ids (UPDATE targets)
            # - user-deleted tombstones (deleted:true): DELETED-BY-USER list,
            #   never re-added
            # - script-retired (isActive:false + meta.retired): NOT in the dedup
            #   corpus — a restated fact REVIVES them (a wrong LLM retirement
            #   must be self-healing)
            # - user-deactivated via Settings (isActive:false, no meta.retired):
            #   dedup-suppressed like before — the user chose to hide it, only
            #   their Settings toggle brings it back
            mem_doc = await self.db.usermemories.find_one({"user": ObjectId(user_id)})
            all_memories = (mem_doc or {}).get("memories", [])

            active_items = []       # (label, item) — UPDATE targets
            deleted_contents = []   # tombstoned, never re-add
            retired_items = []      # script-retired, revive on restatement
            suppress_contents = []  # dedup corpus (active + deleted + deactivated)
            for m in all_memories:
                content = m.get("content", "")
                if not content:
                    continue
                if m.get("deleted"):
                    deleted_contents.append(content)
                    suppress_contents.append(content)
                elif not m.get("isActive", True):
                    if isinstance(m.get("meta"), dict) and m["meta"].get("retired"):
                        retired_items.append(m)
                    else:
                        suppress_contents.append(content)
                else:
                    active_items.append(m)
                    suppress_contents.append(content)

            # Per-call synthetic ids, mapped to ObjectIds from THIS snapshot —
            # a concurrent promotion builds its own map, so labels never cross.
            id_map = {}
            existing_lines = []
            current_year = datetime.utcnow().year
            for i, m in enumerate(active_items, start=1):
                label = f"m{i}"
                id_map[label] = m
                ts = m.get("updatedAt") or m.get("createdAt")
                if isinstance(ts, datetime):
                    fmt = "%b %d" if ts.year == current_year else "%b %d %Y"
                    noted = f", noted {ts.strftime(fmt)}"
                else:
                    noted = ""
                existing_lines.append(
                    f"[{label}] ({m.get('category', 'general')}/"
                    f"{m.get('importance', 'medium')}{noted}) {m.get('content', '')}"
                )
            existing_block = "\n".join(existing_lines) or "(none)"
            deleted_block = "\n".join(f"- {c}" for c in deleted_contents)

            prompt = f"EXISTING MEMORIES:\n{existing_block}\n\n"
            if deleted_block:
                prompt += f"DELETED-BY-USER (never re-add):\n{deleted_block}\n\n"
            prompt += (
                f"COACHING EXCHANGE:\n{source_text}\n\n"
                f"{EXTRACT_AND_RECONCILE_PROMPT}"
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
                decisions = json.loads(raw).get("decisions", [])
            except Exception:
                logger.warning(f"promote_durable_facts: non-JSON extractor output for {user_id}")
                return 0
            if not isinstance(decisions, list) or not decisions:
                logger.info(f"Auto-promotion: 0 decisions extracted for user {user_id}")
                return 0

            promo_meta = {
                "origin": "auto_promotion",
                **({"conversation_id": conversation_id} if conversation_id else {}),
            }
            suppress_norm = [self._normalize(c) for c in suppress_contents]
            added = updated = revived = deduped = invalid_target = 0
            for decision in decisions:
                if not isinstance(decision, dict):
                    continue
                content = (decision.get("content") or "").strip()
                if not content:
                    continue

                # UPDATE: supersede the targeted memory from this call's snapshot
                if decision.get("action") == "UPDATE":
                    # Models sometimes echo the bracketed label they saw
                    # ("[m1]") — normalize before lookup, or a miss silently
                    # degrades UPDATE to ADD and re-creates the very
                    # duplicate-contradiction problem supersession exists for.
                    target_key = str(decision.get("target") or "").strip().strip("[]").strip()
                    target = id_map.get(target_key)
                    if target is not None and target.get("_id") is not None:
                        result = await memory_service.update_memory_by_id(
                            user_id,
                            target["_id"],
                            content,
                            category=decision.get("category"),
                            importance=decision.get("importance"),
                            tags=decision.get("tags"),
                            meta_update={"last_supersession": promo_meta},
                        )
                        if result.get("success"):
                            updated += 1
                            written += 1
                            suppress_norm.append(self._normalize(content))
                            continue
                        # Write failed (e.g. target concurrently tombstoned):
                        # fall through to revive/ADD so the fact isn't silently
                        # dropped — the dedup backstop still guards re-adds.
                    else:
                        invalid_target += 1  # bogus/missing target: fall through to ADD

                # Restatement of a script-retired fact revives it (self-healing)
                revive_target = next(
                    (
                        r for r in retired_items
                        if r.get("_id") is not None
                        and self._is_duplicate(content, [self._normalize(r.get("content", ""))])
                    ),
                    None,
                )
                if revive_target is not None:
                    result = await memory_service.update_memory_by_id(
                        user_id,
                        revive_target["_id"],
                        content,
                        category=decision.get("category"),
                        importance=decision.get("importance"),
                        tags=decision.get("tags"),
                        revive=True,
                        meta_update={"last_supersession": promo_meta},
                    )
                    if result.get("success"):
                        revived += 1
                        written += 1
                        retired_items.remove(revive_target)
                        suppress_norm.append(self._normalize(content))
                    continue

                # ADD path: cheap dedup backstop, then persist
                if self._is_duplicate(content, suppress_norm):
                    deduped += 1
                    continue
                result = await memory_service.save_memory(user_id, {
                    "content": content,
                    "category": decision.get("category", "general"),
                    "importance": decision.get("importance") or "medium",
                    "tags": decision.get("tags", []),
                    "meta": promo_meta,
                })
                if result.get("success"):
                    added += 1
                    written += 1
                    suppress_norm.append(self._normalize(content))  # intra-batch dupes

            if added:
                await memory_service.enforce_cap(
                    user_id, getattr(settings, "memory_max_per_user", 60)
                )
            logger.info(
                f"Auto-promotion for user {user_id}: extracted={len(decisions)} "
                f"added={added} updated={updated} revived={revived} "
                f"deduped={deduped} invalid_target={invalid_target}"
            )
        except Exception as e:
            logger.error(f"promote_durable_facts failed for {user_id}: {e}")
        return written

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

                    # Trivial conversation — keep the claim (must NOT go through
                    # the ValueError path, which releases it and retries forever)
                    # and skip promotion too: nothing durable in small talk.
                    if summary.strip().strip(".").upper() == "SKIP":
                        logger.info(
                            f"Summary skipped (trivial) for conversation "
                            f"{conv.get('conversation_id')}"
                        )
                        continue

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
