#!/usr/bin/env python3
"""
Phase A of the canonical-discipline migration: classify every exercise and
session template whose discipline values aren't canonical, and write a
human-review artifact. READ-ONLY — the DB is never written; the apply step is
backend/scripts/migrate-canonical-disciplines.js (Phase B), which consumes the
artifact this script produces.

Two passes per document:
1. Deterministic — exact canonical values (case-folded) plus the pinned
   synonym map (endurance/Conditioning→cardio, powerlifting/power/
   'Strength Training'→strength; mirrors backend/src/config/disciplines.js
   LEGACY_DISCIPLINE_MAP). Docs fully resolved here are tagged
   source="synonym" and skip the LLM.
2. LLM — only for values no rule can place (warm_up, core, corrective,
   balance, stability, 'General Fitness', ...) because each document needs
   individual judgment: classified by name+description into 1-2 canonical
   disciplines with confidence + reason.

Review contract: EVERY row must end up approved=true before Phase B will run
(low-confidence LLM rows default to approved=false and must be flipped by a
human, editing `proposed` as needed). Unchanged all-canonical docs produce no
row at all.

Usage:
    python scripts/classify_disciplines.py                 # full run
    python scripts/classify_disciplines.py --limit 20      # smoke test
    python scripts/classify_disciplines.py --collection exercises
    python scripts/classify_disciplines.py --out artifacts/run2.json

Connection comes from MONGODB_URL / MONGODB_DATABASE env (.env) — no prod
fallback: the DB name must always be an explicit choice.
"""

import argparse
import asyncio
import csv
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI

load_dotenv()

from app.config import get_settings  # noqa: E402 — needs load_dotenv first
from app.core.disciplines import DISCIPLINES, DISCIPLINES_LIST  # noqa: E402

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
# No prod fallback on purpose — see module docstring.
DATABASE_NAME = os.getenv("MONGODB_DATABASE")

CANONICAL = set(DISCIPLINES)

# Keep in lockstep with backend/src/config/disciplines.js LEGACY_DISCIPLINE_MAP.
LEGACY_DISCIPLINE_MAP = {
    "endurance": "cardio",
    "conditioning": "cardio",
    "powerlifting": "strength",
    "power": "strength",
    "strength training": "strength",
}

COLLECTIONS = {
    "exercises": "discipline",
    "sessiontemplates": "primary_disciplines",
}

CLASSIFY_PROMPT = (
    "You classify fitness-app items into a fixed discipline vocabulary. A "
    "discipline is the SPORT a session belongs to — pick the sport each item "
    f"primarily serves. Valid values (use ONLY these): {DISCIPLINES_LIST}.\n"
    "For each item, propose 1-2 disciplines. confidence is 'high' only when "
    "the choice is obvious from the name/description; use 'low' when you had "
    "to guess.\n"
    'Return ONLY JSON: {"items": [{"id": "d1", "proposed": ["strength"], '
    '"confidence": "high", "reason": "short reason"}]} — one entry per item.'
)

CHUNK_SIZE = 10


def resolve_value(value: str):
    """canonical value for a raw discipline string, or None if unmappable."""
    lower = (value or "").strip().lower()
    if not lower:
        return None
    if lower in CANONICAL:
        return lower
    return LEGACY_DISCIPLINE_MAP.get(lower)


def describe_doc(collection: str, doc: dict) -> str:
    if collection == "exercises":
        bits = [
            f"name: {doc.get('name', '?')}",
            f"description: {(doc.get('description') or '')[:200]}",
            f"muscles: {', '.join(doc.get('muscles') or [])}",
            f"equipment: {', '.join(doc.get('equipment') or [])}",
        ]
    else:
        block_names = ", ".join(b.get("name", "") for b in (doc.get("blocks") or []))
        bits = [
            f"name: {doc.get('name', '?')}",
            f"goal: {(doc.get('goal') or '')[:200]}",
            f"blocks: {block_names}",
        ]
    bits.append(f"current disciplines: {doc.get('_current')}")
    return " | ".join(bits)


