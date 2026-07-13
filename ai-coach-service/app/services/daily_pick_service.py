"""
Daily "Today's Pick" service — generates and serves the per-day suggested
workout persisted in dailyRecommendations.

This is the single sanctioned entry point (get_or_generate_today_pick) for
every consumer: the GET /train-now endpoint, the sensei's
get_daily_recommendation skill, and any future caller (cron pre-generation,
mobile). They all share the same per-user generation lock so concurrent
cold-start requests produce ONE generation and ONE shared pick.

The AI suggestion considers:
- User's active training plan
- Recent workout history with actual exercises (avoid muscle overlap)
- Yesterday's outcome (completed / missed) and external activities
- User's preferences (duration, equipment, goals) and profile injuries
- Memories (injuries, fatigue, etc.)
- Calendar context (what's scheduled today and this week)
- The previous days' picks (don't repeat) and, on refresh, the rejected pick
"""

import asyncio

from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import structlog
from openai import AsyncOpenAI
from bson import ObjectId

from app.core.agents.data_reader import DataReaderAgent
from app.core.agents.date_utils import get_user_today
from app.core.agents.prompts import SYSTEM_PROMPT
from app.core.agents.services import MemoryService
from app.services.recommendation_service import RecommendationService
from app.services.short_term_context_service import ShortTermContextService

logger = structlog.get_logger()

# Per-user in-process locks so concurrent cold-start requests (e.g. Dashboard
# and TrainNow open together, or a chat turn racing a dashboard load) don't
# both run a full LLM generation.
generation_locks: Dict[str, asyncio.Lock] = {}


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
   - You can see 3+ CONSECUTIVE days of completed workouts ENDING YESTERDAY in the recent history (an old streak followed by days off is NOT a reason to rest), OR
   - The user EXPLICITLY mentioned current fatigue, soreness, or injury in their memories (not just historical injuries)
4. Match any workout to their fitness level and available equipment
5. Respect their preferred workout duration
6. Consider any injuries or limitations from their memories when designing the workout (but still suggest a workout)
7. NEVER include exercises that load an injured area listed under "Injuries / Limitations" or in health memories — substitute a safe alternative and mention the accommodation in "reasoning"
8. Do NOT repeat a recent daily suggestion (see RECENT DAILY SUGGESTIONS if present) — vary focus/muscles from the last couple of days
9. Weigh YESTERDAY specifically: if yesterday's workout was completed — or a hard external activity (e.g. a Strava run/ride) was logged — balance today's load and muscles against it; if yesterday's workout was MISSED, consider whether today should pick up that focus instead of something new

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

        # Get recent completed workouts (last 14 days) — completed calendar
        # events carry workoutDetails.exercises, the only live source of what
        # the user actually did (the workouts collection is unused).
        two_weeks_ago = start_of_today - timedelta(days=14)
        recent_workouts = await db.calendarevents.find({
            "userId": user_oid,
            "date": {"$gte": two_weeks_ago, "$lt": start_of_today},
            "status": "completed",
            "type": "workout"
        }).sort("date", -1).to_list(20)

        # Yesterday's workout events with their outcome — a still-'scheduled'
        # event in the past means the user MISSED it, which should shape today.
        start_of_yesterday = start_of_today - timedelta(days=1)
        yesterday_events = await db.calendarevents.find({
            "userId": user_oid,
            "date": {"$gte": start_of_yesterday, "$lt": start_of_today},
            "status": {"$ne": "cancelled"},
            "type": "workout"
        }).to_list(10)

        return {
            "today_events": today_events,
            "week_events": week_events,
            "recent_workouts": recent_workouts,
            "yesterday_events": yesterday_events,
            "today_date": start_of_today.strftime('%Y-%m-%d'),
            "day_of_week": now.strftime('%A')
        }
    except Exception as e:
        logger.error(f"Error loading calendar context: {e}")
        return {
            "today_events": [],
            "week_events": [],
            "recent_workouts": [],
            "yesterday_events": [],
            "today_date": datetime.utcnow().strftime('%Y-%m-%d'),
            "day_of_week": datetime.utcnow().strftime('%A')
        }


def format_plan_week(plan: Dict[str, Any]) -> Optional[str]:
    """Pure: render the plan's current week (if materialized) for LLM context,
    so today's suggestion aligns with the plan instead of freelancing."""
    progress = plan.get("progress") or {}
    current_week = progress.get("currentWeek", 1)
    week = next((w for w in (plan.get("weeks") or []) if w.get("weekNumber") == current_week), None)
    if not week or week.get("resolved") is False or not (week.get("workouts") or []):
        return None
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    lines = [f"  Week {current_week}" + (f" ({week.get('focus')})" if week.get("focus") else "") + ":"]
    for wo in week["workouts"]:
        custom = wo.get("customWorkout") or {}
        day = day_names[wo.get("dayOfWeek", 0) % 7]
        title = custom.get("title") or "Workout"
        ex_count = len(custom.get("exercises") or [])
        lines.append(f"  - {day}: {title} ({custom.get('type', 'strength')}, {ex_count} exercises)")
    return "\n".join(lines)


