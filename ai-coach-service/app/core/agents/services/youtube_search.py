"""
YouTube Data API v3 helper — find and QUALITY-RANK exercise demonstration videos.

Why this exists: the coach used to run a plain Tavily web search for "video", which
had no quality signals and stapled preferred-creator names into the query string
(over-constraining it → zero results → junk fallback). This module instead:
  1. search.list  → candidate videos for a query (100 quota units)
  2. videos.list  → statistics + duration for those ids (1 unit)
  3. score_video() → rank by trusted channel, engagement, popularity, and duration fit

`score_video` is a pure function so it can be unit-tested without hitting the API.
"""

import html
import re
from math import log10
from typing import Any, Dict, List, Optional

import httpx
import structlog

logger = structlog.get_logger()

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

# Single source of truth for trusted fitness channels (was duplicated in the
# prompt + search_service). Used ONLY for ranking now, never in the query string.
# Include brand aliases (e.g. Chris Heria's channel is titled "THENX").
PREFERRED_CREATORS: Dict[str, List[str]] = {
    "calisthenics": ["Saturno Movement", "Calisthenicmovement", "FitnessFAQs", "Chris Heria", "THENX", "Hybrid Calisthenics", "Minus The Gym", "The Calisthenics Project"],
    "strength": ["Athlean-X", "Jeff Nippard", "Jeremy Ethier", "Renaissance Periodization", "Squat University"],
    "mobility": ["Tom Merrick", "Squat University", "GMB Fitness"],
    "yoga": ["Yoga With Adriene", "Breathe and Flow"],
    "powerlifting": ["Juggernaut Training Systems", "Calgary Barbell", "Zack Telander", "Squat University"],
}


