from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
import structlog

from app.config import get_settings

router = APIRouter()
logger = structlog.get_logger()

# Valid options for progression fields
VALID_MUSCLES = [
    "chest", "back", "shoulders", "biceps", "triceps", "forearms",
    "abs", "hip_flexors", "glutes", "quads", "hamstrings", "calves", "full_body"
]
VALID_DISCIPLINES = ["strength", "climbing", "running", "cycling", "calisthenics", "mobility"]
VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"]


# ============ Request/Response Models ============

class ProgressionStepSuggestion(BaseModel):
    """A suggested step in a progression path."""
    order: int
    level: Optional[int] = None  # For parallel paths - steps with same level can be done in parallel
    exerciseName: str
    exerciseDifficulty: str = Field(..., pattern="^(beginner|intermediate|advanced)$")
    notes: Optional[str] = None
    targetMetrics: Optional[Dict[str, Any]] = None


class ProgressionSuggestion(BaseModel):
    """AI-suggested progression path."""
    name: str
    description: str
    goalExercise: str
    difficulty: str = Field(..., pattern="^(beginner|intermediate|advanced)$")
    discipline: List[str] = []
    muscles: List[str] = []
    estimatedWeeks: Optional[int] = None
    steps: List[ProgressionStepSuggestion] = []


class ProgressionSuggestionRequest(BaseModel):
    """Request for AI progression suggestion."""
    goalExercise: str = Field(..., min_length=2, description="The target exercise to create a progression for")
    currentLevel: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    availableEquipment: Optional[List[str]] = []


class ProgressionSuggestionResponse(BaseModel):
    """Response containing suggested progression."""
    suggestion: ProgressionSuggestion
    confidence: float = Field(..., ge=0.0, le=1.0)


# ============ Prompts ============

PROGRESSION_SUGGESTION_PROMPT = """You are an expert AI fitness coach specializing in exercise progressions and skill development.

TASK: Create a personalized progression path for the user to master a goal exercise.

Goal exercise: {goal_exercise}
User's current level: {current_level}
Available equipment: {equipment}

PRINCIPLES (inherited from fitness coaching system):
1. Everything created is PERSONAL to this user
2. Match the user's current fitness level and available equipment
3. Use proper volume/intensity progression based on ability
4. Be precise with exercise names - use real, commonly known exercises
5. Consider compound movements and how they target multiple muscle groups

Create a progression with 5-10 steps. IMPORTANT: Many exercises should be trained IN PARALLEL.

Respond with a JSON object containing:
- name: A clear name for this progression (e.g., "Pull-up Progression", "Muscle-up Journey")
- description: 2-3 sentences explaining what this progression will help achieve
- goalExercise: The final goal exercise name (properly capitalized)
- difficulty: Overall difficulty of the goal. Valid: {difficulties}
- discipline: Main training disciplines (array). Valid: {disciplines}
- muscles: Primary muscle groups targeted (array). Valid: {muscles}
- estimatedWeeks: Realistic estimate of weeks to complete (for average person training 3x/week)
- steps: Array of progression steps, each with:
  - order: Unique step number (0-indexed)
  - level: Level number for parallel training. CRITICAL: Steps with the SAME level should be trained TOGETHER in parallel.
    Level indicates WHEN in the progression. Exercises at same level complement each other.
  - exerciseName: Proper exercise name (real exercises only!)
  - exerciseDifficulty: beginner/intermediate/advanced
  - notes: Brief tip or focus point for this step
  - targetMetrics: Object with goals like {{"reps": 10, "sets": 3}} or {{"holdTime": 30}}

PARALLEL STEP GUIDELINES:
- Group complementary exercises at the same level when they should be trained together
- For muscle-up progression:
  - Level 3: Chest-to-bar Pull-ups AND Bar Dips - SAME LEVEL, train together
  - Level 4: Explosive Pull-ups AND Deep Dips - SAME LEVEL, train together
- For handstand progression:
  - Level 2: Wall Handstands AND Hollow Body Holds - SAME LEVEL, train together
- For front lever:
  - Level 3: Tuck Front Lever AND Active Hang - SAME LEVEL, train together

- Early steps are often sequential (building foundation)
- Middle/advanced steps often have 2-4 pairs of parallel exercises
- Think about what exercises are commonly done in the same training session
- Consider push/pull balance for upper body progressions

Respond with ONLY the JSON object, no additional text."""


