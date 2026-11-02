"""Real-LLM eval for the live-session "Describe it" parser.

Grades only the extraction (name + sets + flags) against the fast model from
.env; the catalog match is stubbed out so no database is touched. Each case is
the kind of note an athlete types between sets.

    RUN_LLM_EVALS=1 pytest evals/test_describe_exercise.py -q
"""
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

import app.api.v1.exercises as ex
from app.core.agents.services import exercise_resolver as resolver_mod

CURRENT_USER = {"user_id": str(ObjectId()), "email": "eval@t.co", "username": "eval"}

# (note, name keyword, expected [(weight_kg, reps)] or None to skip, extra checks)
CASES = [
    ("bench 60kg x10, 70 x8, 75 x6", "bench", [(60, 10), (70, 8), (75, 6)], {}),
    ("pullups, did 8 then 7 then 6", "pull", [(0, 8), (0, 7), (0, 6)], {}),
    ("bulgarian split squats 3x10 each leg with 12kg dumbbells", "split squat",
     [(12, 10)] * 3, {"notes_contains": "leg"}),
    ("squat 5x5 @ 100", "squat", [(100, 5)] * 5, {}),
    ("deadlift 225lb x5, 245 lb x3", "deadlift", [(102, 5), (111, 3)], {}),
    ("weighted dips +10kg 3x8", "dip", [(10, 8)] * 3, {}),
    ("ohp 4 sets of 6 at 40", "press", [(40, 6)] * 4, {}),
    ("lat pulldown 3x10-12 55kg", "pulldown", [(55, 10)] * 3, {}),
    ("face pulls 3 sets 15 reps light", "face pull", None, {"set_count": 3}),
    ("did some push ups, 20 15 12", "push", [(0, 20), (0, 15), (0, 12)], {}),
    ("kb swings 24kg 5x15", "swing", [(24, 15)] * 5, {}),
    ("hip thrust", "hip thrust", [], {}),
    ("pullups 3x8 and dips 3x10", "pull", [(0, 8)] * 3, {"multiple": True}),
    ("what should I eat after training?", None, None, {"unreadable": True}),
    ("barbell rows 4x8 70kg slow negatives", "row", [(70, 8)] * 4, {"notes_contains": "slow"}),
    ("zercher carry 3 rounds of 40m with 60kg", "carry", [(60, 0)] * 3, {"notes_contains": "40"}),
]


@pytest.fixture(autouse=True)
def stub_catalog(monkeypatch):
    async def resolve(self, user_id, items, *, on_ambiguous="ask", create=True):
        return [{"status": "create_pending", "exercise_id": None, "candidates": []}]

    monkeypatch.setattr(resolver_mod.ExerciseResolver, "resolve", resolve)
    # An empty catalog keeps grading on the model's own names.
    db = MagicMock()
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    db.exercises.find = MagicMock(return_value=cursor)
    monkeypatch.setattr("app.main.db", db)


@pytest.mark.parametrize("note,keyword,expected_sets,extra", CASES, ids=[c[0][:40] for c in CASES])
async def test_describe_extraction(note, keyword, expected_sets, extra):
    res = await ex.describe_exercise(ex.DescribeExerciseRequest(text=note), CURRENT_USER)

    if extra.get("unreadable"):
        assert res.status == "unreadable", f"expected unreadable, got {res.name!r}"
        return

    assert res.status == "new", res.message
    assert keyword in res.name.lower(), f"name {res.name!r} lacks {keyword!r}"
    got = [(s.weight_kg, s.reps) for s in res.sets]
    if expected_sets is not None:
        # Pound conversions land on quarter-kg; allow 1kg of slack.
        assert len(got) == len(expected_sets), got
        for (gw, gr), (ew, er) in zip(got, expected_sets):
            assert gr == er and abs(gw - ew) <= 1, got
    if "set_count" in extra:
        assert len(got) == extra["set_count"], got
    if "notes_contains" in extra:
        assert extra["notes_contains"] in res.notes.lower(), res.notes
    assert res.multiple_exercises is bool(extra.get("multiple")), res.multiple_exercises