async def ensure_current_week_resolved(db, user_id: str) -> None:
    """Lazy backstop for the weekly resolver: if an active skeleton plan's
    current week isn't materialized yet, resolve it inline (one Mongo
    round-trip + pure code) so today's suggestion can see it. Best-effort —
    failures are logged, never break train-now."""
    try:
        user_oid = ObjectId(user_id)
        plans = await db.plans.find({
            "userId": user_oid,
            "status": "active",
            "skeleton": {"$exists": True},
        }).to_list(3)
        needs_resolve = []
        for plan in plans:
            current_week = (plan.get("progress") or {}).get("currentWeek", 1)
            week = next((w for w in (plan.get("weeks") or []) if w.get("weekNumber") == current_week), None)
            if week is not None and week.get("resolved") is False:
                needs_resolve.append(plan)
        if not needs_resolve:
            return
        from app.core.agents.context_factory import build_skill_context
        from app.core.agents.skills.resolve_week_skill import resolve_week
        ctx = build_skill_context(db)
        for plan in needs_resolve:
            result = await resolve_week(ctx, user_id, {"plan_id": str(plan["_id"])})
            logger.info("Lazy-resolved plan week for train-now",
                        plan_id=str(plan["_id"]), success=result.get("success"))
    except Exception as e:
        logger.error(f"Lazy week resolution failed (non-fatal): {e}")


