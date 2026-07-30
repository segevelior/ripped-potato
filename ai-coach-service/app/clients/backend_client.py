"""
HTTP client for the Node backend's internal (service-to-service) API.

Per the single-writer plan (development/mongodb-collections.md §8), collections
owned by the backend are written by the coach THROUGH these endpoints, never
via direct Mongo writes from Python. Auth is the shared INTERNAL_API_KEY as an
X-Internal-Key header (same secret as the cron → coach direction).

Backend refusals come back as {"success": False, "reason": "..."} and are
returned verbatim so skills can relay them to the model.
"""

from typing import Any, Dict, Optional

import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger()

_TIMEOUT_SECONDS = 15.0


def _config() -> Optional[Dict[str, str]]:
    settings = get_settings()
    if not settings.backend_internal_url or not settings.internal_api_key:
        return None
    return {
        "base_url": settings.backend_internal_url.rstrip("/"),
        "key": settings.internal_api_key,
    }


async def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    config = _config()
    if config is None:
        return {
            "success": False,
            "reason": "backend_internal_not_configured",
            "message": "The backend internal API is not configured on this deployment.",
        }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{config['base_url']}{path}",
                json=payload,
                headers={"X-Internal-Key": config["key"]},
            )
        return response.json()
    except Exception as exc:  # network/timeout/decode — relay honestly
        logger.error("backend_internal_call_failed", path=path, error=str(exc))
        return {
            "success": False,
            "reason": "backend_unreachable",
            "message": "The backend could not be reached — the change was NOT made.",
        }


async def resolve_activity_match(
    user_id: str,
    activity_id: str,
    resolution: str,
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolve an external-activity ↔ planned-event match on the backend."""
    return await _post(
        "/internal/v1/activity-match/resolve",
        {
            "userId": user_id,
            "activityId": activity_id,
            "resolution": resolution,
            "eventId": event_id,
        },
    )
