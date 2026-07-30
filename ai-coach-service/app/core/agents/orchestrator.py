"""
Enhanced Agent Orchestrator - OpenAI with comprehensive fitness tools
"""

import asyncio
import base64
import json
import re
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, AsyncGenerator
from openai import AsyncOpenAI
import structlog
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.text_utils import dedupe_repeated_response
from app.core.agents.tool_definitions import get_all_tools
from app.core.agents.reflection_config import REFLECTION_CONFIG
from app.core.agents.reflection_prompt import REFLECTION_SYSTEM_PROMPT, REFLECTION_USER_PROMPT
from app.core.agents.services import (
    ExerciseService,
    SessionService,
    PlanService,
    GoalService,
    CalendarService,
    SearchService,
    MemoryService,
)
from app.core.agents.services.calendar_service import format_calendar_anchors
from app.core.agents.interest_mix import (
    build_interest_mix_block,
    load_recent_discipline_counts,
    resolve_interest_disciplines,
)
from app.services.attachment_service import AttachmentService
from app.services.coach_question_service import CoachQuestionService
from app.services.recommendation_service import RecommendationService
from app.services.short_term_context_service import ShortTermContextService
# Importing the skills package registers every skill via the @skill decorator.
from app.core.agents.skills import (
    SkillContext,
    get_skill_definitions,
    get_skill_handler,
)

logger = structlog.get_logger()

# Messages that reference the user's OWN plan/calendar/workouts must be grounded
# in their real data — force at least one tool call on the first LLM round so the
# model reads the data instead of answering generically (see prompts.py principle 1).
# NOTE: this matches USER UTTERANCES, not our vocabulary. Users will say
# "workout" forever, so every "workout" alternative below is permanent — the
# session/rename is ADDITIVE here: session twins were added alongside, never
# replacing a workout pattern. Same rule for the multi-sport twins (ride /
# climb / run): a session is any training activity, and users name the sport.
_GROUNDING_INTENT_RE = re.compile(
    r"\bmy\s+(plan|plans|workout|workouts|program|calendar|schedule|training|routine|session|sessions|ride|rides|climb|climbs|run|runs|history|week)\b"
    r"|\b(scheduled|swap|replace|substitute|reschedule|move|skip)\b"
    r"|\bbased on my\b"
    r"|\bwhat('s| is) (on |in )?(my|the) (calendar|schedule)\b"
    r"|\b(today|tomorrow|this week|next week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)('s)? (workout|session|ride|climb|run)\b"
    r"|\b(workout|session|ride|climb|run) (for |on )?(today|tomorrow|this week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b"
    r"|\btoday'?s\s+pick\b"
    r"|\b(suggested|recommended)\s+(workout|session|ride|climb|run)\b"
    r"|\bwhat\s+(should|do)\s+i\s+(do|train)\s+today\b"
    r"|\bshould\s+i\s+(train|work\s?out|rest|ride|climb|run)\s+today\b"
    r"|\b(do|have)\s+i\s+(got\s+|have\s+)?a?\s*(workout|session|ride|climb|run)\s+today\b",
    re.IGNORECASE,
)


def _needs_grounding(message: str) -> bool:
    """True when the message references the user's own data and the first
    LLM round should be forced to call a tool (tool_choice='required').

    [EXERCISE SWAP ...] messages are exempt: the marker itself injects the
    authoritative live-session state (client-composed), so there is nothing
    stale to read — and forcing a tool on turn 1 would slam a swap card into
    a pain conversation before the coach can ask a single question. Later
    turns ("ok swap it") match the regex again, which is correct: by then
    propose_exercise_swap is the right call and satisfies the round."""
    if (message or "").lstrip().startswith("[EXERCISE SWAP"):
        return False
    return bool(_GROUNDING_INTENT_RE.search(message or ""))


_VIDEO_EMBED_RE = re.compile(r'<video-embed\s+videoid="([^"]+)"[^>]*/>')


def _collect_video_tags(result: Dict[str, Any], into: Dict[str, str]) -> None:
    """Record any <video-embed> tags a tool returned, keyed by video id, so we
    can guarantee they render even if the model paraphrases them away."""
    if not isinstance(result, dict):
        return
    msg = result.get("message") or ""
    for m in _VIDEO_EMBED_RE.finditer(msg):
        into.setdefault(m.group(1), m.group(0))


def _build_preview_card_tag(result: Any) -> str | None:
    """Turn a dry-run preview result into a card token (<calendar-preview> by
    default; a skill can pick its own tag via `preview_card_tag`) so the chat
    UI renders a card. Explicitly closed — parse5 (rehype-raw) ignores the
    self-closing slash on unknown elements, and a dangling open tag would
    swallow everything streamed after it."""
    card = result.get("preview_card") if isinstance(result, dict) else None
    if not card or not result.get("dry_run"):
        return None
    tag = result.get("preview_card_tag") or "calendar-preview"
    payload = base64.b64encode(json.dumps(card).encode()).decode()
    return f'\n\n<{tag} payload="{payload}"></{tag}>\n\n'


def _model_facing_result(result: Any) -> Any:
    """preview_card is UI payload: keeping it in the tool message wastes tokens
    and the model may parrot the base64 blob into its reply."""
    if isinstance(result, dict) and ("preview_card" in result or "preview_card_tag" in result):
        return {k: v for k, v in result.items() if k not in ("preview_card", "preview_card_tag")}
    return result


# --- Tool-call memory across turns ---------------------------------------
# Assistant messages persist their turn's tool exchange as `tool_rounds`
# (see conversation_service.add_message). On later turns the recent rounds
# are replayed into the OpenAI history so the model remembers what it
# already looked up instead of re-calling the same tools.

# Replay caps: at most the last K tool-bearing assistant messages, and at
# most this many total chars of tool-result content (~6k tokens). Anything
# beyond either cap replays as text only.
REPLAY_TOOL_ROUNDS_LAST_K = 2
REPLAY_TOOL_CHARS_BUDGET = 24_000

# Per-round output ceiling for the chat tool loop. Must fit an entire
# multi-create round (e.g. 3 full create_session_template calls + several
# add_exercise calls ≈ well over 2500 tokens of JSON args): a round cut by
# this cap arrives with finish_reason="length" and its tool calls cannot be
# executed (the tail call's args are truncated mid-JSON). 2026-07-30 prod
# incident: cap 2500 silently evaporated a whole turn.
ROUND_MAX_COMPLETION_TOKENS = 8000

# What the athlete sees when a round still hits the cap. Streamed as normal
# tokens so the turn persists — a silent empty turn teaches the model (via
# replayed history) that "tools are broken" and it starts refusing work.
TRUNCATED_ROUND_MESSAGE = (
    "That change was too large to apply in one step — tell me to continue "
    "and I'll do it in smaller batches."
)

# ---- Attachment replay (chatAttachments) ----------------------------------
# Representation rule: IN-WINDOW the original file alone (byte-identical to
# turn 1 — table-cell fidelity comes from OpenAI's page images, which pypdf
# cannot reproduce); OUT-OF-WINDOW the extracted text alone (the permanent
# floor — content never vanishes, though the shape changes at the boundary).
# Never both at once: two renderings of the same table, one known-garbled,
# with nothing telling the model which to trust.
#
# The window is measured in TURNS, not attachments — with an attachment-count
# window, a conversation with a single attachment (the dominant case) would
# never leave the window and the text floor would be dead code. 10 is a
# starting value, tuned via the replay-cost log line, chosen large enough to
# cover a realistic working session (~$1.25 worst case per conversation on
# Terra at the 20-page cap).
REPLAY_ATTACHMENT_TURNS = 10
# Out-of-window text budget, drawn down newest-first. Deliberately 2x the
# per-attachment persist cap (ATTACHMENT_TEXT_PERSIST_MAX_CHARS = 60k) so two
# max-size documents can coexist on replay.
REPLAY_ATTACHMENT_TEXT_BUDGET = 120_000
# In-window admission caps, in the unit that tracks cost per type: PDFs cost
# ~2.5k tokens per PAGE (page images at detail=high) regardless of bytes;
# for images, post-normalization bytes and tokens correlate, so bytes guard
# request size. Over-cap falls through to the text floor / honest line.
REPLAY_PDF_PAGES_MAX = 20  # == documents.MAX_PDF_PAGES today; tighten independently
REPLAY_ATTACHMENT_BYTES_MAX = 5 * 1024 * 1024

