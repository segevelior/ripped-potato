"""
Train Now endpoint - returns today's personalized workout suggestion.

Thin route over app.services.daily_pick_service, which owns the calendar-first
/ AI-generation logic, the per-user generation locks, and persistence — shared
with the sensei's get_daily_recommendation skill so every surface serves the
same daily pick.
"""

from fastapi import APIRouter, Depends, Query
from typing import Dict, Any

from app.config import get_settings
from app.middleware.auth import get_current_user
# Re-exported for back-compat (tests and any external callers import these here).
from app.services.daily_pick_service import (  # noqa: F401
    TRAIN_NOW_PROMPT,
    ensure_current_week_resolved,
    format_calendar_for_llm,
    format_plan_week,
    get_or_generate_today_pick,
    get_user_local_date,
    load_calendar_context,
    load_training_plans,
)

router = APIRouter()


@router.get("")
async def get_train_now_suggestion(
    refresh: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Return today's workout suggestion.

    Fast path: if a recommendation was already generated today (persisted in
    dailyRecommendations, keyed by user-local date), return it — this is what
    keeps the Dashboard and the TrainNow page aligned. Otherwise (or with
    ?refresh=true) generate a fresh suggestion, persist it, and return it.
    """
    from app.main import db

    return await get_or_generate_today_pick(
        db,
        get_settings(),
        current_user["user_id"],
        refresh=refresh,
        user_context={
            "user_id": current_user["user_id"],
            "email": current_user.get("email"),
            "username": current_user.get("username"),
        },
    )
