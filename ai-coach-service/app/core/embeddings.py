"""Exercise embedding helper — the Python twin of the Node write path
(backend/src/services/EmbeddingService.js + the Exercise pre-save hook).

Python services insert exercises with raw motor, which bypasses the Mongoose
pre-save hook that embeds them. Every Python exercise-create path calls
attach_embedding() so those documents are vector-searchable immediately
instead of waiting for the Node backfill.

Fail-soft by design: an embedding failure never blocks the insert — the doc
goes in without a vector and backend/scripts/backfillEmbeddings.js (or the
next Node save) fills it in.
"""

from typing import Any, Dict, List, Optional, Tuple

import structlog
from openai import AsyncOpenAI

from app.config import get_settings

logger = structlog.get_logger()

_client: Optional[AsyncOpenAI] = None


def _get_client() -> Optional[AsyncOpenAI]:
    global _client
    if _client is not None:
        return _client
    api_key = get_settings().openai_api_key
    if not api_key:
        return None
    _client = AsyncOpenAI(api_key=api_key)
    return _client


def build_embed_text(doc: Dict[str, Any]) -> str:
    """Port of Exercise.buildEmbedText (backend/src/models/Exercise.js).

    Omits the inferred movement pattern the Node version appends — porting that
    heuristic would fork it in two languages, and the Node pre-save guard
    re-embeds on the next Node save if the text differs, so the worst case is
    one redundant re-embed rather than a drifted heuristic.
    """
    parts = []
    if doc.get("name"):
        parts.append(doc["name"])
    muscles = [*(doc.get("muscles") or []), *(doc.get("secondaryMuscles") or [])]
    if muscles:
        parts.append(f"muscles: {', '.join(muscles)}")
    if doc.get("discipline"):
        parts.append(f"discipline: {', '.join(doc['discipline'])}")
    if doc.get("equipment"):
        parts.append(f"equipment: {', '.join(doc['equipment'])}")
    if doc.get("difficulty"):
        parts.append(f"difficulty: {doc['difficulty']}")
    if doc.get("mechanic"):
        parts.append(f"mechanic: {doc['mechanic']}")
    if doc.get("force"):
        parts.append(f"force: {doc['force']}")
    return " | ".join(parts)


async def generate_embedding(text: str) -> Optional[List[float]]:
    """Embed a single string. Returns None on empty input, missing key, or API
    failure — callers proceed without a vector."""
    text = (text or "").strip()
    if not text:
        return None
    client = _get_client()
    if client is None:
        logger.warning("embeddings: no OpenAI key configured — skipping")
        return None
    settings = get_settings()
    try:
        res = await client.embeddings.create(
            model=settings.embedding_model,
            input=text,
            dimensions=settings.embedding_dims,
        )
        return res.data[0].embedding
    except Exception as e:
        logger.warning(f"embeddings: generation failed, inserting without vector: {e}")
        return None


async def attach_embedding(exercise_data: Dict[str, Any]) -> Dict[str, Any]:
    """Set embedding + embeddingText on an exercise document about to be
    inserted. Mutates and returns the dict; a failed embedding leaves it
    untouched (fail-soft)."""
    embed_text = build_embed_text(exercise_data)
    vector = await generate_embedding(embed_text)
    if vector:
        exercise_data["embedding"] = vector
        exercise_data["embeddingText"] = embed_text
    return exercise_data
