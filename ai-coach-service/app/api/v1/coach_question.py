"""
Coach question endpoint - generates a single, personalized readiness/check-in
question for the Today dashboard, driven by the user's memories and recent
training history.

Unlike the chat suggestions endpoint (which returns conversation starters), this
returns ONE short question the coach wants to ask right now, a small set of quick
reply chips, and a provenance line so the athlete can see what the question was
based on (and correct the coach if a memory is wrong).
"""

from fastapi import APIRouter, Depends, Body
from typing import Dict, Any
from datetime import datetime
from zoneinfo import ZoneInfo
import json
import structlog
from openai import AsyncOpenAI

from app.config import get_settings
from app.middleware.auth import get_current_user
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.services import MemoryService
from app.services.conversation_service import ConversationService

router = APIRouter()
logger = structlog.get_logger()


COACH_QUESTION_PROMPT = """You are the athlete's coach opening their Today screen.
Based on their profile, recent training, and memories above, write ONE short
check-in question you genuinely want to ask them right now, before today's session.

Rules:
1. Ground the question in something specific you actually know - a recent workout,
   a logged note, an injury/fatigue memory, a schedule constraint, or today's plan.
   Do NOT invent facts that aren't in the context.
2. Keep it to one or two sentences, warm and concise. Offer to adapt if relevant
   (e.g. "I can ease the intervals if you need it").
3. Provide 2-4 short quick-reply chips (each <= 14 chars) the athlete can tap to
   answer. Order them best-state to worst-state where that makes sense
   (e.g. "Fresh", "A bit heavy", "Cooked"). Do NOT pre-select one.
4. Provide a short provenance label (<= 32 chars) naming what the question is based
   on, e.g. "run log - Jul 10", "knee injury note", "your Tuesday plan".

Return ONLY a JSON object, nothing else, in exactly this shape:
{"question": "...", "chips": ["...", "..."], "source": "..."}"""


FALLBACK_QUESTION = {
    "question": "How are you feeling before today's session? I can adjust it if you need.",
    "chips": ["Fresh", "A bit heavy", "Cooked"],
    "source": "readiness check",
}


