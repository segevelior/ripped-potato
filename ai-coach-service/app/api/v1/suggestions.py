"""
Suggestions endpoint - generates personalized chat prompt suggestions for the user
Uses the full AI context (profile, memories, workout history) to generate relevant suggestions
"""

from fastapi import APIRouter, Depends
from typing import Dict, Any
from datetime import datetime
from zoneinfo import ZoneInfo
import structlog
from openai import AsyncOpenAI

from app.config import get_settings
from app.middleware.auth import get_current_user
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.services import MemoryService

router = APIRouter()
logger = structlog.get_logger()


SUGGESTIONS_PROMPT = """Based on the user's profile, fitness data, and memories provided above, generate exactly 4 personalized conversation starter suggestions.

These suggestions should:
1. Be relevant to the user's current fitness level, goals, and history
2. Consider any health conditions or limitations from their memories
3. Reference their available equipment, preferred workout duration, or training style if known
4. Be actionable and specific to their situation
5. Be concise (under 40 characters each ideally, max 50)

Generate suggestions that feel personal and helpful for THIS specific user. Examples of good personalization:
- If user has a shoulder injury: "Shoulder-safe upper body workout"
- If user does calisthenics: "Progress my pull-up strength"
- If user has a weekly plan: "What should I train today?"
- If user is intermediate: "Help me break through my plateau"
- If user prefers short workouts: "Quick 20-min full body blast"

Return ONLY a JSON array of exactly 4 strings, nothing else. Example format:
["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4"]"""


@router.get("")
async def get_suggestions(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generate personalized chat prompt suggestions based on user's profile,
    memories, and fitness data.

    Returns 4 suggestions tailored to the user's current situation.
    """
    from app.main import db

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    data_reader = DataReaderAgent(db)
    memory_service = MemoryService(db)

    user_id = current_user["user_id"]

    try:
        # Get user context (same as orchestrator does)
        user_context = {
            "user_id": user_id,
            "email": current_user.get("email"),
            "username": current_user.get("username"),
        }

        # Read user data
        data_context = await data_reader.process("", user_context)

        # Load user memories
        user_memories = await memory_service.get_user_memories(user_id)

        # Build context string (same format as orchestrator)
        user_profile = data_context.get("user_profile", {})
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')
        timezone = user_profile.get('timezone') or 'UTC'

        # Format weight and height
        weight_str = 'not set'
        height_str = 'not set'
        if weight:
            weight_str = f"{weight} {'kg' if units == 'metric' else 'lbs'}"
        if height:
            height_str = f"{height} {'cm' if units == 'metric' else 'in'}"

        # Get current local time
        try:
            tz = ZoneInfo(timezone)
            local_now = datetime.now(tz)
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p')
            today_date = local_now.strftime('%Y-%m-%d')
        except Exception:
            local_now = datetime.now()
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'
            today_date = local_now.strftime('%Y-%m-%d')

        context_str = f"""CURRENT TIME:
- User's local time: {local_time_str}
- Today's date: {today_date}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'not set')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'not specified'}
- Preferred Workout Duration: {user_profile.get('workoutDuration', 'not set')} minutes
- Workout Days per Week: {len(user_profile.get('workoutDays', []))}
- Goals: {', '.join(user_profile.get('goals', [])) or 'not specified'}
- Sport Preferences: {', '.join(user_profile.get('sportPreferences', [])) or 'not specified'}

USER DATA:
- {len(data_context.get('exercises', []))} exercises in library
- {len(data_context.get('workouts', []))} recent workouts
- {len(data_context.get('goals', []))} active goals
- {len(data_context.get('plans', []))} training plans"""

        # Add memories
        if user_memories:
            memory_str = "\n\nUSER MEMORIES (important things about this user):"
            for mem in user_memories[:15]:
                category = mem.get("category", "general")
                content = mem.get("content", "")
                importance = mem.get("importance", "medium")
                prefix = "HIGH PRIORITY: " if importance == "high" else "- "
                memory_str += f"\n{prefix}[{category}] {content}"
            context_str += memory_str

        # Call OpenAI to generate suggestions
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_str}\n\n{SUGGESTIONS_PROMPT}"}
        ]

        response = await client.chat.completions.create(
            model="gpt-4o-mini",  # Use faster/cheaper model for suggestions
            messages=messages,
            temperature=0.8,  # Slightly higher for variety
            max_tokens=200
        )

        response_text = response.choices[0].message.content.strip()

        # Parse JSON response
        import json

        # Clean up response if needed (remove markdown code blocks)
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        suggestions = json.loads(response_text)

        # Ensure we have exactly 4 suggestions
        if not isinstance(suggestions, list) or len(suggestions) != 4:
            raise ValueError("Invalid suggestions format")

        logger.info(f"Generated personalized suggestions for user {user_id}: {suggestions}")

        return {
            "success": True,
            "suggestions": suggestions
        }

    except Exception as e:
        logger.error(f"Error generating suggestions: {e}", exc_info=True)

        # Return fallback suggestions on error
        return {
            "success": True,
            "suggestions": [
                "Create a 30-min HIIT workout",
                "How do I improve my squat form?",
                "Plan a weekly schedule for me",
                "Explain progressive overload"
            ],
            "fallback": True
        }