# ============ Endpoints ============

@router.post("/suggest", response_model=ProgressionSuggestionResponse)
async def suggest_progression(request: ProgressionSuggestionRequest) -> ProgressionSuggestionResponse:
    """
    Get AI-powered suggestion for a complete progression path to a goal exercise.
    """
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    equipment_str = ", ".join(request.availableEquipment) if request.availableEquipment else "bodyweight only"
    current_level = request.currentLevel or "beginner"

    prompt = PROGRESSION_SUGGESTION_PROMPT.format(
        goal_exercise=request.goalExercise,
        current_level=current_level,
        equipment=equipment_str,
        difficulties=", ".join(VALID_DIFFICULTIES),
        disciplines=", ".join(VALID_DISCIPLINES),
        muscles=", ".join(VALID_MUSCLES)
    )

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are a fitness progression expert. Respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=1500
        )

        content = response.choices[0].message.content.strip()

        # Handle markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()

        data = json.loads(content)

        # Validate and filter
        discipline = [d for d in data.get("discipline", []) if d in VALID_DISCIPLINES]
        muscles = [m for m in data.get("muscles", []) if m in VALID_MUSCLES]
        difficulty = data.get("difficulty") if data.get("difficulty") in VALID_DIFFICULTIES else "intermediate"

        # Build steps
        steps = []
        for i, step in enumerate(data.get("steps", [])):
            step_difficulty = step.get("exerciseDifficulty")
            if step_difficulty not in VALID_DIFFICULTIES:
                step_difficulty = "beginner" if i < len(data.get("steps", [])) // 2 else "intermediate"

            steps.append(ProgressionStepSuggestion(
                order=step.get("order", i),
                level=step.get("level", step.get("order", i)),  # Use level if provided, else fall back to order
                exerciseName=step.get("exerciseName", f"Step {i+1}"),
                exerciseDifficulty=step_difficulty,
                notes=step.get("notes"),
                targetMetrics=step.get("targetMetrics")
            ))

        suggestion = ProgressionSuggestion(
            name=data.get("name", f"{request.goalExercise} Progression"),
            description=data.get("description", ""),
            goalExercise=data.get("goalExercise", request.goalExercise),
            difficulty=difficulty,
            discipline=discipline or ["calisthenics"],
            muscles=muscles,
            estimatedWeeks=data.get("estimatedWeeks"),
            steps=steps
        )

        logger.info(f"Generated progression suggestion for: {request.goalExercise}")

        return ProgressionSuggestionResponse(
            suggestion=suggestion,
            confidence=0.85
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse progression suggestion")
    except Exception as e:
        logger.error(f"Error generating progression suggestion: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate progression suggestion")


# ============ Streaming Endpoint ============

STREAMING_PROGRESSION_PROMPT = """You are a fitness progression expert. Given a goal exercise, create a complete progression path.

Goal exercise: {goal_exercise}
User level: {current_level}
Equipment: {equipment}

Respond with a JSON object containing these fields IN ORDER for streaming:
1. "name": Progression name (e.g., "Pull-up Progression")
2. "description": 2-3 sentence description
3. "goalExercise": The properly capitalized goal exercise name
4. "discipline": Array of disciplines. Valid: {disciplines}
5. "muscles": Array of muscles. Valid: {muscles}
6. "estimatedWeeks": Number of weeks estimate
7. "steps": Array of 4-8 steps, each with:
   - order: step number (0-indexed)
   - exerciseName: proper exercise name
   - exerciseDifficulty: beginner/intermediate/advanced
   - notes: brief tip
   - targetMetrics: e.g., {{"reps": 10, "sets": 3}}

Start from absolute beginner level and progress logically to the goal.
Output ONLY the JSON object."""


async def stream_progression_suggestion(goal_exercise: str, current_level: str, equipment: List[str]):
    """Generator that streams progression suggestion as SSE events."""
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    equipment_str = ", ".join(equipment) if equipment else "bodyweight only"

    prompt = STREAMING_PROGRESSION_PROMPT.format(
        goal_exercise=goal_exercise,
        current_level=current_level or "beginner",
        equipment=equipment_str,
        disciplines=", ".join(VALID_DISCIPLINES),
        muscles=", ".join(VALID_MUSCLES)
    )

    try:
        stream = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are a fitness progression expert. Respond only with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=1500,
            stream=True
        )

        full_content = ""
        sent_fields = set()

        # Fields to extract in order
        field_order = ["name", "description", "goalExercise", "discipline", "muscles", "estimatedWeeks", "steps"]

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                full_content += chunk.choices[0].delta.content

                # Try to extract completed fields
                for field in field_order:
                    if field in sent_fields:
                        continue

                    field_value = extract_progression_field(full_content, field)
                    if field_value is not None:
                        validated = validate_progression_field(field, field_value)
                        if validated is not None:
                            sent_fields.add(field)
                            event_data = json.dumps({"field": field, "value": validated})
                            yield f"data: {event_data}\n\n"

        yield f"data: {json.dumps({'complete': True})}\n\n"

    except Exception as e:
        logger.error(f"Error in streaming progression suggestion: {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


def extract_progression_field(content: str, field: str):
    """Extract a complete field value from partial JSON."""
    import re
    try:
        if field in ["name", "description", "goalExercise"]:
            match = re.search(rf'"{field}"\s*:\s*"([^"]*)"', content)
            if match:
                return match.group(1)

        elif field in ["discipline", "muscles"]:
            pattern = rf'"{field}"\s*:\s*\[([^\]]*)\]'
            match = re.search(pattern, content)
            if match:
                array_content = match.group(1)
                items = re.findall(r'"([^"]*)"', array_content)
                return items

        elif field == "estimatedWeeks":
            match = re.search(r'"estimatedWeeks"\s*:\s*(\d+)', content)
            if match:
                return int(match.group(1))

        elif field == "steps":
            # Look for complete steps array
            pattern = r'"steps"\s*:\s*\[(.*)\]'
            match = re.search(pattern, content, re.DOTALL)
            if match:
                try:
                    steps_content = "[" + match.group(1) + "]"
                    # Try to parse as JSON
                    steps = json.loads(steps_content)
                    return steps
                except json.JSONDecodeError:
                    pass

    except Exception:
        pass
    return None


def validate_progression_field(field: str, value):
    """Validate and filter progression field values."""
    if field in ["name", "description", "goalExercise"]:
        return value if value else None

    elif field == "muscles":
        return [m for m in value if m in VALID_MUSCLES] if value else None

    elif field == "discipline":
        return [d for d in value if d in VALID_DISCIPLINES] if value else None

    elif field == "estimatedWeeks":
        return value if isinstance(value, int) and value > 0 else None

    elif field == "steps":
        if not value:
            return None
        validated_steps = []
        for i, step in enumerate(value):
            difficulty = step.get("exerciseDifficulty", "beginner")
            if difficulty not in VALID_DIFFICULTIES:
                difficulty = "beginner"
            validated_steps.append({
                "order": step.get("order", i),
                "level": step.get("level", step.get("order", i)),  # Support parallel paths
                "exerciseName": step.get("exerciseName", f"Step {i+1}"),
                "exerciseDifficulty": difficulty,
                "notes": step.get("notes"),
                "targetMetrics": step.get("targetMetrics")
            })
        return validated_steps

    return value


@router.post("/suggest/stream")
async def suggest_progression_stream(request: ProgressionSuggestionRequest):
    """
    Stream AI-powered progression suggestion.
    Returns Server-Sent Events with each field as it becomes available.
    """
    return StreamingResponse(
        stream_progression_suggestion(
            request.goalExercise,
            request.currentLevel,
            request.availableEquipment or []
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