# Write classification, used to decide when forced grounding may relax:
# after a write, replayed read results may be stale, so re-reads are correct.
# A dry-run/confirm preview mutates nothing and counts as a read.
_WRITE_PREVIEW_DEFAULT_TRUE = {  # dry_run defaults true → write only on explicit dry_run=false
    "schedule_to_calendar", "schedule_plan_to_calendar", "reschedule_session",
    "update_calendar_session", "adjust_plan",
}
_WRITE_CONFIRM_TOOLS = {"delete_calendar_event", "delete_session_template"}  # write only on confirm=true
_WRITE_PREVIEW_DEFAULT_FALSE = {"resolve_week"}  # writes unless dry_run=true
_WRITE_ALWAYS = {
    "add_exercise", "add_plan_session", "create_goal", "create_plan",
    "create_session_template", "delete_memory", "generate_plan", "log_session",
    "remove_plan_session", "save_exercise_video", "save_memory",
    "substitute_exercise", "update_goal", "update_memory", "update_plan",
    "update_sport_preferences",
}


# Persisted `tool_rounds` in chatConversations speak the OLD tool vocabulary
# FOREVER: every pre-rename conversation stored the workout-era names verbatim,
# and no migration can rewrite them safely (arguments are opaque JSON strings).
# This map is therefore permanent, not a transition shim. It is applied in two
# places: _call_is_write (so a stale write is still classified as a write and
# forced grounding does not wrongly relax) and _expand_tool_rounds (so the model
# never sees a dead tool name replayed as an exemplar and starts emitting it).
LEGACY_TOOL_ALIASES = {
    "create_workout_template": "create_session_template",
    "list_workout_templates": "list_session_templates",
    "delete_workout_template": "delete_session_template",
    "log_workout": "log_session",
    "get_workout_history": "get_session_history",
    "grep_workouts": "grep_session_templates",
    "add_plan_workout": "add_plan_session",
    "remove_plan_workout": "remove_plan_session",
    "update_calendar_workout": "update_calendar_session",
}


def resolve_tool_name(name: str | None) -> str:
    """Map a possibly-legacy (pre-session-rename) tool name to its current name."""
    name = name or ""
    return LEGACY_TOOL_ALIASES.get(name, name)


def _call_is_write(name: str, arguments_json: str | None) -> bool:
    """True when a persisted tool call actually mutated user data."""
    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except (ValueError, TypeError):
        args = {}
    if not isinstance(args, dict):
        args = {}
    # Replayed history may carry pre-rename names — classify them as their
    # current equivalents, otherwise a stale write reads as a read.
    name = resolve_tool_name(name)
    if name in _WRITE_ALWAYS:
        return True
    if name in _WRITE_CONFIRM_TOOLS:
        return args.get("confirm") is True
    if name in _WRITE_PREVIEW_DEFAULT_TRUE:
        return args.get("dry_run") is False
    if name in _WRITE_PREVIEW_DEFAULT_FALSE:
        return args.get("dry_run") is not True
    return False


# Preview-card tags carry a base64 payload in saved content; replaying the
# blob to the model is pure token waste (and parrot bait).
_PREVIEW_CARD_TAG_RE = re.compile(
    r'<(calendar-preview|exercise-swap)\s+payload="[^"]*">\s*</\1>'
)


def _sanitize_replayed_content(content: str) -> str:
    return _PREVIEW_CARD_TAG_RE.sub(r"<\1/>", content or "")


def _replayable_indexes(conversation_history: List[Dict[str, Any]]) -> set:
    """Indexes of assistant history messages whose tool_rounds get replayed,
    chosen newest→oldest under the K and char-budget caps."""
    chosen = set()
    budget = REPLAY_TOOL_CHARS_BUDGET
    remaining = REPLAY_TOOL_ROUNDS_LAST_K
    for idx in range(len(conversation_history) - 1, -1, -1):
        msg = conversation_history[idx]
        if msg.get("role") == "human" or not msg.get("tool_rounds"):
            continue
        if remaining <= 0:
            break
        cost = sum(
            len(str(r.get("content") or ""))
            for rd in msg["tool_rounds"]
            for r in (rd.get("results") or [])
        )
        if cost > budget:
            break
        budget -= cost
        remaining -= 1
        chosen.add(idx)
    return chosen


