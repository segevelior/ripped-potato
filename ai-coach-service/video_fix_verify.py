"""
Deterministic verification of the two id-resolution fixes, on a SCRATCH database
(dropped at the end) — no production writes.

1. save_exercise_video ignores a hallucinated model id and saves the REAL shown top.
2. _prior_shown_ids returns what was recorded, so ret/exclude can use it.
"""

import asyncio

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.core.agents.services.exercise_service import ExerciseService
from app.core.agents.services.search_service import SearchService

SCRATCH_DB = "aicoach_videotest_scratch"
USER = "6a50b08cfc7515275d6e0e68"


async def main():
    s = get_settings()
    client = AsyncIOMotorClient(s.mongodb_url)
    db = client[SCRATCH_DB]
    try:
        # Seed: an exercise + the context the video search would have written.
        await db.exercises.insert_one({"name": "Pistol Squat", "isCommon": True})
        search = SearchService(db=db)
        await search._record_shown(
            USER, "pistol squat",
            ["ZI3gB5irv5g", "vq5-vdgJc0I"],
            {"video_id": "ZI3gB5irv5g", "title": "ANYONE Can Pistol Squat..."},
        )

        ex = ExerciseService(db)

        # 1. "save it" (best) — no id from the model — resolves to the shown top.
        await ex.save_exercise_video(USER, {"exercise_name": "Pistol Squat"})
        saved = await db.exercises.find_one({"name": "Pistol Squat"})
        got = (saved.get("mediaUrls") or {}).get("video", "")
        ok1 = "ZI3gB5irv5g" in got
        print(f"[1] save 'best' (no id from model) -> saved {got}")
        print(f"    PASS={ok1} (deterministically used the shown top)")

        # 2. "save the alternative" — resolves to the 2nd shown video, still no id.
        await ex.save_exercise_video(USER, {"exercise_name": "Pistol Squat", "which": "alternative"})
        saved2 = await db.exercises.find_one({"name": "Pistol Squat"})
        got2 = (saved2.get("mediaUrls") or {}).get("video", "")
        ok2 = "vq5-vdgJc0I" in got2
        print(f"[2] save 'alternative' -> saved {got2}")
        print(f"    PASS={ok2} (used the 2nd shown video)")

        # 3. prior-shown ids available for exclude
        prior = await search._prior_shown_ids(USER, "pistol squat")
        ok3 = "ZI3gB5irv5g" in prior and "vq5-vdgJc0I" in prior
        print(f"[3] prior_shown_ids -> {prior}")
        print(f"    PASS={ok3} (retry/exclude can use these)")

        # 4. curated tier now serves the saved (alternative) video with no search
        curated = await search._get_curated_video("show me a pistol squat")
        ok4 = curated is not None and curated["video_id"] == "vq5-vdgJc0I"
        print(f"[4] curated lookup -> {curated}")
        print(f"    PASS={ok4} (Tier 0 serves the saved demo, zero cost)")

        print(f"\nALL PASS: {all([ok1, ok2, ok3, ok4])}")
    finally:
        await client.drop_database(SCRATCH_DB)
        client.close()
        print(f"(dropped scratch db {SCRATCH_DB})")


if __name__ == "__main__":
    asyncio.run(main())
