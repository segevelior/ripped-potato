from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from bson import ObjectId
import json
import re
import structlog

from app.config import get_settings
from app.middleware.auth import get_current_user
from app.models.schemas import (
    ExerciseSuggestionRequest,
    ExerciseSuggestionResponse,
    ExerciseSuggestion,
    StrainSuggestion
)
from app.core.agents.skills.substitute_exercise_skill import (
    score_substitute,
    equipment_ok,
    _is_pain_reason,
    _ALWAYS_AVAILABLE,
)

router = APIRouter()
logger = structlog.get_logger()

# Valid options for exercise fields (for validation)
VALID_MUSCLES = [
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "abs", "hip_flexors", "glutes", "quads", "hamstrings", "calves", "full_body"
]
VALID_DISCIPLINES = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"]
VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"]
VALID_INTENSITIES = ["low", "moderate", "high", "max"]
VALID_LOADS = ["bodyweight", "light", "moderate", "heavy"]
VALID_DURATION_TYPES = ["reps", "time", "distance"]


EXERCISE_SUGGESTION_PROMPT = """You are a fitness expert. Given an exercise name, provide detailed information about it.

Exercise name: {exercise_name}

Respond with a JSON object containing:
- description: A brief 1-2 sentence description of the exercise and its benefits
- muscles: Primary muscle groups targeted (array). Valid options: {muscles}
- secondary_muscles: Secondary muscle groups involved (array). Same valid options as muscles.
- discipline: Training disciplines this fits (array). Valid options: {disciplines}
- equipment: Equipment needed (array of strings, e.g., ["barbell", "weight plates"])
- difficulty: Skill level required. Valid options: {difficulties}
- strain: Object with:
  - intensity: Valid options: {intensities}
  - load: Valid options: {loads}
  - duration_type: Valid options: {duration_types}
  - typical_volume: String like "3x8", "3x10-12", "30 seconds", etc.
- similar_exercises: Names of 2-4 similar exercises (array of strings)
- instructions: 3-5 brief technique cues (array of strings)

Be accurate and practical. Only use the valid options provided for each field.
Respond with ONLY the JSON object, no additional text."""


@router.post("/suggest", response_model=ExerciseSuggestionResponse)
async def suggest_exercise(request: ExerciseSuggestionRequest) -> ExerciseSuggestionResponse:
    """
    Get AI-powered suggestions to auto-fill exercise form fields based on exercise name.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    prompt = EXERCISE_SUGGESTION_PROMPT.format(
        exercise_name=request.name,
        muscles=", ".join(VALID_MUSCLES),
        disciplines=", ".join(VALID_DISCIPLINES),
        difficulties=", ".join(VALID_DIFFICULTIES),
        intensities=", ".join(VALID_INTENSITIES),
        loads=", ".join(VALID_LOADS),
        duration_types=", ".join(VALID_DURATION_TYPES)
    )

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are a fitness expert. Respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=800,
            **settings.llm_tuning_params(temperature=0.3)  # Lower temperature for more consistent/accurate responses
        )

        content = response.choices[0].message.content.strip()

        # Parse JSON response
        # Handle potential markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        data = json.loads(content)

        # Validate and filter to only valid options
        muscles = [m for m in data.get("muscles", []) if m in VALID_MUSCLES]
        secondary_muscles = [m for m in data.get("secondary_muscles", []) if m in VALID_MUSCLES]
        discipline = [d for d in data.get("discipline", []) if d in VALID_DISCIPLINES]
        difficulty = data.get("difficulty") if data.get("difficulty") in VALID_DIFFICULTIES else None

        # Build strain object
        strain_data = data.get("strain", {})
        strain = None
        if strain_data:
            strain = StrainSuggestion(
                intensity=strain_data.get("intensity", "moderate") if strain_data.get("intensity") in VALID_INTENSITIES else "moderate",
                load=strain_data.get("load", "moderate") if strain_data.get("load") in VALID_LOADS else "moderate",
                duration_type=strain_data.get("duration_type", "reps") if strain_data.get("duration_type") in VALID_DURATION_TYPES else "reps",
                typical_volume=strain_data.get("typical_volume", "3x8")
            )

        suggestion = ExerciseSuggestion(
            description=data.get("description", ""),
            muscles=muscles,
            secondary_muscles=secondary_muscles,
            discipline=discipline,
            equipment=data.get("equipment", []),
            difficulty=difficulty,
            strain=strain,
            similar_exercises=data.get("similar_exercises", [])[:5],  # Limit to 5
            instructions=data.get("instructions", [])[:5]  # Limit to 5
        )

        logger.info(f"Generated exercise suggestions for: {request.name}")

        return ExerciseSuggestionResponse(
            suggestions=suggestion,
            confidence=0.85
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse exercise suggestions")
    except Exception as e:
        logger.error(f"Error generating exercise suggestions: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate exercise suggestions")


# Streaming prompt - asks for fields in order for progressive display
STREAMING_PROMPT = """You are a fitness expert. Given an exercise name (which may be informal or abbreviated), provide detailed information about it.

