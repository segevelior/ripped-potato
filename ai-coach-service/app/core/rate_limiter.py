from datetime import datetime, timedelta, timezone
from typing import Dict, Tuple
from fastapi import HTTPException, status
import structlog

logger = structlog.get_logger()

# In-memory storage for rate limiting
# In production, consider using Redis for distributed rate limiting
_rate_limit_storage: Dict[str, Tuple[int, datetime]] = {}

# Cleanup threshold - remove entries older than this
CLEANUP_THRESHOLD_HOURS = 2


def _cleanup_expired_entries(window_seconds: int) -> None:
    """
    Remove expired entries from rate limit storage to prevent memory leak.

    Called periodically during rate limit checks.
    """
    now = datetime.now(timezone.utc)
    cutoff = timedelta(seconds=window_seconds * CLEANUP_THRESHOLD_HOURS)

    expired_keys = [
        key for key, (_, window_start) in _rate_limit_storage.items()
        if now - window_start > cutoff
    ]

    for key in expired_keys:
        del _rate_limit_storage[key]

    if expired_keys:
        logger.debug("Rate limit cleanup", removed_entries=len(expired_keys))


def check_rate_limit(user_id: str, max_requests: int = 10, window_seconds: int = 3600) -> None:
    """
    Check rate limit for a specific user.

    Args:
        user_id: The authenticated user's ID
        max_requests: Maximum number of requests allowed in the window
        window_seconds: Time window in seconds (default: 1 hour)

    Raises:
        HTTPException: 429 if rate limit exceeded
    """
    key = f"rate_limit:document_upload:{user_id}"
    now = datetime.now(timezone.utc)

    # Periodic cleanup (every ~100 requests)
    if len(_rate_limit_storage) > 100:
        _cleanup_expired_entries(window_seconds)

    if key in _rate_limit_storage:
        count, window_start = _rate_limit_storage[key]

        # Check if window has expired
        if now - window_start > timedelta(seconds=window_seconds):
            # Reset window
            _rate_limit_storage[key] = (1, now)
            logger.debug("Rate limit window reset", user_id=user_id)
        elif count >= max_requests:
            # Rate limit exceeded
            retry_after = window_seconds - int((now - window_start).total_seconds())
            logger.warning(
                "Rate limit exceeded",
                user_id=user_id,
                count=count,
                max_requests=max_requests,
                retry_after=retry_after
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {max_requests} uploads per hour.",
                headers={"Retry-After": str(retry_after)}
            )
        else:
            # Increment count
            _rate_limit_storage[key] = (count + 1, window_start)
    else:
        # First request in window
        _rate_limit_storage[key] = (1, now)

    logger.debug(
        "Rate limit check passed",
        user_id=user_id,
        current_count=_rate_limit_storage[key][0],
        max_requests=max_requests
    )


# Rate limit configuration constants
DOCUMENT_UPLOAD_MAX_REQUESTS = 10
DOCUMENT_UPLOAD_WINDOW_SECONDS = 3600  # 1 hour
