from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
import json
import re
import structlog

from app.config import get_settings
from app.models.schemas import (
    ExerciseSuggestionRequest,
    ExerciseSuggestionResponse,
    ExerciseSuggestion,
    StrainSuggestion
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
            temperature=0.3,  # Lower temperature for more consistent/accurate responses
            max_tokens=800
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
            temperature=0.3,
            max_tokens=800,
            stream=True
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