Exercise name provided: {exercise_name}

Respond with a JSON object. Output the fields IN THIS EXACT ORDER so they can be streamed progressively:

1. "suggested_name": The proper/official exercise name (output this FIRST). If the user typed "flag", suggest "Human Flag". If they typed "pullup", suggest "Pull-ups". Always provide the clean, proper name.
2. "description": A brief 1-2 sentence description
3. "discipline": Training disciplines (array). Valid: {disciplines}
4. "muscles": Primary muscle groups (array). Valid: {muscles}
5. "equipment": Equipment needed (array of strings)
6. "similar_exercises": 2-4 similar exercise names (array)
7. "strain": Object with intensity ({intensities}), load ({loads}), duration_type ({duration_types}), typical_volume (string like "3x8")

Be accurate. Only use valid options. Output ONLY the JSON object."""


async def stream_exercise_suggestions(exercise_name: str):
    """Generator that streams exercise suggestions as SSE events."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    prompt = STREAMING_PROMPT.format(
        exercise_name=exercise_name,
        muscles=", ".join(VALID_MUSCLES),
        disciplines=", ".join(VALID_DISCIPLINES),
        intensities=", ".join(VALID_INTENSITIES),
        loads=", ".join(VALID_LOADS),
        duration_types=", ".join(VALID_DURATION_TYPES)
    )

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are a fitness expert. Respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_completion_tokens=800,
            stream=True,
            **settings.llm_tuning_params(temperature=0.3)
        )

        full_content = ""
        sent_fields = set()

        # Field detection patterns (in order of expected appearance)
        field_order = ["suggested_name", "description", "discipline", "muscles", "equipment", "similar_exercises", "strain"]

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                full_content += chunk.choices[0].delta.content

                # Try to parse partial JSON and extract completed fields
                for field in field_order:
                    if field in sent_fields:
                        continue

                    # Check if this field appears complete in the content
                    field_value = extract_field_if_complete(full_content, field)
                    if field_value is not None:
                        # Validate the field value
                        validated = validate_field(field, field_value)
                        if validated is not None:
                            sent_fields.add(field)
                            event_data = json.dumps({"field": field, "value": validated})
                            yield f"data: {event_data}\n\n"

        # Send completion event
        yield f"data: {json.dumps({'complete': True})}\n\n"

    except Exception as e:
        logger.error(f"Error in streaming exercise suggestions: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


def extract_field_if_complete(content: str, field: str):
    """Try to extract a complete field value from partial JSON."""
    try:
        if field == "suggested_name":
            # Match "suggested_name": "..." pattern
            match = re.search(r'"suggested_name"\s*:\s*"([^"]*)"', content)
            if match:
                return match.group(1)

        elif field == "description":
            # Match "description": "..." pattern
            match = re.search(r'"description"\s*:\s*"([^"]*)"', content)
            if match:
                return match.group(1)

        elif field in ["discipline", "muscles", "equipment", "similar_exercises"]:
            # Match array fields - need complete array
            pattern = rf'"{field}"\s*:\s*\[([^\]]*)\]'
            match = re.search(pattern, content)
            if match:
                array_content = match.group(1)
                # Parse the array items
                items = re.findall(r'"([^"]*)"', array_content)
                return items

        elif field == "strain":
            # Match strain object - need complete object
            pattern = r'"strain"\s*:\s*\{([^}]*)\}'
            match = re.search(pattern, content)
            if match:
                strain_content = match.group(1)
                strain_obj = {}
                for key in ["intensity", "load", "duration_type", "typical_volume"]:
                    key_match = re.search(rf'"{key}"\s*:\s*"([^"]*)"', strain_content)
                    if key_match:
                        strain_obj[key] = key_match.group(1)
                if strain_obj:
                    return strain_obj

    except Exception:
        pass
    return None


def validate_field(field: str, value):
    """Validate and filter field values to only valid options."""
    if field == "suggested_name":
        return value if value else None

    elif field == "description":
        return value if value else None

    elif field == "muscles":
        return [m for m in value if m in VALID_MUSCLES] if value else None

    elif field == "discipline":
        return [d for d in value if d in VALID_DISCIPLINES] if value else None

    elif field == "equipment":
        return value if value else None

    elif field == "similar_exercises":
        return value[:5] if value else None

    elif field == "strain":
        if not value:
            return None
        return {
            "intensity": value.get("intensity") if value.get("intensity") in VALID_INTENSITIES else "moderate",
            "load": value.get("load") if value.get("load") in VALID_LOADS else "moderate",
            "duration_type": value.get("duration_type") if value.get("duration_type") in VALID_DURATION_TYPES else "reps",
            "typical_volume": value.get("typical_volume", "3x8")
        }

    return value


@router.post("/suggest/stream")
async def suggest_exercise_stream(request: ExerciseSuggestionRequest):
    """
    Stream AI-powered suggestions for exercise form fields.
    Returns Server-Sent Events with each field as it becomes available.
    """
    return StreamingResponse(
        stream_exercise_suggestions(request.name),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


# ---------------------------------------------------------------------------
# Substitute ranking ("Ask the Sensei" replace)
# ---------------------------------------------------------------------------
# One-shot endpoint that returns replacement options for an exercise being
# swapped mid-workout. It grounds the LLM on real catalog candidates (so most
# options carry a real id), but MAY also propose fresh exercises the caller
# materializes before swapping. Pain/injury reasons route to a safety caution.


class SubstituteRankRequest(BaseModel):
    exercise_id: Optional[str] = None
    exercise_name: Optional[str] = None
    reason: Optional[str] = None
    count: int = 5


class SubstituteOption(BaseModel):
    source: str  # "catalog" | "new"
    id: Optional[str] = None
    name: str
    muscles: List[str] = []
    secondaryMuscles: List[str] = []
    discipline: List[str] = []
    equipment: List[str] = []
    difficulty: Optional[str] = None
    strain: Optional[Dict[str, Any]] = None
    note: Optional[str] = None


class SubstituteRankResponse(BaseModel):
    options: List[SubstituteOption] = []
    routed: Optional[str] = None
    message: Optional[str] = None
    fallback: bool = False


SAFETY_MESSAGE = (
    "Since this is about pain or an injury, I won't just swap in another loaded "
    "movement. If a clinician has cleared you to train around it, tell me which area "
    "to avoid and I'll suggest a variation. Otherwise please rest it or check with a "
    "professional — I can't prescribe rehab."
)

SUBSTITUTE_RANK_PROMPT = """You are a strength coach helping an athlete swap an exercise mid-workout.

Exercise to replace: {original_name}
Primary muscles: {original_muscles}
Why they want to swap: {reason}

Here are REAL exercises from their catalog that share muscles and fit their equipment,
already ranked by stimulus match (best first):
{candidates}

Pick the {count} best replacements. Prefer catalog options (they map to real logged
exercises). You MAY add at most 2 fresh exercises NOT in the list only if they would
clearly serve the athlete better.

Return ONLY a JSON object:
{{"options": [
  {{"source": "catalog", "id": "<exact id from the list>", "note": "<=12 words on why it fits"}},
  {{"source": "new", "name": "<exercise name>", "muscles": [...], "discipline": [...],
    "equipment": [...], "difficulty": "beginner|intermediate|advanced",
    "strain": {{"intensity": "...", "load": "...", "duration_type": "reps", "typical_volume": "3x10"}},
    "note": "<=12 words on why it fits"}}
]}}
For "catalog" options include ONLY source, id, note. Use ids EXACTLY as given; never invent an id."""


def _candidate_to_option(doc: Dict[str, Any], note: Optional[str] = None) -> Dict[str, Any]:
    """Project a Mongo exercise doc into a catalog option (includes strain for default sets)."""
    return {
        "source": "catalog",
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "muscles": doc.get("muscles", []) or [],
        "secondaryMuscles": doc.get("secondaryMuscles", []) or [],
        "discipline": doc.get("discipline", []) or [],
        "equipment": doc.get("equipment", []) or [],
        "difficulty": doc.get("difficulty"),
        "strain": doc.get("strain"),
        "note": note,
    }


async def _load_original(db, user_oid: ObjectId, req: SubstituteRankRequest) -> Optional[Dict[str, Any]]:
    ownership = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}
    if req.exercise_id:
        try:
            return await db.exercises.find_one({"_id": ObjectId(req.exercise_id), **ownership})
        except Exception:
            return None
    if req.exercise_name:
        return await db.exercises.find_one(
            {"name": {"$regex": f"^{re.escape(req.exercise_name)}$", "$options": "i"}, **ownership}
        )
    return None


@router.post("/substitute/rank", response_model=SubstituteRankResponse)
async def substitute_rank(
    request: SubstituteRankRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> SubstituteRankResponse:
    """Return catalog-grounded (and optionally fresh) replacement options for an exercise."""
    from app.main import db

    # Pain/injury requests never get an auto-swap.
    if _is_pain_reason(request.reason or ""):
        return SubstituteRankResponse(routed="safety", message=SAFETY_MESSAGE)

    try:
        user_oid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user.")

    original = await _load_original(db, user_oid, request)
    if not original:
        # Nothing to ground on — return empty rather than hallucinate blindly.
        return SubstituteRankResponse(options=[], fallback=True,
                                      message="Couldn't find that exercise to build alternatives from.")

    # Available equipment: user profile.
    user = await db.users.find_one({"_id": user_oid}, {"profile.preferences.equipment": 1})
    equipment_list = (((user or {}).get("profile") or {}).get("preferences") or {}).get("equipment") or []
    available = {(e or "").lower() for e in equipment_list} | _ALWAYS_AVAILABLE

    # Candidate pool: shares >=1 primary muscle, equipment-ok, ranked deterministically.
    ownership = {"$or": [{"isCommon": True}, {"createdBy": user_oid}]}
    query = {"muscles": {"$in": original.get("muscles", [])}, "_id": {"$ne": original["_id"]}, **ownership}
    candidates = await db.exercises.find(query).to_list(100)
    scored = [
        (score_substitute(original, c), c)
        for c in candidates
        if equipment_ok(c.get("equipment", []), available)
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    scored = [s for s in scored if s[0] > 0]

    pool = [c for _, c in scored[:8]]
    pool_by_id = {str(c["_id"]): c for c in pool}

    # Deterministic fallback options (used if the LLM call fails or returns nothing usable).
    deterministic = [_candidate_to_option(c) for c in pool[: request.count]]

    if not pool:
        return SubstituteRankResponse(options=[], fallback=True)

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    candidates_text = "\n".join(
        f'- id={str(c["_id"])} | {c.get("name")} | muscles={c.get("muscles", [])} | equipment={c.get("equipment", [])}'
        for c in pool
    )
    prompt = SUBSTITUTE_RANK_PROMPT.format(
        original_name=original.get("name", ""),
        original_muscles=", ".join(original.get("muscles", []) or []) or "n/a",
        reason=request.reason or "wants a change",
        candidates=candidates_text,
        count=request.count,
    )

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model_fast,
            messages=[
                {"role": "system", "content": "You are a strength coach. Respond only with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=900,
            **settings.llm_tuning_params(temperature=0.4),
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        data = json.loads(content)

        options: List[Dict[str, Any]] = []
        for raw in data.get("options", [])[: request.count]:
            source = raw.get("source")
            note = raw.get("note")
            if source == "catalog":
                doc = pool_by_id.get(raw.get("id"))
                if doc is not None:  # drop hallucinated ids
                    options.append(_candidate_to_option(doc, note))
            elif source == "new" and raw.get("name"):
                strain = raw.get("strain") or {}
                new_muscles = [m for m in raw.get("muscles", []) if m in VALID_MUSCLES]
                if not new_muscles:
                    # LLM returned no valid muscles — inherit the original's so the
                    # option is materializable (muscles is required by the Exercise
                    # model) and embeds/searches sensibly. Skip if still empty.
                    new_muscles = [m for m in (original.get("muscles") or []) if m in VALID_MUSCLES]
                if not new_muscles:
                    continue
                options.append({
                    "source": "new",
                    "id": None,
                    "name": raw["name"],
                    "muscles": new_muscles,
                    "secondaryMuscles": [],
                    "discipline": [d for d in raw.get("discipline", []) if d in VALID_DISCIPLINES] or ["strength"],
                    "equipment": raw.get("equipment", []) or [],
                    "difficulty": raw.get("difficulty") if raw.get("difficulty") in VALID_DIFFICULTIES else "beginner",
                    "strain": {
                        "intensity": strain.get("intensity") if strain.get("intensity") in VALID_INTENSITIES else "moderate",
                        "load": strain.get("load") if strain.get("load") in VALID_LOADS else "moderate",
                        "durationType": strain.get("duration_type") if strain.get("duration_type") in VALID_DURATION_TYPES else "reps",
                        "typicalVolume": strain.get("typical_volume", "3x10"),
                    },
                    "note": note,
                })

        if not options:
            return SubstituteRankResponse(options=deterministic, fallback=True)
        return SubstituteRankResponse(options=options)

    except Exception as e:
        logger.error(f"substitute_rank LLM failure, returning deterministic pool: {e}")
        return SubstituteRankResponse(options=deterministic, fallback=True)