async def load_training_plans(db, user_id: str) -> List[Dict[str, Any]]:
    """Load user's active/paused training plans (Plan.js schema fields)."""
    try:
        user_oid = ObjectId(user_id)
        plans = await db.plans.find({
            "userId": user_oid,
            "status": {"$in": ["active", "paused"]}
        }).to_list(5)

        formatted = []
        for plan in plans:
            progress = plan.get("progress") or {}
            schedule = plan.get("schedule") or {}
            formatted.append({
                "id": str(plan.get("_id")),
                "name": plan.get("name"),
                "goal": plan.get("description", ""),
                "status": plan.get("status"),
                "current_week": progress.get("currentWeek", 1),
                "total_weeks": schedule.get("weeksTotal"),
                "days_per_week": schedule.get("workoutsPerWeek"),
                "current_week_detail": format_plan_week(plan),
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

    # Yesterday's outcome: a past event still 'scheduled' was missed.
    if calendar_data.get('yesterday_events'):
        lines.append("\nYESTERDAY:")
        for event in calendar_data['yesterday_events']:
            status = event.get('status', 'scheduled')
            label = "MISSED (was scheduled, never completed)" if status == "scheduled" else status
            lines.append(f"- {event.get('title')} ({label})")

    # This week's schedule
    week_events = [e for e in calendar_data['week_events']
                   if e.get('date', datetime.min).strftime('%Y-%m-%d') != calendar_data['today_date']]
    if week_events:
        lines.append("\nUPCOMING THIS WEEK:")
        for event in week_events[:5]:
            date_str = event.get('date', datetime.min).strftime('%A')
            lines.append(f"- {date_str}: {event.get('title')}")

    # Recent workout history — include the actual exercise names so the model
    # can reason about muscle overlap instead of guessing from titles.
    if calendar_data['recent_workouts']:
        lines.append("\nCOMPLETED WORKOUTS (last 14 days, actual exercises):")
        for workout in calendar_data['recent_workouts'][:8]:
            date_str = workout.get('date', datetime.min).strftime('%A, %b %d')
            details = workout.get('workoutDetails') or {}
            workout_type = details.get('type', 'workout')
            lines.append(f"- {date_str}: {workout.get('title')} ({workout_type})")
            names = [ex.get('exerciseName') for ex in (details.get('exercises') or []) if ex.get('exerciseName')]
            if names:
                shown = names[:10]
                suffix = ", …" if len(names) > len(shown) else ""
                lines.append(f"  Exercises: {', '.join(shown)}{suffix}")

    return "\n".join(lines)


async def get_user_local_date(db, user_id: str) -> tuple:
    """The user's local calendar day -> (local_date 'YYYY-MM-DD', timezone).
    Delegates to the shared date_utils.get_user_today so every feature agrees
    on which day 'today' is. Used as the cache key for the persisted pick."""
    local_midnight, timezone = await get_user_today(db, user_id)
    return local_midnight.strftime("%Y-%m-%d"), timezone


def cached_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Response shape for a persisted recommendation (backward compatible)."""
    generated_at = doc.get("generatedAt")
    return {
        "success": True,
        "suggestion": doc.get("suggestion"),
        "source": "ai",
        "cached": True,
        "generated_at": generated_at.isoformat() + "Z" if isinstance(generated_at, datetime) else None,
    }


async def get_or_generate_today_pick(
    db,
    settings,
    user_id: str,
    refresh: bool = False,
    user_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return today's pick, generating (and persisting) it if needed.

    Fast path: if a recommendation was already generated today (persisted in
    dailyRecommendations, keyed by user-local date), return it — this is what
    keeps the Dashboard, the TrainNow page and the sensei aligned. Otherwise
    (or with refresh=True) generate a fresh suggestion, persist it, return it.
    """
    recommendation_service = RecommendationService(db)
    local_date, timezone_hint = await get_user_local_date(db, user_id)

    # Fast path: already generated today
    if not refresh:
        existing = await recommendation_service.get_for_date(user_id, local_date)
        if existing and existing.get("suggestion"):
            return cached_response(existing)

    # Serialize generation per user so concurrent cold-start requests don't
    # both pay for an LLM call; late arrivals hit the re-check below.
    lock = generation_locks.setdefault(user_id, asyncio.Lock())
    async with lock:
        if not refresh:
            existing = await recommendation_service.get_for_date(user_id, local_date)
            if existing and existing.get("suggestion"):
                return cached_response(existing)
        return await generate_and_persist(
            db, settings, user_context or {"user_id": user_id},
            user_id, local_date, timezone_hint, refresh=refresh,
        )


async def generate_and_persist(
    db,
    settings,
    user_context: Dict[str, Any],
    user_id: str,
    local_date: str,
    timezone_hint: str,
    refresh: bool = False,
) -> Dict[str, Any]:
    """
    Generate a personalized workout suggestion for today via the LLM and
    persist it to dailyRecommendations (TTL 30 days).
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    data_reader = DataReaderAgent(db)
    memory_service = MemoryService(db)
    recommendation_service = RecommendationService(db)
    stc_service = ShortTermContextService(db)

    try:
        # Read user data (profile, exercises, workouts, goals)
        data_context = await data_reader.process("workout training plan schedule", user_context)

        # Load user memories
        user_memories = await memory_service.get_user_memories(user_id)

        # Load calendar context
        user_profile = data_context.get("user_profile", {})
        timezone = user_profile.get('timezone') or 'UTC'
        calendar_data = await load_calendar_context(db, user_id, timezone)

        # Load training plans
        await ensure_current_week_resolved(db, user_id)
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
- Injuries / Limitations (profile): {', '.join(user_profile.get('injuries', [])) or 'none listed'}

CALENDAR CONTEXT:
{format_calendar_for_llm(calendar_data)}"""

        # Add training plans
        if training_plans:
            context_str += "\n\nACTIVE TRAINING PLANS:"
            for plan in training_plans:
                context_str += f"\n- {plan['name']} (Week {plan['current_week']}/{plan['total_weeks']}): {plan['goal']}"
                if plan.get("current_week_detail"):
                    context_str += f"\n{plan['current_week_detail']}"

        # Add the previous days' picks so today's suggestion varies instead of
        # repeating a suggestion the user already saw (and possibly skipped).
        # Derived from local_date (the cache key) so 'today' has ONE source of
        # truth here, whatever the profile timezone above resolves to.
        today_dt = datetime.strptime(local_date, "%Y-%m-%d")
        recent_dates = [(today_dt - timedelta(days=d)).strftime('%Y-%m-%d') for d in (1, 2, 3)]
        recent_recs = await recommendation_service.get_recent(user_id, recent_dates) or []
        recs_block = RecommendationService.format_for_prompt(recent_recs, local_date)
        if recs_block:
            context_str += f"\n\n{recs_block}"

        # On refresh the user is explicitly replacing today's pick — show the
        # model what it must NOT hand back again.
        if refresh:
            current = await recommendation_service.get_for_date(user_id, local_date)
            rejected_name = ((current or {}).get("suggestion") or {}).get("name")
            if rejected_name:
                context_str += (
                    f'\n\nREJECTED PICK: the user asked to REPLACE today\'s earlier suggestion '
                    f'"{rejected_name}". Generate a meaningfully DIFFERENT workout — different '
                    f'focus, structure, or exercises. Do NOT return the same or a near-identical session.'
                )

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

        # Add short-term context (recent check-ins + conversation summaries)
        stc_entries = await stc_service.get_recent(user_id, limit=8)
        stc_block = ShortTermContextService.format_for_prompt(stc_entries)
        if stc_block:
            context_str += f"\n\n{stc_block}"

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
            model=settings.openai_model_fast,  # Fast tier (from .env)
            messages=messages,
            max_completion_tokens=1500,
            **settings.llm_tuning_params(temperature=0.7)
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

        # Persist so the Dashboard shows the same suggestion and the sensei
        # knows what it recommended (and why). Best-effort: never fails the response.
        await recommendation_service.save(
            user_id=user_id,
            local_date=local_date,
            timezone=timezone_hint,
            suggestion=suggestion,
            context_str=context_str,
            model=settings.openai_model_fast,
        )

        return {
            "success": True,
            "suggestion": suggestion,
            "source": "ai",
            "cached": False
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
