"""
Train Now endpoint - generates personalized workout suggestion for today
Uses hybrid approach: calendar first, then AI suggestion if no scheduled workout

The AI suggestion considers:
- User's active training plan
- Recent workout history (avoid muscle overlap)
- User's preferences (duration, equipment, goals)
- Memories (injuries, fatigue, etc.)
- Calendar context (what's scheduled this week)
"""

from fastapi import APIRouter, Depends
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import structlog
from openai import AsyncOpenAI
from bson import ObjectId

from app.config import get_settings
from app.middleware.auth import get_current_user
from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.services import MemoryService

router = APIRouter()
logger = structlog.get_logger()


TRAIN_NOW_PROMPT = """Based on the user's profile, fitness data, calendar, and memories provided above, decide what the user should do TODAY.

You have TWO options:
1. SUGGEST A WORKOUT - if the user should train today (THIS IS THE DEFAULT)
2. SUGGEST A REST DAY - ONLY if there's a clear reason to rest

CRITICAL: DEFAULT TO SUGGESTING A WORKOUT. The user is on a "Train Now" page because they WANT to train.
- If there's NO recent workout history or it's empty/minimal, SUGGEST A WORKOUT
- If you see "NO WORKOUT SCHEDULED FOR TODAY", this means the user SHOULD train - suggest a workout!
- Only suggest rest if you have CONCRETE evidence from the data that they need it

IMPORTANT RULES:
1. If there's already a workout scheduled for today in the calendar, DO NOT suggest it again - the system will handle that.
2. Consider what muscles were trained recently to avoid overlap (e.g., if they did chest yesterday, don't suggest chest today)
3. ONLY RECOMMEND REST if ALL of these conditions are met:
   - You can see 3+ CONSECUTIVE days of completed workouts in the recent history, OR
   - The user EXPLICITLY mentioned current fatigue, soreness, or injury in their memories (not just historical injuries)
4. Match any workout to their fitness level and available equipment
5. Respect their preferred workout duration
6. Consider any injuries or limitations from their memories when designing the workout (but still suggest a workout)

IF SUGGESTING A WORKOUT, return:
{
  "type": "workout",
  "name": "Workout name (e.g., 'Upper Body Strength')",
  "goal": "Brief goal description (e.g., 'Build upper body strength and muscle')",
  "primary_disciplines": ["strength"],
  "estimated_duration": 45,
  "difficulty_level": "intermediate",
  "reasoning": "Brief explanation of why this workout is suggested today",
  "blocks": [
    {
      "name": "Warm-up",
      "exercises": [
        {"exercise_name": "Exercise Name", "volume": "3x10", "rest": "60s", "notes": ""}
      ]
    },
    {
      "name": "Main Work",
      "exercises": [...]
    },
    {
      "name": "Cool-down",
      "exercises": [...]
    }
  ]
}

IF SUGGESTING A REST DAY, return:
{
  "type": "rest",
  "name": "Rest Day",
  "reasoning": "Personalized explanation of why rest is recommended today (e.g., 'You've trained hard the last 3 days targeting your upper body. Taking today off will help your muscles recover and come back stronger for tomorrow's session.')",
  "tips": ["Optional tip 1", "Optional tip 2"]
}

Valid disciplines: strength, cardio, hiit, mobility, calisthenics, running, cycling, climbing, meditation
Valid difficulty levels: beginner, intermediate, advanced

Return ONLY the JSON object, no markdown or explanation."""