def _expand_tool_rounds(tool_rounds: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Expand persisted rounds into OpenAI messages. A round missing any
    matching result is skipped whole — an assistant tool_calls message
    without its full set of adjacent tool replies 400s the API.

    Names are resolved through LEGACY_TOOL_ALIASES: rounds persisted before the
    workout→session rename name tools that no longer exist, and replaying them
    verbatim teaches the model to emit dead names."""
    expanded = []
    for round_ in tool_rounds:
        calls = round_.get("tool_calls") or []
        results = round_.get("results") or []
        result_by_id = {r.get("tool_call_id"): r for r in results}
        if not calls or any(c.get("id") not in result_by_id for c in calls):
            continue
        expanded.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": c["id"],
                    "type": "function",
                    "function": {
                        "name": resolve_tool_name(c.get("name")),
                        "arguments": c.get("arguments") or "{}",
                    },
                }
                for c in calls
            ],
        })
        for c in calls:
            expanded.append({
                "role": "tool",
                "tool_call_id": c["id"],
                "content": str(result_by_id[c["id"]].get("content") or ""),
            })
    return expanded


def _history_to_openai_messages(
    conversation_history: List[Dict[str, Any]],
    attachment_parts: Dict[int, List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Rebuild OpenAI messages from stored history. Recent assistant turns
    replay their structured tool exchange (within caps); older or legacy
    turns replay as text only. Note this is a collapse, not a byte-faithful
    reproduction: prose streamed between tool rounds lives only in the final
    saved content, so it folds into the trailing assistant message.

    attachment_parts maps a HISTORY INDEX of a human message to the OpenAI
    content parts standing in for its attachments (file / image_url / text
    floor / honest marker). Resolved by the async caller so this function
    stays pure and synchronous — replay tests need no DB fixture."""
    replay_at = _replayable_indexes(conversation_history)
    attachment_parts = attachment_parts or {}
    messages = []
    for idx, hist_msg in enumerate(conversation_history):
        if hist_msg.get("role") == "human":
            text = hist_msg.get("content", "")
            parts = attachment_parts.get(idx)
            if parts:
                messages.append({
                    "role": "user",
                    "content": [{"type": "text", "text": text}] + parts,
                })
            else:
                messages.append({"role": "user", "content": text})
            continue
        content = _sanitize_replayed_content(hist_msg.get("content", ""))
        if idx in replay_at:
            messages.extend(_expand_tool_rounds(hist_msg["tool_rounds"]))
            if content.strip():
                messages.append({"role": "assistant", "content": content})
        else:
            messages.append({"role": "assistant", "content": content})
    return messages


def _attachment_unavailable_part(filename: str) -> Dict[str, Any]:
    # Honest beats the silent lie: the old marker told the model a file
    # existed that it could not see, inviting confused self-contradiction.
    return {
        "type": "text",
        "text": (
            f'[Attachment "{filename}" is no longer available in this '
            "conversation's context — ask the athlete to re-send it if its "
            "contents are needed.]"
        ),
    }


def _attachment_replay_plan(
    conversation_history: List[Dict[str, Any]],
    docs: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Decide, per attachment reference in history, how it replays.

    Pure planning half of attachment replay (blob reads happen in the caller):
    returns [{msg_idx, ref, doc, action}] with action in {"file", "text",
    "honest"}, ordered NEWEST-FIRST so the text budget drains newest-first.

    In-window (message within the last REPLAY_ATTACHMENT_TURNS human turns):
    the original file, admitted per type in the unit that tracks its cost —
    pages for PDFs, bytes (checked at read time) for images. Out-of-window:
    the extracted-text floor for PDFs; images have no floor. Anything
    inadmissible falls through text-if-possible, else the honest marker.
    """
    human_indexes = [
        i for i, m in enumerate(conversation_history) if m.get("role") == "human"
    ]
    total_humans = len(human_indexes)

    plan = []
    text_budget = REPLAY_ATTACHMENT_TEXT_BUDGET
    # Newest-first so the budget favours what the athlete referenced last.
    for pos in range(total_humans - 1, -1, -1):
        idx = human_indexes[pos]
        age = total_humans - pos  # last history human turn has age 1
        in_window = age <= REPLAY_ATTACHMENT_TURNS
        for ref in conversation_history[idx].get("attachments") or []:
            doc = docs.get(ref.get("attachment_id") or "")
            filename = ref.get("filename") or "file"
            entry = {"msg_idx": idx, "ref": ref, "doc": doc, "action": "honest"}
            if doc:
                is_pdf = doc.get("kind") == "pdf"
                file_ok = doc.get("gridfs_id") is not None and (
                    not is_pdf or (doc.get("page_count") or 0) <= REPLAY_PDF_PAGES_MAX
                )
                text_len = len(doc.get("extracted_text") or "")
                text_ok = (
                    is_pdf
                    and doc.get("text_extractable")
                    and text_len <= text_budget
                )
                if in_window and file_ok:
                    entry["action"] = "file"
                elif text_ok:
                    entry["action"] = "text"
                    text_budget -= text_len
            if entry["action"] == "honest":
                entry["ref"] = {**ref, "filename": filename}
            plan.append(entry)
    return plan


def _attachment_parts_from_plan(
    plan: List[Dict[str, Any]],
    blobs: Dict[str, bytes],
) -> Dict[int, List[Dict[str, Any]]]:
    """Materialise the plan into OpenAI content parts keyed by history index.

    An in-window "file" whose blob is missing or over the byte cap degrades
    here (text floor if the doc has one, else honest) — the byte check can
    only happen after the read.
    """
    parts_by_idx: Dict[int, List[Dict[str, Any]]] = {}
    for entry in plan:
        ref, doc, action = entry["ref"], entry["doc"], entry["action"]
        filename = ref.get("filename") or "file"
        part = None
        if action == "file":
            blob = blobs.get(ref.get("attachment_id") or "")
            # The byte cap applies to BOTH kinds: a 30MB scanned PDF passes the
            # page cap (pages track tokens, not bytes) yet would re-send ~40MB
            # of base64 every in-window turn. Over-cap PDFs fall to the text
            # floor if they have one; scanned ones go honest.
            if blob is None or len(blob) > REPLAY_ATTACHMENT_BYTES_MAX:
                action = "text" if (doc.get("kind") == "pdf" and doc.get("text_extractable")) else "honest"
            else:
                b64 = base64.b64encode(blob).decode("utf-8")
                if doc.get("kind") == "pdf":
                    # Byte-identical to the part turn 1 sent (see documents.py).
                    part = {
                        "type": "file",
                        "file": {
                            "filename": filename,
                            "file_data": f"data:{doc.get('mime_type')};base64,{b64}",
                        },
                    }
                else:
                    part = {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{doc.get('mime_type')};base64,{b64}",
                            "detail": "high",  # must match turn 1
                        },
                    }
        if part is None and action == "text":
            kept = doc.get("pages_kept") or 0
            total = doc.get("page_count") or kept
            dropped_note = (
                f" (pages {kept + 1}-{total} omitted for length)"
                if (doc.get("pages_dropped") or 0) > 0
                else ""
            )
            part = {
                "type": "text",
                "text": (
                    f'[Attached file "{filename}" — extracted text of pages '
                    f"1-{kept} of {total}{dropped_note}]\n"
                    f"{doc.get('extracted_text') or ''}"
                ),
            }
        if part is None:
            part = _attachment_unavailable_part(filename)
        # Plan order is newest-first across MESSAGES, but refs within a single
        # message were appended in ref order — append preserves that order
        # (insert(0) would reverse a multi-attachment message's parts).
        parts_by_idx.setdefault(entry["msg_idx"], []).append(part)
    return parts_by_idx


def _history_write_in_replay_window(conversation_history: List[Dict[str, Any]]) -> bool:
    """True if any replayed round contains a real write — replayed reads may
    then be stale, so forced grounding must stay on."""
    for idx in _replayable_indexes(conversation_history):
        for round_ in conversation_history[idx].get("tool_rounds") or []:
            for call in round_.get("tool_calls") or []:
                if _call_is_write(call.get("name") or "", call.get("arguments")):
                    return True
    return False


class AgentOrchestrator:
    """Enhanced orchestrator with comprehensive fitness management tools"""

    def __init__(self, db: AsyncIOMotorDatabase, redis_client=None):
        logger.info("Initializing AgentOrchestrator...")

        self.db = db
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        self.data_reader = DataReaderAgent(db)

        # Initialize services
        logger.info("Initializing services...")
        self.exercise_service = ExerciseService(db)
        self.session_service = SessionService(db)
        self.plan_service = PlanService(db)
        self.goal_service = GoalService(db)
        self.calendar_service = CalendarService(db)
        self.search_service = SearchService(
            tavily_api_key=self.settings.tavily_api_key,
            youtube_api_key=self.settings.youtube_api_key,
            db=db,
        )
        self.memory_service = MemoryService(db)
        self.attachment_service = AttachmentService(db)
        self.recommendation_service = RecommendationService(db)
        self.short_term_context = ShortTermContextService(db)

        # Shared context handed to every registered skill handler.
        self.skill_context = SkillContext(
            db=self.db,
            settings=self.settings,
            exercise_service=self.exercise_service,
            session_service=self.session_service,
            plan_service=self.plan_service,
            goal_service=self.goal_service,
            calendar_service=self.calendar_service,
            search_service=self.search_service,
            memory_service=self.memory_service,
            openai_client=self.client,
        )

        # Log configuration
        tools = self.get_tools()
        logger.info(
            "AgentOrchestrator initialized",
            model=self.settings.openai_model,
            tools_count=len(tools),
            services=[
                "ExerciseService",
                "SessionService",
                "PlanService",
                "GoalService",
                "CalendarService",
                "SearchService",
                "MemoryService"
            ],
            tavily_enabled=bool(self.settings.tavily_api_key)
        )
        
    def get_tools(self) -> List[Dict[str, Any]]:
        """Available tools for the LLM: legacy tool_definitions + registered skills.

        Skills take precedence: if a skill shares a name with a legacy tool, the
        legacy definition is dropped so the tool isn't listed twice.
        """
        skill_definitions = get_skill_definitions()
        skill_names = {d["function"]["name"] for d in skill_definitions}
        legacy_tools = [
            t for t in get_all_tools()
            if t["function"]["name"] not in skill_names
        ]
        return legacy_tools + skill_definitions


    async def _build_extra_context(
        self,
        user_id: str,
        local_now: datetime,
        today_date: str,
        data_context: Dict[str, Any] = None,
    ) -> str:
        """Short-term awareness blocks appended after memories:
        1. Calendar anchors — today's scheduled session(s), last completed
           session, next upcoming event — the source of truth for what is
           actually planned, so the sensei never claims "nothing is scheduled"
           from a stale Today's Pick.
        2. Recent train-now recommendations (today + yesterday) with reasoning,
           so the sensei knows what it already suggested and stays consistent.
        3. The pending dashboard check-in question, if one is live, so chat
           stays consistent with what the coach just asked on the Today screen.
        4. Short-term context entries (dashboard check-ins, conversation
           summaries, 14-day TTL) — working memory across conversations.
        5. Training-interest vs recent-activity mix (chat-only nudge signal;
           see interest_mix.py).
        Best-effort: returns '' on any failure."""
        blocks = []
        try:
            window_start = (local_now - timedelta(days=14)).strftime('%Y-%m-%d')
            window_end = (local_now + timedelta(days=14)).strftime('%Y-%m-%d')
            cal = await self.calendar_service.get_calendar_events(
                user_id, {"startDate": window_start, "endDate": window_end}
            )
            if cal.get("success"):
                anchors = format_calendar_anchors(
                    cal.get("events", []), today_date,
                    external_activities=(data_context or {}).get("external_activities"),
                )
                blocks.append(
                    anchors
                    + "\n(This block is the source of truth for what is scheduled "
                    "today — never claim nothing is scheduled if it lists an event. "
                    "It is a snapshot from the start of this turn; after scheduling "
                    "or deleting events mid-conversation, re-check with "
                    "get_calendar_events.)"
                )
        except Exception as e:
            logger.error(f"Failed building calendar anchors for {user_id}: {e}")
        try:
            yesterday_date = (local_now - timedelta(days=1)).strftime('%Y-%m-%d')
            recs = await self.recommendation_service.get_recent(user_id, [today_date, yesterday_date])
            # None = the lookup itself failed — omit the block entirely rather
            # than falsely asserting no pick exists for today.
            if recs is not None:
                rec_block = RecommendationService.format_for_prompt(recs, today_date)
                if rec_block:
                    blocks.append(rec_block)
                if not any(rec.get("localDate") == today_date for rec in recs):
                    # No pick generated yet today (user opened chat before the
                    # dashboard) — tell the model it exists as a concept and how
                    # to fetch it.
                    blocks.append(RecommendationService.placeholder_for_prompt(today_date))

            # Pending dashboard check-in: a question the coach already asked on
            # the Today screen that the athlete hasn't answered yet (answered
            # ones are deleted and show up as "checkin" short-term entries).
            pending_q = await CoachQuestionService(self.db).get_pending_today(
                user_id, today_date
            )
            if pending_q and pending_q.get("question"):
                blocks.append(
                    "PENDING DASHBOARD CHECK-IN (you already asked this on the "
                    "athlete's Today screen; they have NOT answered yet): "
                    f"\"{pending_q['question']}\" — don't re-ask it here, and don't "
                    "contradict it. If their message reads like an answer to it, "
                    "treat it as one."
                )

            stc_entries = await self.short_term_context.get_recent(
                user_id, limit=8,
                checkin_max_age_days=self.settings.checkin_context_max_age_days,
            )
            stc_block = ShortTermContextService.format_for_prompt(stc_entries)
            if stc_block:
                blocks.append(stc_block)
        except Exception as e:
            logger.error(f"Failed building extra context for {user_id}: {e}")
        try:
            interests = (data_context or {}).get("user_profile", {}).get("sportPreferences", [])
            if interests:
                counts = await load_recent_discipline_counts(self.db, user_id, local_now)
                resolutions = await resolve_interest_disciplines(
                    self.db, self.client, self.settings, interests
                )
                mix_block = build_interest_mix_block(interests, counts, resolutions=resolutions)
                if mix_block:
                    blocks.append(mix_block)
        except Exception as e:
            logger.error(f"Failed building interest mix for {user_id}: {e}")
        return ("\n\n" + "\n\n".join(blocks)) if blocks else ""

    async def process_request(
        self,
        message: str,
        user_context: Dict[str, Any],
        file_content: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Process user request with OpenAI function calling"""

        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Load user memories for personalization
        user_memories = await self.memory_service.get_user_memories(user_id)

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')
        timezone = user_profile.get('timezone') or 'UTC'

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        # Get current local time for user
        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p')
            today_date = local_now.strftime('%Y-%m-%d')
        except Exception:
            local_now = datetime.now(ZoneInfo('UTC'))
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'
            today_date = local_now.strftime('%Y-%m-%d')

        context_str = f"""RUNTIME:
- You are powered by the OpenAI model: {self.settings.openai_model} (say so if asked which model you are)

CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'not specified'}
- Preferred Session Duration: {user_profile.get('sessionDuration', 'not set')} minutes
- Training Days per Week: {len(user_profile.get('sessionDays', []))}
- Stated Goals (from profile): {', '.join(user_profile.get('goals', [])) or 'none listed'}
- Profile-listed Injuries (standing baseline): {', '.join(user_profile.get('injuries', [])) or 'none listed'}
- Training Interests (sports the athlete wants in their life): {', '.join(user_profile.get('sportPreferences', [])) or 'not specified — they are set in the profile card or recorded with update_sport_preferences when the athlete volunteers them; do NOT ask about them unprompted'}

USER DATA:
- {len(data_context.get('exercises', []))} exercises in library
- {len(data_context.get('workouts', []))} recent sessions
- {len(data_context.get('goals', []))} active tracked goals (Goals feature)
- {len(data_context.get('plans', []))} training plans"""

        # Add user memories to context (shared dated formatter)
        memory_block = self.memory_service.format_for_prompt(user_memories, limit=15)
        if memory_block:
            context_str += f"\n\n{memory_block}"

        # Add recent recommendations + short-term context (working memory)
        context_str += await self._build_extra_context(user_id, local_now, today_date, data_context)

        # Inject context into system prompt for consistent date awareness
        system_prompt_with_context = f"{SYSTEM_PROMPT}\n\n{context_str}"

        # Build user message - multimodal if file_content provided
        if file_content:
            user_message_content = [
                {"type": "text", "text": message},
                file_content
            ]
        else:
            user_message_content = message

        messages = [
            {"role": "system", "content": system_prompt_with_context},
            {"role": "user", "content": user_message_content}
        ]

        # Track tools used during this request for reflection triggering
        tools_used = []

        try:
            # Call OpenAI with function calling. If the user referenced their own
            # plan/calendar/workouts, force at least one tool call so the answer is
            # grounded in their real data instead of generic advice.
            first_tool_choice = "required" if _needs_grounding(message) else "auto"
            if first_tool_choice == "required":
                logger.info("Grounding intent detected — forcing tool use on first round")
            response = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice=first_tool_choice,
                **self.settings.llm_tuning_params(temperature=0.7)
            )

            response_message = response.choices[0].message

            # Handle tool calls
            if response_message.tool_calls:
                tool_results = []

                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    tools_used.append(function_name)  # Track tool usage
                    function_args = json.loads(tool_call.function.arguments)

                    logger.info(f"Executing tool: {function_name}")

                    # Execute the tool - route to appropriate handler
                    result = await self._execute_tool(user_id, function_name, function_args)

                    tool_results.append({
                        "tool_call_id": tool_call.id,
                        "result": result
                    })

                # Get final response with tool results
                messages.append(response_message)
                for tool_result in tool_results:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_result["tool_call_id"],
                        "content": json.dumps(_model_facing_result(tool_result["result"]))
                    })

                final_response = await self.client.chat.completions.create(
                    model=self.settings.openai_model,
                    messages=messages,
                    **self.settings.llm_tuning_params(temperature=0.7)
                )

                final_content = final_response.choices[0].message.content

                # === REFLECTION FOR TOOL EXECUTION PATH ===
                if self._requires_reflection(final_content, tools_used):
                    logger.info("Triggering reflection for tool execution response")
                    reflection_result = await self._reflect_on_response(
                        original_response=final_content,
                        user_memories=user_memories,
                        user_profile=user_profile,
                        data_context=data_context,
                    )

                    if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                        final_content = reflection_result["revised_response"]
                        logger.info(f"Response revised. Issues fixed: {reflection_result['issues']}")

                final_content = dedupe_repeated_response(final_content)

                # The prompts tell the model the UI renders the preview card, so
                # the non-streaming reply must carry the tag too (the streaming
                # path emits it as a token).
                for tool_result in tool_results:
                    preview_tag = _build_preview_card_tag(tool_result["result"])
                    if preview_tag:
                        final_content = preview_tag + (final_content or "")

                return {
                    "message": final_content,
                    "type": "tool_execution",
                    "confidence": 0.95
                }
            else:
                # No tool use, just conversation
                final_content = response_message.content

                # === REFLECTION FOR CONVERSATION PATH ===
                # Note: tools_used will be empty here, so reflection won't trigger
                # This is intentional - pure conversation doesn't need reflection
                if self._requires_reflection(final_content, tools_used):
                    logger.info("Triggering reflection for conversation response")
                    reflection_result = await self._reflect_on_response(
                        original_response=final_content,
                        user_memories=user_memories,
                        user_profile=user_profile,
                        data_context=data_context,
                    )

                    if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                        final_content = reflection_result["revised_response"]

                return {
                    "message": dedupe_repeated_response(final_content),
                    "type": "conversation",
                    "confidence": 0.9
                }

        except Exception as e:
            logger.error(f"Error in orchestrator: {e}")
            return {
                "message": "I encountered an error. Please try again.",
                "type": "error",
                "confidence": 0.5
            }

    def _get_tool_description(self, function_name: str, function_args: Dict[str, Any]) -> str:
        """Get user-friendly description for a tool call"""
        descriptions = {
            # Exercise tools
            "add_exercise": f"Adding {function_args.get('name', 'exercise')} to your library",
            "list_exercises": f"Searching exercises by {function_args.get('muscle', function_args.get('name', 'filter'))}",
            "grep_exercises": f"Searching for {', '.join(function_args.get('patterns', ['exercises'])[:3])}",
            "grep_session_templates": f"Searching sessions: {', '.join(function_args.get('patterns', ['sessions'])[:3])}",
            # Session template tools
            "create_session_template": f"Creating session template: {function_args.get('name', 'session')}",
            "list_session_templates": "Browsing session templates",
            "delete_session_template": "Removing session template(s)",
            # Session log tools
            "log_session": f"Logging session: {function_args.get('title', 'session')}",
            "get_session_history": "Fetching your session history",
            # Plan tools
            "create_plan": f"Creating training plan: {function_args.get('name', 'plan')}",
            "list_plans": "Fetching your training plans",
            "update_plan": "Updating your training plan",
            "add_plan_session": f"Adding session to week {function_args.get('weekNumber', '')}",
            "remove_plan_session": f"Removing session from week {function_args.get('weekNumber', '')}",
            # Goal tools
            "create_goal": f"Setting up goal: {function_args.get('name', 'fitness goal')}",
            "update_goal": "Updating your fitness goal",
            "list_goals": "Fetching your fitness goals",
            # Calendar tools
            "schedule_to_calendar": (
                f"Scheduling {function_args.get('title', 'event')} for {function_args.get('date', 'your calendar')}"
                if function_args.get("dry_run") is False
                else f"Previewing {function_args.get('title', 'event')} for {function_args.get('date', 'your calendar')}"
            ),
            "get_calendar_events": "Checking your calendar",
            "delete_calendar_event": (
                "Removing event from your calendar"
                if function_args.get("confirm") is True
                else "Previewing calendar event removal"
            ),
            # Daily suggestion
            "get_daily_recommendation": "Checking your Today's Pick",
            # Web search & research
            "web_search": (
                f"Finding a demo video: {function_args.get('query', 'exercise')}"
                if function_args.get("search_type") == "video"
                else f"Searching the web for: {function_args.get('query', 'fitness info')}"
            ),
            "save_exercise_video": f"Saving demo for {function_args.get('exercise_name', 'exercise')}",
            "read_url": f"Reading content from: {function_args.get('url', 'webpage')[:50]}...",
            "research": f"Researching: {function_args.get('topic', 'fitness topic')}",
            # Memory
            "save_memory": f"Remembering: {function_args.get('content', 'information')[:50]}...",
            "delete_memory": f"Forgetting: {function_args.get('search_text', 'memory')}",
            "list_memories": "Listing what I remember about you",
            "update_memory": f"Updating memory about: {function_args.get('search_text', 'information')}"
        }
        return descriptions.get(function_name, f"Processing {function_name}")

    async def _resolve_attachment_parts(
        self, conversation_history: List[Dict[str, Any]], user_id: str
    ) -> Dict[int, List[Dict[str, Any]]]:
        """Resolve history attachments to OpenAI content parts (async half).

        Fetches chatAttachments docs and — for in-window entries only — the
        stored blobs, then hands both to the pure planners so
        _history_to_openai_messages stays synchronous and DB-free.
        """
        all_ids = list({
            ref.get("attachment_id")
            for msg in conversation_history
            if msg.get("role") == "human"
            for ref in msg.get("attachments") or []
            if ref.get("attachment_id")
        })
        if not all_ids:
            return {}

        docs = await self.attachment_service.get_many(all_ids, user_id)

        plan = _attachment_replay_plan(conversation_history, docs)

        blobs: Dict[str, bytes] = {}
        for entry in plan:
            if entry["action"] != "file":
                continue
            aid = entry["ref"].get("attachment_id")
            doc = entry["doc"]
            if aid in blobs or not doc:
                continue
            blob = await self.attachment_service.read_blob(doc.get("gridfs_id"))
            if blob is not None:
                blobs[aid] = blob

        parts = _attachment_parts_from_plan(plan, blobs)

        # Cost visibility: this is the tuning instrument for
        # REPLAY_ATTACHMENT_TURNS and the text budget.
        replayed_chars = sum(
            len(p.get("text") or "")
            for plist in parts.values()
            for p in plist
            if p.get("type") == "text"
        )
        replayed_files = sum(
            1
            for plist in parts.values()
            for p in plist
            if p.get("type") in ("file", "image_url")
        )
        logger.info(
            f"[ATTACHMENT REPLAY] {replayed_files} file part(s), "
            f"{replayed_chars} text chars across {len(parts)} message(s)"
        )
        return parts

    async def process_request_streaming(
        self,
        message: str,
        user_context: Dict[str, Any],
        conversation_history: List[Dict[str, Any]] = None,
        file_content: Dict[str, Any] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Process user request with streaming, yielding events for real-time UI updates.

        Yields events:
        - {"type": "token", "content": "..."} - Individual response tokens
        - {"type": "tool_start", "tool": "...", "description": "..."} - Tool execution started
        - {"type": "tool_complete", "tool": "...", "success": bool, "message": "..."} - Tool finished
        - {"type": "complete", "full_response": "..."} - Stream finished
        - {"type": "error", "message": "..."} - Error occurred
        """
        user_id = user_context.get("user_id")

        # Read user data for context
        logger.info(f"Processing streaming request for user {user_id}")
        data_context = await self.data_reader.process(message, user_context)

        # Load user memories for personalization
        user_memories = await self.memory_service.get_user_memories(user_id)
        logger.info(f"[SENSEI DEBUG STREAMING] Loaded {len(user_memories)} memories for user {user_id}")
        for i, mem in enumerate(user_memories):
            logger.info(f"[SENSEI DEBUG STREAMING] Memory {i+1}: [{mem.get('importance')}] [{mem.get('category')}] {mem.get('content', '')[:80]}...")

        # Build context string with user profile
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')
        timezone = user_profile.get('timezone') or 'UTC'

        # Format weight and height with units
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        # Get current local time for user
        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p')
            today_date = local_now.strftime('%Y-%m-%d')
        except Exception:
            local_now = datetime.now(ZoneInfo('UTC'))
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'
            today_date = local_now.strftime('%Y-%m-%d')

        context_str = f"""RUNTIME:
- You are powered by the OpenAI model: {self.settings.openai_model} (say so if asked which model you are)

CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Stated Goals (from profile): {', '.join(user_profile.get('goals', [])) or 'none listed'}
- Profile-listed Injuries (standing baseline): {', '.join(user_profile.get('injuries', [])) or 'none listed'}
- Training Interests (sports the athlete wants in their life): {', '.join(user_profile.get('sportPreferences', [])) or 'not specified — they are set in the profile card or recorded with update_sport_preferences when the athlete volunteers them; do NOT ask about them unprompted'}

USER DATA:
- {len(data_context.get('exercises', []))} exercises
- {len(data_context.get('workouts', []))} sessions
- {len(data_context.get('goals', []))} active tracked goals (Goals feature)"""

        # Add user memories to context (shared dated formatter)
        memory_block = self.memory_service.format_for_prompt(user_memories, limit=15)
        if memory_block:
            context_str += f"\n\n{memory_block}"

        # Add recent recommendations + short-term context (working memory)
        context_str += await self._build_extra_context(user_id, local_now, today_date, data_context)

        # Build messages array with conversation history
        # IMPORTANT: Inject context into system prompt so it's always at the top
        # This ensures the AI sees the current date BEFORE any conversation history
        system_prompt_with_context = f"{SYSTEM_PROMPT}\n\n{context_str}"
        messages = [
            {"role": "system", "content": system_prompt_with_context},
        ]

        # Build current user message - multimodal if file_content provided
        if file_content:
            current_user_message = [
                {"type": "text", "text": message},
                file_content
            ]
            logger.info(f"[SENSEI DEBUG STREAMING] Multimodal message with file content type: {file_content.get('type')}")
        else:
            current_user_message = message

        # Add conversation history if available
        if conversation_history:
            logger.info(f"[SENSEI DEBUG STREAMING] Has conversation history ({len(conversation_history)} messages)")
            attachment_parts = await self._resolve_attachment_parts(
                conversation_history, user_id
            )
            messages.extend(
                _history_to_openai_messages(conversation_history, attachment_parts)
            )
            # Add current message (context is already in system prompt)
            messages.append({"role": "user", "content": current_user_message})
        else:
            # First message (context is already in system prompt)
            logger.info(f"[SENSEI DEBUG STREAMING] No conversation history")
            messages.append({"role": "user", "content": current_user_message})

        # Track the full response and tools used for reflection
        full_response = []
        tools_used = []
        # Structured tool exchange for this turn (one entry per LLM round),
        # persisted with the assistant message so later turns can replay it.
        turn_tool_rounds: List[Dict[str, Any]] = []
        # Video-embed tags returned by tools this turn. The model sometimes
        # paraphrases a video result instead of emitting the <video-embed> tag,
        # which breaks the player. We ensure the tag(s) end up in the response.
        turn_video_tags: Dict[str, str] = {}  # videoid -> full tag

        try:
            # Create streaming completion with tools. If the user referenced their
            # own plan/calendar/workouts, force at least one tool call so the answer
            # is grounded in their real data instead of generic advice.
            # Exception: when the replayed history already carries tool results
            # AND none of those rounds wrote anything (a write makes replayed
            # reads potentially stale), let the model answer from what it has.
            history_replays_tools = bool(_replayable_indexes(conversation_history or []))
            grounding_satisfied_by_history = (
                history_replays_tools
                and not _history_write_in_replay_window(conversation_history or [])
            )
            first_tool_choice = (
                "required"
                if _needs_grounding(message) and not grounding_satisfied_by_history
                else "auto"
            )
            logger.info(
                f"Calling OpenAI API with model: {self.settings.openai_model} and "
                f"{len(self.get_tools())} tools (tool_choice={first_tool_choice})"
            )
            stream = await self.client.chat.completions.create(
                model=self.settings.openai_model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice=first_tool_choice,
                # Room for a full multi-create round: 3 rich session templates
                # + several add_exercise calls exceed 2500 tokens of JSON args,
                # and a round cut by the cap is DISCARDED (finish_reason=length,
                # 2026-07-30 prod incident). Billing is on actual usage.
                max_completion_tokens=ROUND_MAX_COMPLETION_TOKENS,
                stream=True,
                **self.settings.llm_tuning_params(temperature=0.7)
            )

            tool_calls_data = {}  # Accumulate tool call chunks by index

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta

                # Stream content tokens
                if delta.content:
                    token = delta.content
                    full_response.append(token)
                    yield {"type": "token", "content": token}

                # Accumulate tool call chunks
                if delta.tool_calls:
                    for tool_call_chunk in delta.tool_calls:
                        index = tool_call_chunk.index
                        if index not in tool_calls_data:
                            tool_calls_data[index] = {
                                "id": "",
                                "function": {"name": "", "arguments": ""}
                            }

                        if tool_call_chunk.id:
                            tool_calls_data[index]["id"] = tool_call_chunk.id
                        if tool_call_chunk.function:
                            if tool_call_chunk.function.name:
                                tool_calls_data[index]["function"]["name"] += tool_call_chunk.function.name
                            if tool_call_chunk.function.arguments:
                                tool_calls_data[index]["function"]["arguments"] += tool_call_chunk.function.arguments

                # A round cut by the output cap arrives as finish_reason="length".
                # Its accumulated tool calls CANNOT run — the tail call's args are
                # truncated mid-JSON, and executing a partial write set is worse
                # than none. Say so out loud: a silently empty turn gets replayed
                # to the model as evidence that "tools are broken" (2026-07-30
                # prod incident) and poisons the rest of the conversation.
                if choice.finish_reason == "length" and tool_calls_data:
                    args_chars = sum(
                        len(t["function"]["arguments"]) for t in tool_calls_data.values()
                    )
                    logger.error(
                        f"finish_reason=length: DISCARDING {len(tool_calls_data)} accumulated "
                        f"tool call(s) ({args_chars} args chars) — round exceeded "
                        f"{ROUND_MAX_COMPLETION_TOKENS} output tokens"
                    )
                    notice = ("\n\n" if full_response else "") + TRUNCATED_ROUND_MESSAGE
                    full_response.append(notice)
                    yield {"type": "token", "content": notice}
                    tool_calls_data = {}
                    continue

                # Check for finish reason
                if choice.finish_reason == "tool_calls" and tool_calls_data:
                    logger.info(f"Executing {len(tool_calls_data)} tool calls...")

                    # Add newline before tool execution
                    yield {"type": "token", "content": "\n\n"}

                    # Execute each tool call
                    tool_results = []
                    for index in sorted(tool_calls_data.keys()):
                        tool_data = tool_calls_data[index]
                        function_name = tool_data["function"]["name"]
                        try:
                            function_args = json.loads(tool_data["function"]["arguments"])
                        except (ValueError, TypeError):
                            # Malformed args must not kill the stream. Every call in
                            # the assistant tool_calls message needs a matching tool
                            # reply, so feed an error result instead of skipping.
                            logger.error(
                                f"Malformed args for {function_name} "
                                f"({len(tool_data['function']['arguments'])} chars) — not executing"
                            )
                            tool_results.append({
                                "tool_call_id": tool_data["id"],
                                "role": "tool",
                                "content": json.dumps({
                                    "success": False,
                                    "error": "Tool call arguments were truncated — retry this action as a smaller step.",
                                }),
                            })
                            yield {
                                "type": "tool_complete",
                                "tool": function_name,
                                "success": False,
                                "message": "arguments truncated",
                            }
                            continue

                        logger.info(f"Executing {function_name} with args: {function_args}")
                        tools_used.append(function_name)  # Track for reflection

                        # Yield tool start event
                        tool_description = self._get_tool_description(function_name, function_args)
                        yield {
                            "type": "tool_start",
                            "tool": function_name,
                            "description": tool_description
                        }

                        # Execute tool
                        result = await self._execute_tool(user_id, function_name, function_args)
                        _collect_video_tags(result, turn_video_tags)

                        logger.info(f"Tool {function_name} result: {result}")

                        tool_results.append({
                            "tool_call_id": tool_data["id"],
                            "role": "tool",
                            "content": json.dumps(_model_facing_result(result))
                        })

                        # Yield tool complete event
                        yield {
                            "type": "tool_complete",
                            "tool": function_name,
                            "success": result.get("success", False),
                            "message": result.get("message", "")
                        }

                        # Emit dry-run previews as a token: chat_stream persists
                        # token content and the frontend renders it live, so the
                        # card survives both paths without extra plumbing.
                        preview_tag = _build_preview_card_tag(result)
                        if preview_tag:
                            yield {"type": "token", "content": preview_tag}

                    # Build message history with tool results for final response
                    messages.append({
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": tool_calls_data[i]["id"],
                                "type": "function",
                                "function": {
                                    "name": tool_calls_data[i]["function"]["name"],
                                    "arguments": tool_calls_data[i]["function"]["arguments"]
                                }
                            }
                            for i in sorted(tool_calls_data.keys())
                        ]
                    })

                    for tool_result in tool_results:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_result["tool_call_id"],
                            "content": tool_result["content"]
                        })

                    # Record the round for persistence (content mirrors what the
                    # model saw; capped later in conversation_service).
                    _round_names = {
                        tool_calls_data[i]["id"]: tool_calls_data[i]["function"]["name"]
                        for i in sorted(tool_calls_data.keys())
                    }
                    turn_tool_rounds.append({
                        "tool_calls": [
                            {
                                "id": tool_calls_data[i]["id"],
                                "name": tool_calls_data[i]["function"]["name"],
                                "arguments": tool_calls_data[i]["function"]["arguments"],
                            }
                            for i in sorted(tool_calls_data.keys())
                        ],
                        "results": [
                            {
                                "tool_call_id": tr["tool_call_id"],
                                "name": _round_names.get(tr["tool_call_id"], ""),
                                "content": tr["content"],
                            }
                            for tr in tool_results
                        ],
                    })

                    # Stream the final response after tool execution - with tools enabled for chaining
                    logger.info("Getting final response after tool execution...")

                    # Loop to allow multiple rounds of tool calls
                    max_tool_rounds = 5  # Prevent infinite loops
                    tool_round = 0

                    while tool_round < max_tool_rounds:
                        tool_round += 1
                        logger.info(f"Tool response round {tool_round}...")

                        final_stream = await self.client.chat.completions.create(
                            model=self.settings.openai_model,
                            messages=messages,
                            tools=self.get_tools(),  # Keep tools available for chaining
                            tool_choice="auto",
                            # Chained rounds emit tool-call JSON too — same
                            # truncation cliff as the first round.
                            max_completion_tokens=ROUND_MAX_COMPLETION_TOKENS,
                            stream=True,
                            **self.settings.llm_tuning_params(temperature=0.7)
                        )

                        follow_up_tool_calls = {}

                        async for final_chunk in final_stream:
                            final_choice = final_chunk.choices[0] if final_chunk.choices else None
                            if not final_choice:
                                continue

                            delta = final_choice.delta

                            # Stream content tokens
                            if delta.content:
                                token = delta.content
                                full_response.append(token)
                                yield {"type": "token", "content": token}

                            # Accumulate any follow-up tool calls
                            if delta.tool_calls:
                                for tool_call_chunk in delta.tool_calls:
                                    index = tool_call_chunk.index
                                    if index not in follow_up_tool_calls:
                                        follow_up_tool_calls[index] = {
                                            "id": "",
                                            "function": {"name": "", "arguments": ""}
                                        }
                                    if tool_call_chunk.id:
                                        follow_up_tool_calls[index]["id"] = tool_call_chunk.id
                                    if tool_call_chunk.function:
                                        if tool_call_chunk.function.name:
                                            follow_up_tool_calls[index]["function"]["name"] += tool_call_chunk.function.name
                                        if tool_call_chunk.function.arguments:
                                            follow_up_tool_calls[index]["function"]["arguments"] += tool_call_chunk.function.arguments

                            # Same length-cut handling as the first round: a
                            # truncated follow-up round must not execute partial
                            # calls, and must not end the turn silently.
                            if final_choice.finish_reason == "length" and follow_up_tool_calls:
                                args_chars = sum(
                                    len(t["function"]["arguments"])
                                    for t in follow_up_tool_calls.values()
                                )
                                logger.error(
                                    f"Follow-up round {tool_round}: finish_reason=length, "
                                    f"DISCARDING {len(follow_up_tool_calls)} tool call(s) "
                                    f"({args_chars} args chars)"
                                )
                                notice = ("\n\n" if full_response else "") + TRUNCATED_ROUND_MESSAGE
                                full_response.append(notice)
                                yield {"type": "token", "content": notice}
                                follow_up_tool_calls = {}
                                tool_round = max_tool_rounds  # Exit the loop
                                break

                            # Check for finish reason
                            if final_choice.finish_reason == "tool_calls" and follow_up_tool_calls:
                                logger.info(f"Follow-up round {tool_round}: Executing {len(follow_up_tool_calls)} additional tool calls...")

                                # Add newline before tool execution
                                yield {"type": "token", "content": "\n\n"}

                                # Execute each follow-up tool call
                                follow_up_results = []
                                for idx in sorted(follow_up_tool_calls.keys()):
                                    tool_data = follow_up_tool_calls[idx]
                                    function_name = tool_data["function"]["name"]
                                    try:
                                        function_args = json.loads(tool_data["function"]["arguments"])
                                    except (ValueError, TypeError):
                                        # Same guard as the first round: error result
                                        # instead of a stream-killing exception.
                                        logger.error(
                                            f"Malformed args for {function_name} "
                                            f"({len(tool_data['function']['arguments'])} chars) — not executing"
                                        )
                                        follow_up_results.append({
                                            "tool_call_id": tool_data["id"],
                                            "role": "tool",
                                            "content": json.dumps({
                                                "success": False,
                                                "error": "Tool call arguments were truncated — retry this action as a smaller step.",
                                            }),
                                        })
                                        yield {
                                            "type": "tool_complete",
                                            "tool": function_name,
                                            "success": False,
                                            "message": "arguments truncated",
                                        }
                                        continue

                                    logger.info(f"Follow-up executing {function_name} with args: {function_args}")
                                    tools_used.append(function_name)  # Track for reflection

                                    # Yield tool start event
                                    tool_description = self._get_tool_description(function_name, function_args)
                                    yield {
                                        "type": "tool_start",
                                        "tool": function_name,
                                        "description": tool_description
                                    }

                                    # Execute tool
                                    result = await self._execute_tool(user_id, function_name, function_args)
                                    _collect_video_tags(result, turn_video_tags)
                                    logger.info(f"Follow-up tool {function_name} result: {result}")

                                    follow_up_results.append({
                                        "tool_call_id": tool_data["id"],
                                        "role": "tool",
                                        "content": json.dumps(_model_facing_result(result))
                                    })

                                    # Yield tool complete event
                                    yield {
                                        "type": "tool_complete",
                                        "tool": function_name,
                                        "success": result.get("success", False),
                                        "message": result.get("message", "")
                                    }

                                    # Emit dry-run previews as a token (see first
                                    # tool site for why this renders + persists).
                                    preview_tag = _build_preview_card_tag(result)
                                    if preview_tag:
                                        yield {"type": "token", "content": preview_tag}

                                # Add to messages for next round
                                messages.append({
                                    "role": "assistant",
                                    "tool_calls": [
                                        {
                                            "id": follow_up_tool_calls[i]["id"],
                                            "type": "function",
                                            "function": {
                                                "name": follow_up_tool_calls[i]["function"]["name"],
                                                "arguments": follow_up_tool_calls[i]["function"]["arguments"]
                                            }
                                        }
                                        for i in sorted(follow_up_tool_calls.keys())
                                    ]
                                })

                                for result in follow_up_results:
                                    messages.append({
                                        "role": "tool",
                                        "tool_call_id": result["tool_call_id"],
                                        "content": result["content"]
                                    })

                                # Record the follow-up round for persistence.
                                _round_names = {
                                    follow_up_tool_calls[i]["id"]: follow_up_tool_calls[i]["function"]["name"]
                                    for i in sorted(follow_up_tool_calls.keys())
                                }
                                turn_tool_rounds.append({
                                    "tool_calls": [
                                        {
                                            "id": follow_up_tool_calls[i]["id"],
                                            "name": follow_up_tool_calls[i]["function"]["name"],
                                            "arguments": follow_up_tool_calls[i]["function"]["arguments"],
                                        }
                                        for i in sorted(follow_up_tool_calls.keys())
                                    ],
                                    "results": [
                                        {
                                            "tool_call_id": fr["tool_call_id"],
                                            "name": _round_names.get(fr["tool_call_id"], ""),
                                            "content": fr["content"],
                                        }
                                        for fr in follow_up_results
                                    ],
                                })

                                # Continue the loop to process more tool calls
                                break

                            elif final_choice.finish_reason in ["stop", "length"]:
                                # No more tool calls, we're done
                                tool_round = max_tool_rounds  # Exit the loop
                                break
                        else:
                            # Stream finished without tool_calls finish reason
                            break

            # Guarantee any video the tools returned actually renders: if the model
            # described it in prose but dropped the <video-embed> tag, append it.
            accumulated_content = "".join(full_response)
            missing_tags = [
                tag for vid, tag in turn_video_tags.items()
                if vid not in accumulated_content
            ]
            if missing_tags:
                injection = "\n\n" + "\n\n".join(missing_tags)
                full_response.append(injection)
                yield {"type": "token", "content": injection}
                logger.info(f"Injected {len(missing_tags)} missing video-embed tag(s)")

            # === REFLECTION FOR STREAMING PATH ===
            accumulated_content = "".join(full_response)

            if self._requires_reflection(accumulated_content, tools_used):
                logger.info("Triggering reflection for streaming response")

                # Yield a "status" event to show reflection is happening
                yield {
                    "type": "status",
                    "message": "Reviewing plan for safety and quality..."
                }

                reflection_result = await self._reflect_on_response(
                    original_response=accumulated_content,
                    user_memories=user_memories,
                    user_profile=user_profile,
                    data_context=data_context,
                )

                if reflection_result["needs_revision"] and reflection_result["revised_response"]:
                    logger.info(f"Response revised. Issues fixed: {reflection_result['issues']}")

                    # Yield the revised response
                    yield {
                        "type": "revision",
                        "content": reflection_result["revised_response"],
                        "issues_fixed": reflection_result["issues"]
                    }
                    accumulated_content = reflection_result["revised_response"]

            # Safety net: gpt-5.4-mini sometimes emits its whole reply twice under
            # the large system prompt (streamed doubled). Collapse it and tell the
            # frontend to replace what it showed. Conservative — only fires on an
            # exact full duplication (see text_utils).
            deduped = dedupe_repeated_response(accumulated_content)
            if deduped != accumulated_content:
                logger.info("Collapsed a duplicated streamed response")
                yield {
                    "type": "revision",
                    "content": deduped,
                    "issues_fixed": ["Removed a duplicated copy of the reply."],
                }
                accumulated_content = deduped

            # Yield completion event with final content
            yield {
                "type": "complete",
                "full_response": accumulated_content,
                "tool_rounds": turn_tool_rounds
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}

    def _requires_reflection(self, response_content: str | None, tools_used: List[str]) -> bool:
        """
        Determine if response needs self-reflection.
        Triggers on:
        1. Tool-based detection (when plan/workout creation tools are used)
        2. Content-based detection (when response contains workout/plan patterns)
        """
        if not REFLECTION_CONFIG["enabled"]:
            return False

        # Handle None or empty response content
        if not response_content:
            return False

        # Skip short responses
        if len(response_content) < REFLECTION_CONFIG["min_response_length"]:
            return False

        # Check 1: Trigger if plan/workout creation tools were used
        trigger_tools = REFLECTION_CONFIG["trigger_tools"]
        if any(tool in trigger_tools for tool in tools_used):
            logger.info("Reflection triggered by tool usage", tools=tools_used)
            return True

        # Check 2: Trigger if response contains workout/plan content patterns
        content_lower = response_content.lower()
        trigger_patterns = REFLECTION_CONFIG.get("trigger_content_patterns", [])
        for pattern in trigger_patterns:
            if pattern.lower() in content_lower:
                logger.info("Reflection triggered by content pattern", pattern=pattern)
                return True

        return False

    async def _reflect_on_response(
        self,
        original_response: str,
        user_memories: List[Dict[str, Any]],
        user_profile: Dict[str, Any],
        data_context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Perform self-reflection on a response.
        Uses JSON mode for reliable parsing.
        Includes timeout and error handling.
        """
        start_time = time.time()

        # Default response if reflection fails - return original unchanged
        default_result = {
            "needs_revision": False,
            "issues": [],
            "revised_response": None,
            "reflection_latency_ms": 0,
        }

        try:
            # Extract context using correct field names
            health_memories = [m for m in user_memories if m.get("category") == "health"]
            equipment = user_profile.get("equipment", [])
            fitness_level = user_profile.get("fitnessLevel", "not set")
            goals = data_context.get("goals", [])

            # Handle unknown fitness level conservatively
            fitness_level_display = (
                fitness_level if fitness_level != "not set"
                else "Unknown - BE CONSERVATIVE, assume beginner limitations"
            )

            # Build reflection prompt
            reflection_prompt = REFLECTION_USER_PROMPT.format(
                health_memories=self._format_memories_for_reflection(health_memories) or "None specified",
                equipment=", ".join(equipment) if equipment else "Not specified",
                fitness_level=fitness_level_display,
                goals=self._format_goals_for_reflection(goals) or "None specified",
                original_response=original_response,
            )

            # Call LLM with timeout
            async with asyncio.timeout(REFLECTION_CONFIG["timeout_seconds"]):
                reflection_response = await self.client.chat.completions.create(
                    model=REFLECTION_CONFIG["model"] or self.settings.openai_model_fast,
                    messages=[
                        {"role": "system", "content": REFLECTION_SYSTEM_PROMPT},
                        {"role": "user", "content": reflection_prompt}
                    ],
                    response_format={"type": "json_object"},
                    max_completion_tokens=REFLECTION_CONFIG["max_tokens"],
                    **self.settings.llm_tuning_params(temperature=REFLECTION_CONFIG["temperature"]),
                )

            # Parse JSON response
            reflection_text = reflection_response.choices[0].message.content
            reflection_data = json.loads(reflection_text)

            latency_ms = int((time.time() - start_time) * 1000)

            result = {
                "needs_revision": reflection_data.get("issues_found", False),
                "issues": reflection_data.get("issues", []),
                "revised_response": reflection_data.get("revised_response"),
                "reflection_latency_ms": latency_ms,
            }

            # Log metrics if enabled
            if REFLECTION_CONFIG["log_metrics"]:
                logger.info(
                    "Reflection completed",
                    issues_found=result["needs_revision"],
                    latency_ms=latency_ms,
                    issues=result["issues"]
                )

            return result

        except asyncio.TimeoutError:
            logger.warning(
                f"Reflection timed out after {REFLECTION_CONFIG['timeout_seconds']}s, returning original"
            )
            return default_result
        except json.JSONDecodeError as e:
            logger.error(f"Reflection JSON parse error: {e}")
            return default_result
        except Exception as e:
            logger.error(f"Reflection failed: {e}")
            return default_result

    def _format_memories_for_reflection(self, memories: List[Dict[str, Any]]) -> str:
        """Format health memories for reflection prompt.

        Note: This method receives pre-filtered health memories only,
        so we don't include the category prefix to avoid redundancy.
        """
        if not memories:
            return ""
        return "\n".join([
            f"- {m.get('content', '')}"
            for m in memories
        ])

    def _format_goals_for_reflection(self, goals: List[Dict[str, Any]]) -> str:
        """Format goals for reflection prompt."""
        if not goals:
            return ""
        max_goals = REFLECTION_CONFIG["max_goals_in_context"]
        return "\n".join([
            f"- {g.get('name', 'Goal')}: {g.get('description', '')}"
            for g in goals[:max_goals]
        ])

    async def _execute_tool(self, user_id: str, function_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Route tool calls to appropriate service handlers"""
        # Registered skills take precedence over legacy tools.
        skill_handler = get_skill_handler(function_name)
        if skill_handler:
            logger.info("Executing skill", skill=function_name)
            return await skill_handler(self.skill_context, user_id, args)

        tool_handlers = {
            # Exercise tools
            "add_exercise": self.exercise_service.add_exercise,
            "list_exercises": self.exercise_service.list_exercises,
            "grep_exercises": self.exercise_service.grep_exercises,
            "grep_session_templates": self.exercise_service.grep_session_templates,
            "save_exercise_video": self.exercise_service.save_exercise_video,
            # Session template tools
            "create_session_template": self.session_service.create_session_template,
            "list_session_templates": self.session_service.list_session_templates,
            "delete_session_template": self.session_service.delete_session_template,
            # Session log tools
            "log_session": self.session_service.log_session,
            "get_session_history": self.session_service.get_session_history,
            # Plan tools
            "create_plan": self.plan_service.create_plan,
            "list_plans": self.plan_service.list_plans,
            "update_plan": self.plan_service.update_plan,
            "add_plan_session": self.plan_service.add_plan_session,
            "remove_plan_session": self.plan_service.remove_plan_session,
            # Goal tools
            "create_goal": self.goal_service.create_goal,
            "update_goal": self.goal_service.update_goal,
            "list_goals": self.goal_service.list_goals,
            # Calendar tools
            "schedule_to_calendar": self.calendar_service.schedule_to_calendar,
            "get_calendar_events": self.calendar_service.get_calendar_events,
            # Web search & research
            "web_search": self.search_service.web_search,
            "read_url": self.search_service.read_url,
            "research": self.search_service.research,
            # Memory
            "save_memory": self.memory_service.save_memory,
            "delete_memory": self.memory_service.delete_memory,
            "list_memories": self.memory_service.list_memories,
            "update_memory": self.memory_service.update_memory,
        }

        handler = tool_handlers.get(function_name)
        if handler:
            return await handler(user_id, args)
        else:
            return {"error": f"Unknown function: {function_name}"}
