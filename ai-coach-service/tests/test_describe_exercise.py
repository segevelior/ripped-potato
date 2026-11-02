"""Tests for the live-session "Describe it" endpoints (free text → one exercise)."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from pydantic import ValidationError

import app.api.v1.exercises as ex
from app.core.agents.services import exercise_resolver as resolver_mod

USER_ID = str(ObjectId())
CURRENT_USER = {"user_id": USER_ID, "email": "t@t.co", "username": "t"}
BENCH_ID = ObjectId()


def _mock_openai(monkeypatch, payload=None, fail=False, raw=None):
    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        if fail:
            raise RuntimeError("llm boom")
        response = MagicMock()
        response.choices[0].message.content = raw if raw is not None else json.dumps(payload)
        return response

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=create)
    monkeypatch.setattr(ex, "AsyncOpenAI", MagicMock(return_value=client))
    return captured


def _mock_db(monkeypatch, names=("Barbell Bench Press", "Pull-up"), own=(), units="metric"):
    """Fake db for /describe: find(...).sort(...).to_list → own names for the
    createdBy query, shared names for the isCommon query."""
    db = MagicMock()

    def find(query, projection=None):
        docs = own if "createdBy" in query else names
        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=[{"_id": ObjectId(), "name": n} for n in docs])
        return cursor

    db.exercises.find = MagicMock(side_effect=find)
    db.users.find_one = AsyncMock(return_value={"settings": {"units": units}})
    monkeypatch.setattr("app.main.db", db)
    return db


def _mock_resolver(monkeypatch, result):
    calls = {}

    async def resolve(self, user_id, items, *, on_ambiguous="ask", create=True):
        calls.update(user_id=user_id, items=items, on_ambiguous=on_ambiguous, create=create)
        return [result]

    monkeypatch.setattr(resolver_mod.ExerciseResolver, "resolve", resolve)
    _mock_db(monkeypatch)
    return calls


def _payload(**overrides):
    base = {
        "name": "Bench Press",
        "notes": "",
        "sets": [{"weight": 60, "unit": "kg", "reps": 10}, {"weight": 70, "unit": "kg", "reps": 8}],
        "muscles": ["chest", "triceps"],
        "discipline": ["strength"],
        "equipment": ["barbell"],
        "multiple_exercises": False,
    }
    base.update(overrides)
    return base


RESOLVED = {"status": "resolved", "exercise_id": BENCH_ID, "matched_name": "Bench Press",
            "method": "exact", "score": None, "candidates": []}


# ---------------------------- _normalize_sets ----------------------------

class TestNormalizeSets:
    def test_per_set_weights_kept(self):
        out = ex._normalize_sets([{"weight": 60, "unit": "kg", "reps": 10}, {"weight": 75, "reps": 6}])
        assert out == [{"weight_kg": 60, "reps": 10}, {"weight_kg": 75, "reps": 6}]

    def test_pounds_converted_to_quarter_kg(self):
        out = ex._normalize_sets([{"weight": 135, "unit": "lb", "reps": 5}])
        assert out == [{"weight_kg": 61.25, "reps": 5}]

    def test_values_clamped(self):
        out = ex._normalize_sets([{"weight": -5, "reps": 900}, {"weight": 9000, "reps": -1}])
        assert out == [{"weight_kg": 0, "reps": ex.MAX_REPS}, {"weight_kg": ex.MAX_WEIGHT_KG, "reps": 0}]

    def test_set_count_capped(self):
        assert len(ex._normalize_sets([{"weight": 0, "reps": 5}] * 40)) == ex.MAX_DESCRIBED_SETS

    def test_garbage_entries_skipped(self):
        out = ex._normalize_sets(["3x10", None, {"weight": "heavy", "reps": 5}, {"reps": "8"}])
        assert out == [{"weight_kg": 0, "reps": 8}]

    def test_non_list_yields_empty(self):
        assert ex._normalize_sets("3x10") == []


# ---------------------------- request schema ----------------------------

class TestRequestSchema:
    def test_empty_text_rejected(self):
        with pytest.raises(ValidationError):
            ex.DescribeExerciseRequest(text="")

    def test_oversized_text_rejected(self):
        with pytest.raises(ValidationError):
            ex.DescribeExerciseRequest(text="x" * 501)


# ---------------------------- /describe ----------------------------

class TestDescribeExercise:
    async def test_matched_returns_catalog_id_and_sets(self, monkeypatch):
        captured = _mock_openai(monkeypatch, payload=_payload(name="bench"))
        calls = _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 60kg x10, 70 x8"), CURRENT_USER)
        assert res.status == "matched"
        assert res.exercise_id == str(BENCH_ID)
        assert res.name == "Bench Press"  # catalog name wins over the LLM's
        assert [(s.weight_kg, s.reps) for s in res.sets] == [(60, 10), (70, 8)]
        # Preview only: the resolver must never create during /describe.
        assert calls["create"] is False
        assert calls["on_ambiguous"] == "ask"
        assert captured["model"] == ex.get_settings().openai_model_fast
        assert "bench 60kg x10, 70 x8" in captured["messages"][1]["content"]

    async def test_prompt_grounded_on_visible_catalog_names(self, monkeypatch):
        captured = _mock_openai(monkeypatch, payload=_payload())
        _mock_resolver(monkeypatch, RESOLVED)
        db = _mock_db(monkeypatch, names=("Barbell Bench Press", "Pull-up"), own=("My Carry", "Pull-up"))
        await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 3x8"), CURRENT_USER)
        prompt = captured["messages"][1]["content"]
        # Own exercises first, then shared; de-duplicated.
        assert "My Carry\nPull-up\nBarbell Bench Press" in prompt
        queries = [c.args[0] for c in db.exercises.find.call_args_list]
        assert {"createdBy": ObjectId(USER_ID)} in queries
        assert {"isCommon": True} in queries

    async def test_imperial_user_defaults_to_pounds(self, monkeypatch):
        captured = _mock_openai(monkeypatch, payload=_payload(sets=[{"weight": 135, "reps": 5}]))
        _mock_resolver(monkeypatch, RESOLVED)
        _mock_db(monkeypatch, units="imperial")
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 135 x5"), CURRENT_USER)
        assert '"unit": "lb"' in captured["messages"][1]["content"]
        assert [(s.weight_kg, s.reps) for s in res.sets] == [(61.25, 5)]

    async def test_metric_user_unitless_weight_stays_kg(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(sets=[{"weight": 100, "reps": 5}]))
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 100 x5"), CURRENT_USER)
        assert [(s.weight_kg, s.reps) for s in res.sets] == [(100, 5)]

    async def test_loose_fuzzy_match_becomes_suggestion(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name="Hip Thrust"))
        hit_id = ObjectId()
        _mock_resolver(monkeypatch, {"status": "resolved", "exercise_id": hit_id,
                                     "matched_name": "Single-Leg Hip Thrust", "method": "fuzzy",
                                     "score": 0.9, "candidates": []})
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="hip thrust 3x10"), CURRENT_USER)
        assert res.status == "ambiguous"
        assert res.exercise_id is None
        assert [(c.id, c.name) for c in res.candidates] == [(str(hit_id), "Single-Leg Hip Thrust")]

    async def test_vector_match_becomes_suggestion(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name="Hip Thrust"))
        _mock_resolver(monkeypatch, {"status": "resolved", "exercise_id": ObjectId(),
                                     "matched_name": "Glute Bridge", "method": "vector",
                                     "score": 0.93, "candidates": []})
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="hip thrust"), CURRENT_USER)
        assert res.status == "ambiguous"

    async def test_same_words_fuzzy_match_is_accepted(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name="Push Ups"))
        _mock_resolver(monkeypatch, {"status": "resolved", "exercise_id": ObjectId(),
                                     "matched_name": "Push-Up", "method": "fuzzy",
                                     "score": 0.85, "candidates": []})
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="push ups 3x20"), CURRENT_USER)
        assert res.status == "matched"
        assert res.name == "Push-Up"

    async def test_ambiguous_returns_top_three_candidates(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name="Landmine Twist"))
        cands = [{"id": str(ObjectId()), "name": f"Twist {i}", "score": 0.8} for i in range(5)]
        _mock_resolver(monkeypatch, {"status": "ambiguous", "exercise_id": None, "candidates": cands})
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="landmine twist 3x12"), CURRENT_USER)
        assert res.status == "ambiguous"
        assert res.exercise_id is None
        assert [c.name for c in res.candidates] == ["Twist 0", "Twist 1", "Twist 2"]
        assert res.name == "Landmine Twist"

    async def test_create_pending_maps_to_new(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name="Zercher Carry"))
        _mock_resolver(monkeypatch, {"status": "create_pending", "exercise_id": None, "candidates": []})
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="zercher carry"), CURRENT_USER)
        assert res.status == "new"
        assert res.exercise_id is None
        assert res.name == "Zercher Carry"

    async def test_invalid_vocab_filtered(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(muscles=["chest", "soul"], discipline=["vibes", "strength"]))
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench"), CURRENT_USER)
        assert res.muscles == ["chest"]
        assert res.discipline == ["strength"]

    async def test_multiple_exercises_flag_passed_through(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(multiple_exercises=True))
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 3x8 and dips 3x10"), CURRENT_USER)
        assert res.multiple_exercises is True

    async def test_no_exercise_found_is_unreadable_without_resolving(self, monkeypatch):
        _mock_openai(monkeypatch, payload=_payload(name=""))
        calls = _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="hello there"), CURRENT_USER)
        assert res.status == "unreadable"
        assert res.message
        assert calls == {}

    async def test_llm_failure_is_unreadable_not_500(self, monkeypatch):
        _mock_openai(monkeypatch, fail=True)
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 3x8"), CURRENT_USER)
        assert res.status == "unreadable"
        assert res.message

    async def test_prose_reply_is_unreadable(self, monkeypatch):
        _mock_openai(monkeypatch, raw="Sure! That sounds like bench press.")
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench 3x8"), CURRENT_USER)
        assert res.status == "unreadable"

    async def test_fenced_json_accepted(self, monkeypatch):
        _mock_openai(monkeypatch, raw="```json\n" + json.dumps(_payload()) + "\n```")
        _mock_resolver(monkeypatch, RESOLVED)
        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="bench"), CURRENT_USER)
        assert res.status == "matched"


# ---------------------------- /describe/commit ----------------------------

class TestCommitDescribedExercise:
    async def test_creates_private_exercise_with_filtered_vocab(self, monkeypatch):
        new_id = ObjectId()
        seen = {}

        async def create_private(self, user_id, item):
            seen.update(user_id=user_id, item=item)
            return {"_id": new_id, "name": item["exercise_name"]}

        monkeypatch.setattr(resolver_mod.ExerciseResolver, "create_private", create_private)
        monkeypatch.setattr("app.main.db", MagicMock())
        req = ex.CommitDescribedExerciseRequest(
            name="  Zercher Carry ", muscles=["core", "abs"], discipline=["strength", "nope"],
        )
        res = await ex.commit_described_exercise(req, CURRENT_USER)
        assert res.exercise_id == str(new_id)
        assert res.name == "Zercher Carry"
        assert seen["user_id"] == USER_ID
        assert seen["item"]["muscles"] == ["abs"]
        assert seen["item"]["discipline"] == ["strength"]
        assert "added by you" in seen["item"]["description"]


class TestRealResolverVariants:
    """The real resolver against a catalog that only has a variant: it
    auto-accepts the lone substring hit, and /describe must not."""

    async def test_lone_variant_is_suggested_not_matched(self, monkeypatch):
        variant = {"_id": ObjectId(), "name": "Single-Leg Hip Thrust", "muscles": ["glutes"]}
        db = MagicMock()

        def find(query, projection=None):
            cursor = MagicMock()
            cursor.sort = MagicMock(return_value=cursor)
            cursor.to_list = AsyncMock(return_value=[variant])
            return cursor

        db.exercises.find = MagicMock(side_effect=find)
        db.users.find_one = AsyncMock(return_value={})
        monkeypatch.setattr("app.main.db", db)
        monkeypatch.setattr(resolver_mod, "generate_embedding", AsyncMock(return_value=None))
        _mock_openai(monkeypatch, payload=_payload(name="Hip Thrust"))

        res = await ex.describe_exercise(ex.DescribeExerciseRequest(text="hip thrust 3x10"), CURRENT_USER)
        assert res.status == "ambiguous"
        assert [c.name for c in res.candidates] == ["Single-Leg Hip Thrust"]


class TestResolverCreatePrivate:
    async def test_reuses_exact_name_instead_of_duplicating(self):
        existing = {"_id": ObjectId(), "name": "Zercher Carry"}
        db = MagicMock()
        db.exercises.find_one = AsyncMock(return_value=existing)
        db.exercises.insert_one = AsyncMock()
        out = await resolver_mod.ExerciseResolver(db).create_private(USER_ID, {"exercise_name": "zercher carry"})
        assert out is existing
        db.exercises.insert_one.assert_not_called()

    async def test_blank_name_rejected(self):
        with pytest.raises(ValueError):
            await resolver_mod.ExerciseResolver(MagicMock()).create_private(USER_ID, {"exercise_name": "  "})
