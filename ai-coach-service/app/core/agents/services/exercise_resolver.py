"""ExerciseResolver — the single name→exercise_id resolution layer for every
Python path that writes exercises into workout documents.

Workout exercises must NEVER be persisted with a null exercise_id (the
Mongoose schema requires it, and a collection-level $jsonSchema validator
backstops raw writes). The LLM emits exercise NAMES; this resolver maps them
to catalog ids deterministically:

    supplied id (verified, never trusted blindly)
      → exact case-insensitive name match
      → fuzzy name match        (name_similarity ≥ FUZZY_ACCEPT)
      → vector similarity       ($vectorSearch ≥ VECTOR_ACCEPT)
      → medium-confidence hits  → "ambiguous" (ask the user / best-effort)
      → nothing close           → auto-create a private exercise

on_ambiguous:
  "ask"         — chat paths: return the candidates so the coach asks the user
                  which exercise they meant; nothing is written.
  "best_effort" — headless paths (daily pick, calendar): take the best
                  candidate, else create. Never blocks, never yields null.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.embeddings import attach_embedding, generate_embedding

logger = structlog.get_logger()

# Starting thresholds — tune from the `exercise_resolution` structlog events.
FUZZY_ACCEPT = 0.85    # name_similarity: only exact/substring matches clear this
VECTOR_ACCEPT = 0.90   # $vectorSearch score
FUZZY_CANDIDATE = 0.50
VECTOR_CANDIDATE = 0.70
MAX_CANDIDATES = 3


class UnresolvedExerciseError(Exception):
    """A workout was about to be persisted with a null exercise_id."""


class ExerciseResolver:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def resolve_blocks(
        self,
        user_id: str,
        blocks: List[Dict[str, Any]],
        *,
        on_ambiguous: str = "ask",
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Fill in exercise_id for every blocks[].exercises[] entry, in place.

        Returns (blocks, report). report["ambiguous"] is non-empty only with
        on_ambiguous="ask" — the caller must NOT persist and should surface the
        candidates. Otherwise every entry is guaranteed a real ObjectId;
        raises UnresolvedExerciseError instead of ever leaving a null.
        """
        entries = [ex for b in blocks for ex in (b.get("exercises") or [])]
        items = [
            {
                "exercise_name": ex.get("exercise_name", ""),
                "exercise_id": ex.get("exercise_id"),
                "muscles": ex.get("muscles"),
                "discipline": ex.get("discipline"),
                "equipment": ex.get("equipment"),
                "difficulty": ex.get("difficulty"),
            }
            for ex in entries
        ]
        resolutions = await self.resolve(user_id, items, on_ambiguous=on_ambiguous)

        report: Dict[str, Any] = {
            "resolved": [], "created": [], "ambiguous": [], "pending_create": [],
        }
        for ex, res in zip(entries, resolutions):
            # muscles/discipline etc. are resolver inputs, not part of the
            # block-exercise schema — never persist them on the workout.
            for aux in ("muscles", "discipline", "equipment", "difficulty"):
                ex.pop(aux, None)
            if res["status"] in ("ambiguous", "create_pending"):
                # create_pending only survives here when an ambiguity aborted
                # the batch (ask mode) — the caller must not persist.
                report["ambiguous" if res["status"] == "ambiguous" else "pending_create"].append(res)
                continue
            ex["exercise_id"] = res["exercise_id"]
            if res["matched_name"]:
                ex["exercise_name"] = res["matched_name"]
            (report["created"] if res["status"] == "created" else report["resolved"]).append(res)

        if report["ambiguous"]:
            if on_ambiguous != "ask":
                # best_effort must have settled everything above.
                raise UnresolvedExerciseError(
                    f"unresolved exercises in best_effort mode: "
                    f"{[a['exercise_name'] for a in report['ambiguous']]}"
                )
            return blocks, report

        # Hard post-condition: this layer is the last line of defence before a
        # raw motor insert, which Mongoose validation cannot catch.
        for b in blocks:
            for ex in b.get("exercises") or []:
                if not ex.get("exercise_id"):
                    raise UnresolvedExerciseError(
                        f"exercise '{ex.get('exercise_name')}' has no exercise_id after resolution"
                    )

        counts = {k: len(v) for k, v in report.items()}
        if counts["created"] or counts["ambiguous"]:
            logger.info("exercise_resolution_summary", user_id=user_id, **counts)
        return blocks, report

    async def resolve(
        self,
        user_id: str,
        items: List[Dict[str, Any]],
        *,
        on_ambiguous: str = "ask",
        create: bool = True,
    ) -> List[Dict[str, Any]]:
        """Resolve each {exercise_name, exercise_id?, muscles?, discipline?, ...}
        to {status, exercise_id, matched_name, method, score, candidates}.

        create=False is a preview probe: genuinely-new names stay
        "create_pending" and nothing is written to the catalog."""
        user_oid = ObjectId(user_id)
        visibility = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}

        # One catalog load per workout — the same query the old exact-match
        # path used, now also feeding the fuzzy scorer. Skip malformed docs
        # (no name) rather than let one kill every resolution.
        catalog = await self.db.exercises.find(
            visibility, {"name": 1, "muscles": 1, "discipline": 1}
        ).to_list(None)
        catalog = [ex for ex in catalog if ex.get("name")]
        by_lower_name = {ex["name"].lower(): ex for ex in catalog}

        results = []
        pending: List[int] = []  # indices awaiting creation
        for idx, item in enumerate(items):
            res = await self._resolve_one(item, user_oid, visibility, catalog, by_lower_name, on_ambiguous)
            if res["method"] not in ("verified_id", "exact"):
                logger.info(
                    "exercise_resolution",
                    user_id=str(user_oid),
                    name=item.get("exercise_name"),
                    method=res["method"],
                    status=res["status"],
                    score=res.get("score"),
                    matched_name=res.get("matched_name"),
                )
            if res["status"] == "create_pending":
                pending.append(idx)
            results.append(res)

        # Creation is DEFERRED until the whole batch is known to proceed: in
        # ask mode an ambiguity aborts the workout, and creating catalog
        # entries for a workout that never persists would leave phantom
        # exercises behind.
        has_ambiguous = any(r["status"] == "ambiguous" for r in results)
        if pending and create and not (on_ambiguous == "ask" and has_ambiguous):
            for idx in pending:
                name = (items[idx].get("exercise_name") or "").strip()
                cached = by_lower_name.get(name.lower())
                if cached:  # same new name earlier in this batch — reuse it
                    results[idx] = self._result("created", cached["_id"], cached["name"], "created", None)
                    continue
                created = await self._create_exercise(items[idx], name, user_oid)
                by_lower_name[created["name"].lower()] = {"_id": created["_id"], "name": created["name"]}
                results[idx] = self._result("created", created["_id"], created["name"], "created", None)
        return results

    async def _resolve_one(
        self,
        item: Dict[str, Any],
        user_oid: ObjectId,
        visibility: Dict[str, Any],
        catalog: List[Dict[str, Any]],
        by_lower_name: Dict[str, Dict[str, Any]],
        on_ambiguous: str,
    ) -> Dict[str, Any]:
        name = (item.get("exercise_name") or "").strip()

        # (a) A supplied id is verified, never trusted — LLMs fabricate ids.
        supplied = item.get("exercise_id")
        if supplied:
            try:
                doc = await self.db.exercises.find_one(
                    {"_id": ObjectId(str(supplied)), **visibility}, {"name": 1}
                )
            except Exception:
                doc = None
            if doc:
                return self._result("resolved", doc["_id"], doc["name"], "verified_id", 1.0)
            logger.warning("exercise_resolution_bad_id", supplied_id=str(supplied), name=name)

        if not name:
            raise UnresolvedExerciseError("exercise entry has neither a valid id nor a name")

        # (b) Exact case-insensitive name match.
        exact = by_lower_name.get(name.lower())
        if exact:
            return self._result("resolved", exact["_id"], exact["name"], "exact", 1.0)

        # (c) Fuzzy name match over the loaded catalog.
        from app.core.agents.services.exercise_service import name_similarity  # local: avoid import cycle

        scored = sorted(
            ((name_similarity(name, ex["name"]), ex) for ex in catalog),
            key=lambda pair: pair[0],
            reverse=True,
        )
        best_score, best = scored[0] if scored else (0.0, None)
        if best and best_score >= FUZZY_ACCEPT:
            runners_up = [ex for s, ex in scored[1:] if s >= FUZZY_ACCEPT]
            if not runners_up:
                return self._result("resolved", best["_id"], best["name"], "fuzzy", best_score)
            # Tie at the accept bar (e.g. "Plank" vs "Side Plank" AND "Plank
            # Jacks"): picking by catalog order would be silently arbitrary.
            # ask mode surfaces the tie; best_effort takes the top hit.
            if on_ambiguous == "best_effort":
                return self._result("resolved", best["_id"], best["name"], "fuzzy", best_score)
            tied = [(s, ex) for s, ex in scored if s >= FUZZY_ACCEPT][:MAX_CANDIDATES]
            return {
                "status": "ambiguous",
                "exercise_id": None,
                "exercise_name": name,
                "matched_name": None,
                "method": "ambiguous",
                "score": None,
                "candidates": [
                    {"id": str(ex["_id"]), "name": ex["name"], "score": round(s, 3)}
                    for s, ex in tied
                ],
            }

        # (d) Vector similarity on the query text.
        vec_candidates = await self._vector_candidates(name, visibility)
        if vec_candidates and vec_candidates[0]["score"] >= VECTOR_ACCEPT:
            top = vec_candidates[0]
            return self._result("resolved", top["_id"], top["name"], "vector", top["score"])

        # (e/f) Medium-confidence zone → ambiguous; nothing close → create.
        candidates = self._merge_candidates(scored, vec_candidates)
        if candidates:
            if on_ambiguous == "best_effort":
                top = candidates[0]
                return self._result("resolved", top["_id"], top["name"], top["method"], top["score"])
            return {
                "status": "ambiguous",
                "exercise_id": None,
                "exercise_name": name,
                "matched_name": None,
                "method": "ambiguous",
                "score": None,
                "candidates": [
                    {"id": str(c["_id"]), "name": c["name"], "score": round(c["score"], 3)}
                    for c in candidates
                ],
            }

        # Genuinely new — creation happens in resolve() once the whole batch
        # is confirmed to proceed (no phantom exercises from aborted calls).
        return {
            "status": "create_pending",
            "exercise_id": None,
            "exercise_name": name,
            "matched_name": None,
            "method": "create_pending",
            "score": None,
            "candidates": [],
        }

    async def _vector_candidates(
        self, text: str, visibility: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """$vectorSearch the catalog with an ad-hoc query embedding. Unlike
        ExerciseService.find_similar this needs no existing source document.
        Fail-soft: no key / no index / API error just means no vector signal."""
        query_vector = await generate_embedding(text)
        if not query_vector:
            return []
        try:
            docs = await self.db.exercises.aggregate([
                {
                    "$vectorSearch": {
                        "index": "exercise_vector_index",
                        "path": "embedding",
                        "queryVector": query_vector,
                        "numCandidates": 100,
                        "limit": MAX_CANDIDATES,
                        "filter": visibility,
                    }
                },
                {"$project": {"name": 1, "score": {"$meta": "vectorSearchScore"}}},
            ]).to_list(MAX_CANDIDATES)
            return [d for d in docs if d.get("score") is not None]
        except Exception as e:
            logger.warning(f"exercise_resolution vector search unavailable: {e}")
            return []

    @staticmethod
    def _merge_candidates(
        fuzzy_scored: List[Tuple[float, Dict[str, Any]]],
        vec_candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Medium-confidence hits from both signals, deduped by id, best first."""
        merged: Dict[str, Dict[str, Any]] = {}
        for score, ex in fuzzy_scored[:MAX_CANDIDATES]:
            if score >= FUZZY_CANDIDATE:
                merged[str(ex["_id"])] = {
                    "_id": ex["_id"], "name": ex["name"], "score": score, "method": "fuzzy",
                }
        for d in vec_candidates:
            if d["score"] >= VECTOR_CANDIDATE:
                key = str(d["_id"])
                if key not in merged or d["score"] > merged[key]["score"]:
                    merged[key] = {
                        "_id": d["_id"], "name": d["name"], "score": d["score"], "method": "vector",
                    }
        return sorted(merged.values(), key=lambda c: c["score"], reverse=True)[:MAX_CANDIDATES]

    async def _create_exercise(
        self, item: Dict[str, Any], name: str, user_oid: ObjectId
    ) -> Dict[str, Any]:
        """Create a private catalog entry for a genuinely new exercise. The
        Sensei tool contracts ask the LLM for muscles/discipline per exercise
        exactly so this document is well-classified, not a placeholder."""
        # Race guard (mirrors app.core.dedup): another request may have created
        # it between our catalog load and now.
        existing = await self.db.exercises.find_one({
            "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            "$or": [{"isCommon": True}, {"createdBy": user_oid}],
        }, {"name": 1})
        if existing:
            return existing

        doc = {
            "name": name,
            "description": f"{name} — added automatically from a generated workout",
            "muscles": item.get("muscles") or ["Full Body"],
            "secondaryMuscles": [],
            "discipline": item.get("discipline") or ["General Fitness"],
            "equipment": item.get("equipment") or [],
            "difficulty": item.get("difficulty") or "intermediate",
            "instructions": [],
            "isCommon": False,
            "createdBy": user_oid,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        await attach_embedding(doc)
        result = await self.db.exercises.insert_one(doc)
        doc["_id"] = result.inserted_id
        logger.info(
            "exercise_resolution_created",
            user_id=str(user_oid), name=name,
            muscles=doc["muscles"], discipline=doc["discipline"],
        )
        return doc

    @staticmethod
    def _result(
        status: str, exercise_id: Any, matched_name: str, method: str, score: Optional[float]
    ) -> Dict[str, Any]:
        return {
            "status": status,
            "exercise_id": exercise_id,
            "matched_name": matched_name,
            "method": method,
            "score": score,
            "candidates": [],
        }


def format_ambiguous_message(ambiguous: List[Dict[str, Any]]) -> str:
    """Tool-response text the coach relays when a name needs the user's call.

    Ends with explicit next-step instructions for the model — without them the
    LLM tends to retry the identical call and loop on the same ambiguity.
    """
    lines = ["I wasn't sure about some exercises — which did you mean?"]
    for entry in ambiguous:
        options = ", ".join(f"**{c['name']}**" for c in entry["candidates"])
        lines.append(f"- \"{entry['exercise_name']}\": {options} — or should I add it as a new exercise?")
    lines.append(
        "(After the user answers: to reuse a candidate, call this tool again using the "
        "candidate's EXACT name. To add it as a NEW exercise instead, call add_exercise "
        "with that name first, then retry this tool — do NOT repeat the same call unchanged.)"
    )
    return "\n".join(lines)