def _norm_channel(s: str) -> str:
    """Normalize a channel name for matching: lowercase, strip all non-alphanumerics.
    So 'Saturno Movement', 'SaturnoMovement', and 'saturno-movement' all match."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


# Normalized set of all trusted channel names for robust membership scoring.
TRUSTED_CHANNELS = {_norm_channel(name) for names in PREFERRED_CREATORS.values() for name in names}


def _parse_iso8601_duration(duration: str) -> int:
    """Convert an ISO-8601 duration (e.g. 'PT8M32S') to total seconds. 0 on miss."""
    if not duration:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    if not m:
        return 0
    hours, minutes, seconds = (int(g) if g else 0 for g in m.groups())
    return hours * 3600 + minutes * 60 + seconds


def _duration_fit(seconds: int) -> float:
    """A tutorial reads best at roughly 2–15 min. Score 0..1 by how well it fits."""
    if seconds <= 0:
        return 0.3  # unknown — don't reward or heavily punish
    minutes = seconds / 60
    if 2 <= minutes <= 15:
        return 1.0
    if minutes < 2:
        return 0.5 + 0.25 * minutes  # very short shorts get partial credit
    if minutes <= 30:
        return 0.6  # long-but-usable
    return 0.3  # 30min+ lecture — usually not what "show me how" wants


def score_video(video: Dict[str, Any], trusted_channels: Optional[set] = None) -> float:
    """Pure ranking score for one video enriched with statistics.

    Expects a dict shaped like the merged search.list + videos.list item:
      { channelTitle, title, viewCount, likeCount, durationSeconds }

    Weighting (higher = better):
      - trusted channel:      +5.0  (dominant signal — the whole point of curation)
      - engagement (likes/views, log-ish): up to +2.0
      - popularity (log10 views):           up to +2.0
      - duration fit:                        up to +1.0
    """
    trusted = trusted_channels if trusted_channels is not None else TRUSTED_CHANNELS
    channel = _norm_channel(video.get("channelTitle") or "")
    views = max(int(video.get("viewCount") or 0), 0)
    likes = max(int(video.get("likeCount") or 0), 0)
    duration = int(video.get("durationSeconds") or 0)

    score = 0.0

    # 1. Trusted channel — normalized exact or substring match (handles spacing,
    #    punctuation and casing: "SaturnoMovement" == "Saturno Movement", etc.)
    if channel and (channel in trusted or any(t in channel for t in trusted)):
        score += 5.0

    # 2. Engagement: like/view ratio, scaled. Good fitness tutorials sit ~2-5%.
    if views > 0 and likes > 0:
        ratio = likes / views
        score += min(ratio / 0.03, 1.0) * 2.0

    # 3. Popularity: log10(views), capped. 1M views ~= full credit.
    if views > 0:
        score += min(log10(views) / 6.0, 1.0) * 2.0

    # 4. Duration fit
    score += _duration_fit(duration) * 1.0

    return round(score, 4)


async def enrich_youtube_ids(
    api_key: str,
    video_ids: List[str],
    timeout: float = 8.0,
) -> List[Dict[str, Any]]:
    """Given raw YouTube video ids (e.g. ones Tavily surfaced), fetch their
    snippet + statistics + duration and return them scored/sorted best-first.
    Returns [] on failure. One videos.list call (1 quota unit)."""
    ids = [v for v in dict.fromkeys(video_ids) if v]  # dedupe, keep order
    if not ids:
        return []
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                f"{YOUTUBE_API_BASE}/videos",
                params={
                    "key": api_key,
                    "id": ",".join(ids),
                    "part": "snippet,statistics,contentDetails",
                },
            )
            if resp.status_code != 200:
                logger.warning("YouTube videos.list (enrich) failed", status=resp.status_code)
                return []
            items = resp.json().get("items", [])
    except Exception as e:
        logger.warning(f"YouTube enrich error: {e}")
        return []

    videos: List[Dict[str, Any]] = []
    for it in items:
        snippet = it.get("snippet", {})
        statistics = it.get("statistics", {})
        content = it.get("contentDetails", {})
        vid = it.get("id")
        video = {
            "video_id": vid,
            "title": html.unescape(snippet.get("title", "")),
            "channelTitle": snippet.get("channelTitle", ""),
            "publishedAt": snippet.get("publishedAt", ""),
            "url": f"https://www.youtube.com/watch?v={vid}",
            "viewCount": int(statistics.get("viewCount", 0) or 0),
            "likeCount": int(statistics.get("likeCount", 0) or 0),
            "durationSeconds": _parse_iso8601_duration(content.get("duration", "")),
        }
        video["score"] = score_video(video)
        videos.append(video)

    videos.sort(key=lambda v: v["score"], reverse=True)
    return videos


async def youtube_search_videos(
    api_key: str,
    query: str,
    max_candidates: int = 10,
    exclude_ids: Optional[List[str]] = None,
    timeout: float = 8.0,
) -> List[Dict[str, Any]]:
    """Search YouTube and return candidate videos enriched with statistics,
    sorted best-first by score_video(). Returns [] on any API failure.

    Two API calls: search.list (100 units) then videos.list (1 unit).
    """
    exclude = set(exclude_ids or [])
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            search_resp = await client.get(
                f"{YOUTUBE_API_BASE}/search",
                params={
                    "key": api_key,
                    "q": query,
                    "part": "snippet",
                    "type": "video",
                    "videoEmbeddable": "true",
                    "maxResults": max_candidates,
                    "relevanceLanguage": "en",
                    "safeSearch": "strict",
                },
            )
            if search_resp.status_code != 200:
                logger.warning("YouTube search.list failed", status=search_resp.status_code, body=search_resp.text[:200])
                return []

            items = search_resp.json().get("items", [])
            id_to_snippet: Dict[str, Dict[str, Any]] = {}
            for it in items:
                vid = (it.get("id") or {}).get("videoId")
                if vid and vid not in exclude:
                    id_to_snippet[vid] = it.get("snippet", {})
            if not id_to_snippet:
                return []

            stats_resp = await client.get(
                f"{YOUTUBE_API_BASE}/videos",
                params={
                    "key": api_key,
                    "id": ",".join(id_to_snippet.keys()),
                    "part": "statistics,contentDetails",
                },
            )
            if stats_resp.status_code != 200:
                logger.warning("YouTube videos.list failed", status=stats_resp.status_code)
                # Fall back to snippet-only (no engagement signal) rather than nothing
                stats_by_id = {}
            else:
                stats_by_id = {v["id"]: v for v in stats_resp.json().get("items", [])}
    except Exception as e:  # network, timeout, JSON — degrade gracefully
        logger.warning(f"YouTube API error: {e}")
        return []

    videos: List[Dict[str, Any]] = []
    for vid, snippet in id_to_snippet.items():
        stats = stats_by_id.get(vid, {})
        statistics = stats.get("statistics", {})
        content = stats.get("contentDetails", {})
        video = {
            "video_id": vid,
            "title": html.unescape(snippet.get("title", "")),
            "channelTitle": snippet.get("channelTitle", ""),
            "publishedAt": snippet.get("publishedAt", ""),
            "url": f"https://www.youtube.com/watch?v={vid}",
            "viewCount": int(statistics.get("viewCount", 0) or 0),
            "likeCount": int(statistics.get("likeCount", 0) or 0),
            "durationSeconds": _parse_iso8601_duration(content.get("duration", "")),
        }
        video["score"] = score_video(video)
        videos.append(video)

    videos.sort(key=lambda v: v["score"], reverse=True)
    return videos