async def load_calendar_context(db, user_id: str, timezone: str = 'UTC') -> Dict[str, Any]:
    """Load calendar events for context (today and this week)"""
    try:
        user_oid = ObjectId(user_id)

        # Get user's local time
        try:
            tz = ZoneInfo(timezone)
            now = datetime.now(tz)
        except Exception:
            now = datetime.utcnow()

        # Start of today and end of week (in user's timezone)
        start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_today = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        end_of_week = start_of_today + timedelta(days=7)

        # Get today's events
        today_events = await db.calendarevents.find({
            "userId": user_oid,
            "date": {"$gte": start_of_today, "$lte": end_of_today},
            "status": {"$nin": ["cancelled", "skipped"]},
            "type": "workout"
        }).to_list(10)

        # Get this week's events (for context)
        week_events = await db.calendarevents.find({
            "userId": user_oid,
            "date": {"$gte": start_of_today, "$lte": end_of_week},
            "status": {"$nin": ["cancelled", "skipped"]},
            "type": "workout"
        }).to_list(20)

        # Get recent completed workouts (last 7 days)
        week_ago = start_of_today - timedelta(days=7)
        recent_workouts = await db.calendarevents.find({
            "userId": user_oid,
            "date": {"$gte": week_ago, "$lt": start_of_today},
            "status": "completed",
            "type": "workout"
        }).to_list(20)

        return {
            "today_events": today_events,
            "week_events": week_events,
            "recent_workouts": recent_workouts,
            "today_date": start_of_today.strftime('%Y-%m-%d'),
            "day_of_week": now.strftime('%A')
        }
    except Exception as e:
        logger.error(f"Error loading calendar context: {e}")
        return {
            "today_events": [],
            "week_events": [],
            "recent_workouts": [],
            "today_date": datetime.utcnow().strftime('%Y-%m-%d'),
            "day_of_week": datetime.utcnow().strftime('%A')
        }


async def load_training_plans(db, user_id: str) -> List[Dict[str, Any]]:
    """Load user's active training plans"""
    try:
        user_oid = ObjectId(user_id)
        plans = await db.plans.find({
            "userId": user_oid,
            "isActive": True
        }).to_list(5)

        formatted = []
        for plan in plans:
            formatted.append({
                "name": plan.get("name"),
                "goal": plan.get("goal"),
                "current_week": plan.get("currentWeek", 1),
                "total_weeks": plan.get("totalWeeks"),
                "days_per_week": plan.get("daysPerWeek")
            })
        return formatted
    except Exception as e:
        logger.error(f"Error loading training plans: {e}")
        return []


def format_calendar_for_llm(calendar_data: Dict[str, Any]) -> str:
    """Format calendar data for LLM context"""
    lines = []

    lines.append(f"TODAY: {calendar_data['day_of_week']}, {calendar_data['today_date']}")

    # Today's scheduled workouts
    if calendar_data['today_events']:
        lines.append("\nSCHEDULED FOR TODAY:")
        for event in calendar_data['today_events']:
            status = event.get('status', 'scheduled')
            lines.append(f"- {event.get('title')} ({status})")
    else:
        lines.append("\nNO WORKOUT SCHEDULED FOR TODAY")

    # This week's schedule
    week_events = [e for e in calendar_data['week_events']
                   if e.get('date', datetime.min).strftime('%Y-%m-%d') != calendar_data['today_date']]
    if week_events:
        lines.append("\nUPCOMING THIS WEEK:")
        for event in week_events[:5]:
            date_str = event.get('date', datetime.min).strftime('%A')
            lines.append(f"- {date_str}: {event.get('title')}")

    # Recent workout history
    if calendar_data['recent_workouts']:
        lines.append("\nRECENT WORKOUTS (last 7 days):")
        for workout in calendar_data['recent_workouts'][:5]:
            date_str = workout.get('date', datetime.min).strftime('%A, %b %d')
            workout_type = workout.get('workoutDetails', {}).get('type', 'workout')
            lines.append(f"- {date_str}: {workout.get('title')} ({workout_type})")

    return "\n".join(lines)


