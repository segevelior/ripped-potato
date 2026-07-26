#!/usr/bin/env python3
"""
One-time cleanup: re-score existing sensei-written long-term memories against
the new durability bar (see EXTRACT_AND_RECONCILE_PROMPT) and retire the junk
("user wanted to add X to a workout"-style one-off chatter).

Retirement sets isActive=False + meta.retired={at, run, reason} — NOT the
deleted tombstone. That keeps it: (a) out of every injection surface, (b)
visible and one-tap revivable in Settings > Sensei Memory, and (c) self-healing
— promote_durable_facts revives a script-retired memory if the user restates
the fact (revival is keyed on meta.retired; user-deactivated memories are
untouched by this mechanism).

Scope: active, non-deleted, source=="sensei" memories. User-typed memories are
deliberate — skipped unless --include-user-source. health-category memories are
REPORT-ONLY: never auto-retired, listed for manual review.

Run AFTER the stricter extractor (PR with EXTRACT_AND_RECONCILE_PROMPT) is
deployed, or the old extractor may re-learn what this retires.

Usage:
    python scripts/rescore_memories.py                     # dry run (default)
    python scripts/rescore_memories.py --apply             # retire flagged
    python scripts/rescore_memories.py --user <id>         # single user
    python scripts/rescore_memories.py --limit 50          # first N user docs
    python scripts/rescore_memories.py --include-user-source

Connection comes from MONGODB_URL / MONGODB_DATABASE env (.env) — point at a
scratch DB first; retired items still count toward the memory cap.
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI

load_dotenv()

from app.config import get_settings  # noqa: E402 — needs load_dotenv first

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
# No prod fallback on purpose: this script's safety story is "scratch DB
# first" — the DB name must always be an explicit choice (env or .env).
DATABASE_NAME = os.getenv("MONGODB_DATABASE")

RUN_TAG = f"rescore-{datetime.utcnow().strftime('%Y-%m')}"

# One batched LLM call per chunk: a user at the 60-memory cap in a single call
# would risk truncated (non-JSON) verdict output and silently skip the user.
CHUNK_SIZE = 25

RESCORE_PROMPT = (
    "You audit an athlete's LONG-TERM coaching memories. A memory deserves to "
    "stay ONLY if it will still matter in 4+ weeks: injuries and health "
    "conditions, lasting training preferences (style, equipment, schedule "
    "constraints), goals, and lifestyle facts.\n"
    "RETIRE: one-off requests or tasks (\"wanted to add X to a workout\", "
    "\"asked to move Friday's session\"); records of app actions (created/"
    "edited a workout, plan, or calendar event); things a coach merely "
    "explained; plans for a specific past date; transient state (a day's "
    "fatigue/soreness/sleep/mood).\n"
    "KEEP when in doubt — retiring a real fact is worse than keeping a "
    "mediocre one.\n"
    'Return ONLY a JSON object: {"verdicts": [{"id": "m3", "verdict": "KEEP" '
    'or "RETIRE", "reason": "short reason"}]} with one verdict per memory.'
)


def _fmt(mem) -> str:
    ts = mem.get("updatedAt") or mem.get("createdAt")
    date = ts.strftime("%b %d %Y") if isinstance(ts, datetime) else "undated"
    return (
        f"[{mem.get('category', 'general')}/{mem.get('importance', 'medium')}, "
        f"{date}] \"{mem.get('content', '')}\""
    )


async def rescore_user(db, client, settings, doc, apply: bool, include_user_source: bool):
    """Returns (candidates, retired_count, health_flagged)."""
    user_id = doc["user"]
    memories = doc.get("memories", [])

    scoped = [
        m for m in memories
        if m.get("content")
        and not m.get("deleted")
        and m.get("isActive", True)
        and (include_user_source or m.get("source") == "sensei")
    ]
    if not scoped:
        return 0, 0, []

    id_map = {}
    verdicts = []
    for chunk_start in range(0, len(scoped), CHUNK_SIZE):
        chunk = scoped[chunk_start:chunk_start + CHUNK_SIZE]
        lines = []
        for offset, m in enumerate(chunk):
            label = f"m{chunk_start + offset + 1}"
            id_map[label] = m
            lines.append(f"[{label}] {_fmt(m)}")

        prompt = "MEMORIES:\n" + "\n".join(lines) + f"\n\n{RESCORE_PROMPT}"
        response = await client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=1500,
            response_format={"type": "json_object"},
            # Routed through the shared guard: reasoning models reject an
            # explicit temperature, plain models get 0.1.
            **settings.llm_tuning_params(temperature=0.1),
        )
        raw = (response.choices[0].message.content or "").strip()
        try:
            verdicts.extend(json.loads(raw).get("verdicts", []))
        except Exception:
            print(
                f"  !! non-JSON verdict output for user {user_id} "
                f"(chunk at {chunk_start}) — those memories were NOT scored"
            )

    retired = 0
    health_flagged = []
    for v in verdicts:
        if not isinstance(v, dict) or v.get("verdict") != "RETIRE":
            continue
        # Models sometimes echo the bracketed label ("[m3]") — normalize.
        mem = id_map.get(str(v.get("id") or "").strip().strip("[]").strip())
        if mem is None or mem.get("_id") is None:
            continue
        reason = (v.get("reason") or "").strip()[:200]

        # health is precious: report-only, never auto-retired
        if mem.get("category") == "health":
            health_flagged.append((mem, reason))
            continue

        print(f"  {'RETIRED' if apply else 'WOULD RETIRE'} {_fmt(mem)} — {reason}")
        if apply:
            result = await db.usermemories.update_one(
                {
                    "user": user_id,
                    "memories": {
                        "$elemMatch": {"_id": mem["_id"], "deleted": {"$ne": True}}
                    },
                },
                {
                    "$set": {
                        "memories.$.isActive": False,
                        "memories.$.meta.retired": {
                            "at": datetime.utcnow(),
                            "run": RUN_TAG,
                            "reason": reason,
                        },
                        "memories.$.updatedAt": datetime.utcnow(),
                        "updatedAt": datetime.utcnow(),
                    }
                },
            )
            if result.modified_count:
                retired += 1
        else:
            retired += 1

    for mem, reason in health_flagged:
        print(f"  HEALTH (manual review only, NOT retired) {_fmt(mem)} — {reason}")

    return len(scoped), retired, health_flagged


async def main():
    parser = argparse.ArgumentParser(description="Re-score sensei memories against the new durability bar")
    parser.add_argument("--apply", action="store_true",
                        help="Actually retire flagged memories (default: dry-run report)")
    parser.add_argument("--user", help="Only this user id")
    parser.add_argument("--limit", type=int, help="First N usermemories docs")
    parser.add_argument("--include-user-source", action="store_true",
                        help="Also re-score memories the user typed themselves")
    args = parser.parse_args()

    if not DATABASE_NAME:
        sys.exit(
            "MONGODB_DATABASE must be set explicitly (no prod fallback — "
            "point at a scratch DB first)"
        )
    settings = get_settings()

    print(f"DB: {DATABASE_NAME}  mode: {'APPLY' if args.apply else 'DRY RUN'}  run: {RUN_TAG}")
    if not args.apply:
        print("Dry run — nothing will be written. Re-run with --apply to retire.\n")

    mongo = AsyncIOMotorClient(MONGODB_URL)
    db = mongo[DATABASE_NAME]
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    query = {}
    if args.user:
        query["user"] = ObjectId(args.user)
    cursor = db.usermemories.find(query)
    if args.limit:
        cursor = cursor.limit(args.limit)

    total_scoped = total_retired = total_users = 0
    all_health = []
    async for doc in cursor:
        print(f"user {doc['user']}:")
        scoped, retired, health = await rescore_user(
            db, client, settings, doc, args.apply, args.include_user_source
        )
        if scoped == 0:
            print("  (no in-scope memories)")
        total_users += 1
        total_scoped += scoped
        total_retired += retired
        all_health.extend(health)

    print(
        f"\nDone. users={total_users} scoped={total_scoped} "
        f"{'retired' if args.apply else 'would_retire'}={total_retired} "
        f"health_flagged={len(all_health)}"
    )
    if args.apply and total_retired:
        print(
            "Note: retired memories stay visible in Settings > Sensei Memory "
            "(toggle to revive) and are auto-revived if the athlete restates "
            "the fact. They still count toward the per-user memory cap."
        )
    mongo.close()


if __name__ == "__main__":
    asyncio.run(main())
