"""
Deterministic tests for the add_exercise dedup guard.

Regression cover for the bug where the coach created a duplicate 'Scapula Warm Up 2'
exercise even though a common one already existed. The guard must:
  - never insert a second exercise with an existing (case-insensitive) name,
  - report created=False so the model can't read a reuse as task-complete,
  - surface a hint toward create_workout_template when a same-named template exists.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.core.agents.services.exercise_service import ExerciseService

USER_ID = "6a50b08cfc7515275d6e0e68"


def _service(existing_exercise=None, existing_template=None):
    db = MagicMock()
    db.exercises.find_one = AsyncMock(return_value=existing_exercise)
    db.predefinedworkouts.find_one = AsyncMock(return_value=existing_template)
    db.exercises.insert_one = AsyncMock(
        return_value=MagicMock(inserted_id="710000000000000000000099")
    )
    return ExerciseService(db), db


@pytest.mark.asyncio
async def test_reuses_existing_exercise_and_does_not_insert():
    existing = {"_id": "710000000000000000000003", "name": "Scapula Warm Up 2"}
    svc, db = _service(existing_exercise=existing)

    res = await svc.add_exercise(USER_ID, {"name": "scapula warm up 2", "muscles": ["Shoulders"]})

    assert res["success"] is True
    assert res["already_exists"] is True
    assert res["created"] is False
    assert res["exercise_id"] == "710000000000000000000003"
    db.exercises.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_hint_points_to_template_when_name_matches_a_workout():
    existing = {"_id": "710000000000000000000003", "name": "Scapula Warm Up 2"}
    template = {"_id": "720000000000000000000001"}
    svc, _ = _service(existing_exercise=existing, existing_template=template)

    res = await svc.add_exercise(USER_ID, {"name": "Scapula Warm Up 2", "muscles": ["Shoulders"]})

    assert res["created"] is False
    assert res["hint"] and "create_workout_template" in res["hint"]


@pytest.mark.asyncio
async def test_no_hint_when_no_matching_template():
    existing = {"_id": "710000000000000000000003", "name": "Scapula Warm Up 2"}
    svc, _ = _service(existing_exercise=existing, existing_template=None)

    res = await svc.add_exercise(USER_ID, {"name": "Scapula Warm Up 2", "muscles": ["Shoulders"]})

    assert res["hint"] is None


@pytest.mark.asyncio
async def test_creates_when_name_is_new():
    svc, db = _service(existing_exercise=None)

    res = await svc.add_exercise(USER_ID, {"name": "Brand New Move", "muscles": ["Core"]})

    assert res["success"] is True
    assert res.get("already_exists") is None  # not a dedup response
    db.exercises.insert_one.assert_called_once()
