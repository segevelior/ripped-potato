"""
Direct YouTube-ranking probe (NO coach). Calls youtube_search_videos for a set of
exercises and prints the ranked top results so we can eyeball whether the ranker
surfaces genuinely good demos from trusted channels.

Run: .venv/bin/python video_probe.py
Cost: ~100 quota units per exercise (search.list) + 1 (videos.list).
"""

import asyncio

from app.config import get_settings
from app.core.agents.services.youtube_search import youtube_search_videos, TRUSTED_CHANNELS, _norm_channel

EXERCISES = [
    "toes to bar",
    "muscle up",
    "dragon flag",
    "pistol squat",
    "handstand push up",
    "romanian deadlift",
    "hollow body hold",
    "front lever",
]


def fmt_dur(s):
    return f"{s // 60}:{s % 60:02d}"


async def main():
    key = get_settings().youtube_api_key
    if not key:
        print("No YOUTUBE_API_KEY configured.")
        return

    for ex in EXERCISES:
        vids = await youtube_search_videos(key, f"{ex} tutorial how to", max_candidates=10)
        print(f"\n=== {ex!r} — {len(vids)} candidates, top 3 ===")
        if not vids:
            print("   (no results)")
            continue
        for v in vids[:3]:
            cn = _norm_channel(v["channelTitle"])
            trusted = "★" if (cn in TRUSTED_CHANNELS or any(t in cn for t in TRUSTED_CHANNELS)) else " "
            print(f"  {trusted} score={v['score']:>5}  {v['channelTitle'][:24]:24}  "
                  f"views={v['viewCount']:>10,}  {fmt_dur(v['durationSeconds'])}  {v['title'][:52]}")


if __name__ == "__main__":
    asyncio.run(main())