@router.get("")
async def get_train_now_suggestion(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generate a personalized workout suggestion for today.

    This endpoint is called when there's no scheduled workout for today
    and the cache is empty. It generates a suggestion based on:
    - User profile and preferences
    - Recent workout history
    - Active training plans
    - User memories (injuries, preferences, etc.)
    """
    from app.main import db

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    data_reader = DataReaderAgent(db)
    memory_service = MemoryService(db)

    user_id = current_user["user_id"]

    try:
        # Build user context
        user_context = {
            "user_id": user_id,
            "email": current_user.get("email"),
            "username": current_user.get("username"),
        }

        # Read user data (profile, exercises, workouts, goals)
        data_context = await data_reader.process("workout training plan schedule", user_context)

        # Load user memories
        user_memories = await memory_service.get_user_memories(user_id)

        # Load calendar context
        user_profile = data_context.get("user_profile", {})
        timezone = user_profile.get('timezone') or 'UTC'
        calendar_data = await load_calendar_context(db, user_id, timezone)

        # Load training plans
        training_plans = await load_training_plans(db, user_id)

        # Build context string
        user_name = user_profile.get('name', '').strip()
        units = user_profile.get('units', 'metric')
        weight = user_profile.get('weight')
        height = user_profile.get('height')

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
        except Exception:
            local_now = datetime.now()
            local_time_str = local_now.strftime('%A, %B %d, %Y at %I:%M %p') + ' (UTC)'

        context_str = f"""CURRENT TIME:
- User's local time: {local_time_str}

USER PROFILE:
- Name: {user_name or 'not set'}
- Fitness Level: {user_profile.get('fitnessLevel', 'intermediate')}
- Weight: {weight_str}
- Height: {height_str}
- Units: {units}
- Available Equipment: {', '.join(user_profile.get('equipment', [])) or 'bodyweight only'}
- Preferred Workout Duration: {user_profile.get('workoutDuration', 45)} minutes
- Workout Days per Week: {len(user_profile.get('workoutDays', []))}
- Goals: {', '.join(user_profile.get('goals', [])) or 'general fitness'}

CALENDAR CONTEXT:
{format_calendar_for_llm(calendar_data)}"""

        # Add training plans
        if training_plans:
            context_str += "\n\nACTIVE TRAINING PLANS:"
            for plan in training_plans:
                context_str += f"\n- {plan['name']} (Week {plan['current_week']}/{plan['total_weeks']}): {plan['goal']}"

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

        # Add external activities context
        if data_context.get("external_activities"):
            context_str += "\n\nRECENT EXTERNAL ACTIVITIES:"
            for activity in data_context["external_activities"][:5]:
                activity_line = f"- {activity['date']}: {activity['sport_type']} - {activity['name']}"
                details = []
                if activity.get('duration_mins'):
                    details.append(f"{activity['duration_mins']}min")
                if activity.get('distance_km'):
                    details.append(f"{activity['distance_km']}km")
                if details:
                    activity_line += f" ({', '.join(details)})"
                context_str += f"\n{activity_line}"

        # DEBUG: Log the full context being sent to the AI
        logger.info("=" * 60)
        logger.info("TRAIN-NOW DEBUG: Full context being sent to AI")
        logger.info("=" * 60)
        logger.info(f"USER ID: {user_id}")
        logger.info(f"CALENDAR DATA: today_events={len(calendar_data.get('today_events', []))}, "
                   f"week_events={len(calendar_data.get('week_events', []))}, "
                   f"recent_workouts={len(calendar_data.get('recent_workouts', []))}")
        logger.info(f"RECENT WORKOUTS DETAIL: {[w.get('title', 'unknown') for w in calendar_data.get('recent_workouts', [])]}")
        logger.info(f"TRAINING PLANS: {len(training_plans)}")
        logger.info(f"USER MEMORIES COUNT: {len(user_memories)}")
        logger.info(f"USER MEMORIES: {[m.get('content', '')[:50] for m in user_memories]}")
        logger.info(f"EXTERNAL ACTIVITIES: {len(data_context.get('external_activities', []))}")
        logger.info("-" * 60)
        logger.info(f"FULL CONTEXT STRING:\n{context_str}")
        logger.info("=" * 60)

        # Call OpenAI to generate suggestion
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_str}\n\n{TRAIN_NOW_PROMPT}"}
        ]

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1500
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

        suggestion = json.loads(response_text)

        # Determine if it's a rest day or workout suggestion
        suggestion_type = suggestion.get("type", "workout")

        if suggestion_type == "rest":
            # Validate rest day response
            if "reasoning" not in suggestion:
                suggestion["reasoning"] = "Your body needs time to recover. Rest is an essential part of training."
            if "name" not in suggestion:
                suggestion["name"] = "Rest Day"

            logger.info(f"Generated rest day suggestion for user {user_id}")
        else:
            # Validate workout response
            required_fields = ["name", "estimated_duration", "difficulty_level", "blocks"]
            for field in required_fields:
                if field not in suggestion:
                    raise ValueError(f"Missing required field: {field}")

            # Ensure type is set
            suggestion["type"] = "workout"

            logger.info(f"Generated train-now suggestion for user {user_id}: {suggestion['name']}")

        return {
            "success": True,
            "suggestion": suggestion,
            "source": "ai"
        }

    except Exception as e:
        logger.error(f"Error generating train-now suggestion: {e}", exc_info=True)

        # Return error - no fallback workout
        return {
            "success": False,
            "suggestion": None,
            "error": "Unable to generate workout suggestion. You can go to the Calendar to add a workout for today.",
            "source": "error"
        }