async def classify_with_llm(client, settings, collection: str, docs: list) -> dict:
    """doc_index -> {proposed, confidence, reason} for docs needing judgment."""
    out = {}
    for start in range(0, len(docs), CHUNK_SIZE):
        chunk = docs[start:start + CHUNK_SIZE]
        lines = [
            f"[d{start + offset + 1}] {describe_doc(collection, doc)}"
            for offset, doc in enumerate(chunk)
        ]
        prompt = "ITEMS:\n" + "\n".join(lines) + f"\n\n{CLASSIFY_PROMPT}"
        response = await client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=2000,
            response_format={"type": "json_object"},
            **settings.llm_tuning_params(temperature=0.1),
        )
        raw = (response.choices[0].message.content or "").strip()
        try:
            items = json.loads(raw).get("items", [])
        except Exception:
            print(f"  !! non-JSON output for chunk at {start} — those docs left unclassified")
            continue
        for item in items:
            label = str(item.get("id") or "").strip().strip("[]")
            if not label.startswith("d"):
                continue
            try:
                idx = int(label[1:]) - 1
            except ValueError:
                continue
            proposed = [v for v in (item.get("proposed") or []) if v in CANONICAL][:2]
            if not proposed:
                continue
            out[idx] = {
                "proposed": proposed,
                "confidence": "high" if item.get("confidence") == "high" else "low",
                "reason": (item.get("reason") or "").strip()[:200],
            }
    return out


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="first N docs per collection")
    parser.add_argument("--collection", choices=list(COLLECTIONS), help="one collection only")
    parser.add_argument("--out", default=None, help="artifact path (.json)")
    args = parser.parse_args()

    if not DATABASE_NAME:
        sys.exit("MONGODB_DATABASE not set — refusing to guess a database.")

    settings = get_settings()
    llm = AsyncOpenAI(api_key=settings.openai_api_key)
    db = AsyncIOMotorClient(MONGODB_URL)[DATABASE_NAME]

    stamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S")
    out_path = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f"discipline-classification-{stamp}.json",
    )

    rows = []
    collections = [args.collection] if args.collection else list(COLLECTIONS)
    for collection in collections:
        field = COLLECTIONS[collection]
        cursor = db[collection].find({}, {
            "name": 1, "description": 1, "muscles": 1, "equipment": 1,
            "goal": 1, "blocks.name": 1, field: 1, "isCommon": 1,
        })
        if args.limit:
            cursor = cursor.limit(args.limit)
        docs = await cursor.to_list(length=None)
        print(f"{collection}: {len(docs)} docs")

        needs_llm = []
        for doc in docs:
            raw_values = doc.get(field) or []
            if isinstance(raw_values, str):
                raw_values = [raw_values]
            resolved, unmappable = [], []
            for value in raw_values:
                canonical = resolve_value(value)
                if canonical:
                    if canonical not in resolved:
                        resolved.append(canonical)
                else:
                    unmappable.append(value)

            if not unmappable:
                if resolved == raw_values:
                    continue  # already fully canonical — no row, no write
                rows.append({
                    "collection": collection,
                    "_id": str(doc["_id"]),
                    "name": doc.get("name", ""),
                    "isCommon": bool(doc.get("isCommon")),
                    "current": raw_values,
                    "proposed": resolved,
                    "source": "synonym",
                    "confidence": "high",
                    "reason": "case-fold / pinned synonym map",
                    "approved": True,
                })
            else:
                doc["_current"] = raw_values
                doc["_resolved"] = resolved
                doc["_field"] = field
                needs_llm.append(doc)

        if not needs_llm:
            continue
        print(f"  {len(needs_llm)} docs need LLM judgment")
        verdicts = await classify_with_llm(llm, settings, collection, needs_llm)
        for idx, doc in enumerate(needs_llm):
            verdict = verdicts.get(idx)
            resolved = doc["_resolved"]
            if verdict:
                proposed = resolved + [v for v in verdict["proposed"] if v not in resolved]
                confidence, reason = verdict["confidence"], verdict["reason"]
            else:
                proposed, confidence, reason = resolved, "low", "LLM returned no verdict"
            rows.append({
                "collection": collection,
                "_id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "isCommon": bool(doc.get("isCommon")),
                "current": doc["_current"],
                "proposed": proposed,
                "source": "llm",
                "confidence": confidence,
                "reason": reason,
                "approved": confidence == "high" and bool(proposed),
            })

    artifact = {
        "generatedAt": stamp,
        "database": DATABASE_NAME,
        "vocabulary": list(DISCIPLINES),
        "rows": rows,
    }
    with open(out_path, "w") as f:
        json.dump(artifact, f, indent=2)
    csv_path = out_path.replace(".json", ".csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["collection", "_id", "name", "isCommon", "current",
                         "proposed", "source", "confidence", "reason", "approved"])
        for row in rows:
            writer.writerow([
                row["collection"], row["_id"], row["name"], row["isCommon"],
                "; ".join(map(str, row["current"])), "; ".join(row["proposed"]),
                row["source"], row["confidence"], row["reason"], row["approved"],
            ])

    unapproved = [r for r in rows if not r["approved"]]
    common_rows = [r for r in rows if r["isCommon"]]
    print(f"\n{len(rows)} rows -> {out_path} (+ .csv)")
    print(f"  {sum(1 for r in rows if r['source'] == 'synonym')} synonym / "
          f"{sum(1 for r in rows if r['source'] == 'llm')} llm")
    print(f"  {len(unapproved)} rows need human adjudication (approved=false)")
    print(f"  {len(common_rows)} rows touch SHARED (isCommon) docs — review those extra carefully")
    print("Every row must be approved=true before Phase B "
          "(migrate-canonical-disciplines.js) will run.")


if __name__ == "__main__":
    asyncio.run(main())