@router.get("")
async def get_coach_question(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generate a single memory-driven coach check-in question for the Today dashboard.
    """
    from app.main import db

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    data_reader = DataReaderAgent(db)
    memory_service = MemoryService(db)

    user_id = current_user["user_id"]

    try:
        user_context = {
            "user_id": user_id,
            "email": current_user.get("email"),
            "username": current_user.get("username"),
        }

        # Read user data (profile, workouts, goals, plans)
        data_context = await data_reader.process("", user_context)

        # Load user memories
        user_memories = await memory_service.get_user_memories(user_id)

        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get("name", "").strip()
        timezone = user_profile.get("timezone") or "UTC"

        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
        except Exception:
            local_now = datetime.now()
        local_time_str = local_now.strftime("%A, %B %d, %Y at %I:%M %p")
        today_date = local_now.strftime("%Y-%m-%d")

        # Summarise recent workouts so the question can reference them
        recent_workouts = data_context.get("workouts", [])[:8]
        workouts_str = ""
        for w in recent_workouts:
            title = w.get("title") or w.get("name") or "workout"
            date = w.get("date") or w.get("completedAt") or ""
            wtype = w.get("type") or (w.get("primary_disciplines") or [None])[0] or ""
            note = w.get("feedback") or w.get("notes") or ""
            line = f"\n- {date} {wtype} \"{title}\""
            if note:
                line += f" (note: {note})"
            workouts_str += line

        context_str = f"""CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Goals: {', '.join(user_profile.get('goals', [])) or 'not specified'}
- Sport Preferences: {', '.join(user_profile.get('sportPreferences', [])) or 'not specified'}

RECENT WORKOUTS:{workouts_str or ' none logged recently'}

USER DATA:
- {len(data_context.get('goals', []))} active goals
- {len(data_context.get('plans', []))} training plans"""

        if user_memories:
            memory_str = "\n\nUSER MEMORIES (important things about this user):"
            for mem in user_memories[:15]:
                category = mem.get("category", "general")
                content = mem.get("content", "")
                importance = mem.get("importance", "medium")
                prefix = "HIGH PRIORITY: " if importance == "high" else "- "
                memory_str += f"\n{prefix}[{category}] {content}"
            context_str += memory_str

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_str}\n\n{COACH_QUESTION_PROMPT}"},
        ]

        response = await client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=messages,
            max_completion_tokens=250,
            **settings.llm_tuning_params(temperature=0.7),
        )

        response_text = response.choices[0].message.content.strip()

        # Clean markdown fences if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        parsed = json.loads(response_text)

        question = (parsed.get("question") or "").strip()
        chips = parsed.get("chips") or []
        source = (parsed.get("source") or "").strip()

        if not question or not isinstance(chips, list) or len(chips) < 2:
            raise ValueError("Invalid coach question format")

        # Normalise chips to short strings
        chips = [str(c).strip() for c in chips if str(c).strip()][:4]

        logger.info(f"Generated coach question for user {user_id}: {question}")

        return {
            "success": True,
            "question": question,
            "chips": chips,
            "source": source or "your training",
        }

    except Exception as e:
        logger.error(f"Error generating coach question: {e}", exc_info=True)
        return {
            "success": True,
            **FALLBACK_QUESTION,
            "fallback": True,
        }


COACH_REPLY_PROMPT = """You are the athlete's coach, replying INLINE on their home
(Today) screen — not in a full chat. They just answered your check-in question by
tapping a quick reply.

Write a VERY short response: 1-2 sentences, max ~30 words. Acknowledge their answer
and, if relevant, state the one concrete adjustment you'll make to today's session
(e.g. "I'll drop the intervals to steady Zone 2"). No greetings, no follow-up
questions, no lists. This is a glanceable reply; the athlete can tap "Continue" to
open a full conversation if they want more.

Return ONLY a JSON object: {"reply": "..."}"""


@router.post("/reply")
async def post_coach_reply(
    current_user: Dict[str, Any] = Depends(get_current_user),
    payload: Dict[str, Any] = Body(...),
) -> Dict[str, Any]:
    """
    Given the coach's check-in question and the athlete's tapped answer, return a
    very short, home-page-appropriate coach reply (with the option to continue in
    the full Sensei chat).
    """
    from app.main import db

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    memory_service = MemoryService(db)

    user_id = current_user["user_id"]
    question = (payload.get("question") or "").strip()
    answer = (payload.get("answer") or "").strip()

    if not answer:
        return {"success": False, "reply": ""}

    try:
        # Light context: memories only (kept small — this must be fast + short)
        user_memories = await memory_service.get_user_memories(user_id)
        memory_str = ""
        if user_memories:
            memory_str = "\n\nRELEVANT MEMORIES:"
            for mem in user_memories[:8]:
                category = mem.get("category", "general")
                content = mem.get("content", "")
                memory_str += f"\n- [{category}] {content}"

        context = (
            f'Your check-in question was: "{question}"\n'
            f'The athlete tapped: "{answer}"{memory_str}'
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context}\n\n{COACH_REPLY_PROMPT}"},
        ]

        response = await client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=messages,
            max_completion_tokens=120,
            **settings.llm_tuning_params(temperature=0.6),
        )

        response_text = response.choices[0].message.content.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        try:
            reply = (json.loads(response_text).get("reply") or "").strip()
        except Exception:
            # Model returned plain text — use it directly, trimmed
            reply = response_text.strip().strip('"')

        if not reply:
            raise ValueError("Empty reply")

        logger.info(f"Coach inline reply for user {user_id}: {reply}")
        return {"success": True, "reply": reply}

    except Exception as e:
        logger.error(f"Error generating coach reply: {e}", exc_info=True)
        return {
            "success": True,
            "reply": "Got it — I've noted that. Tap continue if you want to talk it through.",
            "fallback": True,
        }


@router.post("/continue")
async def post_coach_continue(
    current_user: Dict[str, Any] = Depends(get_current_user),
    payload: Dict[str, Any] = Body(...),
) -> Dict[str, Any]:
    """
    Promote the home-screen mini check-in into a full, persisted conversation.

    Creates a real ChatConversation seeded with the exact turns the athlete already
    saw on the Today screen — the coach's question (assistant), the athlete's tapped
    answer (human), and the coach's short reply (assistant) — then returns its
    conversation_id so the client can open it in Sensei and keep chatting with full
    context.
    """
    from app.main import db

    user_id = current_user["user_id"]
    question = (payload.get("question") or "").strip()
    answer = (payload.get("answer") or "").strip()
    reply = (payload.get("reply") or "").strip()

    if not question or not answer:
        return {"success": False, "message": "question and answer are required"}

    try:
        service = ConversationService(db)

        created = await service.create_conversation(
            user_id=user_id,
            title=question[:60],
        )
        if not created.get("success"):
            raise RuntimeError(created.get("message") or "create failed")

        conversation_id = created["conversation_id"]

        # Seed the turns the athlete already saw (roles: human=user, ai=assistant)
        await service.add_message(conversation_id, "ai", question, user_id=user_id)
        await service.add_message(conversation_id, "human", answer, user_id=user_id)
        if reply:
            await service.add_message(conversation_id, "ai", reply, user_id=user_id)

        logger.info(f"Promoted coach check-in to conversation {conversation_id} for user {user_id}")
        return {"success": True, "conversation_id": conversation_id}

    except Exception as e:
        logger.error(f"Error creating coach conversation: {e}", exc_info=True)
        return {"success": False, "message": str(e)}
