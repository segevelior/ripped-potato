"""
Skill: find_similar_exercises

Thin wrapper: the actual vector-search implementation lives in
ExerciseService.find_similar (the service/"tool" layer). This skill just exposes
it to the LLM with a description + parameter schema and delegates, mirroring how
generate_plan_skill delegates to ctx.exercise_service.grep_exercises.

READ-ONLY capability — it fetches semantic neighbours (movement pattern, muscles,
equipment) via the shared Atlas vector index; it never generates or writes
embeddings.

Distinct from `substitute_exercise`: that skill is equipment-gated and enforces a
pain-reason safety gate to *prescribe* one swap. This one just surfaces similar
options for the coach to reason over.
"""

from typing import Any, Dict

from app.core.agents.skills.registry import SkillContext, skill


@skill(
    name="find_similar_exercises",
    description=(
        "Fetch exercises SIMILAR to a given one via semantic vector search (movement "
        "pattern, muscles, equipment) — the coach's read-only lookup for 'what else is "
        "like this / what could I do instead'. Returns ranked neighbours with a "
        "similarity score. Use substitute_exercise instead when the user wants one "
        "equipment-aware swap prescribed."
    ),
    parameters={
        "type": "object",
        "properties": {
            "exercise_id": {"type": "string", "description": "ID of the source exercise."},
            "exercise_name": {"type": "string", "description": "Name of the source exercise (if no ID)."},
            "limit": {"type": "integer", "description": "Max neighbours to return (default 6, max 25)."},
        },
    },
)
async def find_similar_exercises(ctx: SkillContext, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    return await ctx.exercise_service.find_similar(user_id, args)
