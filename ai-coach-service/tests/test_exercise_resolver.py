"""Tests for ExerciseResolver — the never-null exercise_id enforcement layer.

Covers each rung of the resolution ladder (verified id → exact → fuzzy →
vector → ambiguous → create) and the resolve_blocks post-conditions.
Embedding calls are stubbed out: no OpenAI traffic in tests.
"""

import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

import app.core.agents.services.exercise_resolver as resolver_module
from app.core.agents.services.exercise_resolver import (
    ExerciseResolver,
    UnresolvedExerciseError,
    format_ambiguous_message,
)

USER = ObjectId()

PLANK = {"_id": ObjectId(), "name": "Plank", "muscles": ["Core"], "discipline": ["Calisthenics"]}
PUSH_UP = {"_id": ObjectId(), "name": "Push-Up", "muscles": ["Chest"], "discipline": ["Calisthenics"]}
CHEST_PRESS = {"_id": ObjectId(), "name": "Chest Press Machine", "muscles": ["Chest"], "discipline": ["Strength"]}


def _db(catalog=None, vector_hits=None, created_id=None):
    """Fake motor db: find→catalog, aggregate→vector hits, find_one→id lookups."""
    db = MagicMock()
    catalog = catalog if catalog is not None else [PLANK, PUSH_UP, CHEST_PRESS]

    find_cursor = MagicMock()
    find_cursor.to_list = AsyncMock(return_value=catalog)
    db.exercises.find = MagicMock(return_value=find_cursor)

    agg_cursor = MagicMock()
    agg_cursor.to_list = AsyncMock(return_value=vector_hits or [])
    db.exercises.aggregate = MagicMock(return_value=agg_cursor)

    # Default: verified-id lookups and the create race guard find nothing.
    db.exercises.find_one = AsyncMock(return_value=None)

    insert_result = MagicMock()
    insert_result.inserted_id = created_id or ObjectId()
    db.exercises.insert_one = AsyncMock(return_value=insert_result)
    return db


@pytest.fixture(autouse=True)
def no_openai(monkeypatch):
    """No embedding traffic: vector search gets no query vector by default
    (tests that need vector hits patch generate_embedding themselves), and
    attach_embedding is a passthrough."""
    monkeypatch.setattr(resolver_module, "generate_embedding", AsyncMock(return_value=None))

    async def passthrough(doc):
        return doc
    monkeypatch.setattr(resolver_module, "attach_embedding", passthrough)


def _blocks(*names, **extra):
    return [{"name": "Main", "exercises": [
        {"exercise_name": n, "volume": "3x10", "rest": "60s", "notes": "", **extra} for n in names
    ]}]


class TestResolutionLadder:
    async def test_exact_match_case_insensitive(self):
        db = _db()
        blocks, report = await ExerciseResolver(db).resolve_blocks(str(USER), _blocks("plank"))
        ex = blocks[0]["exercises"][0]
        assert ex["exercise_id"] == PLANK["_id"]
        assert ex["exercise_name"] == "Plank"  # canonical catalog name wins
        assert report["resolved"][0]["method"] == "exact"
        db.exercises.insert_one.assert_not_called()

    async def test_supplied_id_is_verified_and_used(self):
        db = _db()
        db.exercises.find_one = AsyncMock(return_value={"_id": PLANK["_id"], "name": "Plank"})
        blocks = _blocks("Some Wrong Name")
        blocks[0]["exercises"][0]["exercise_id"] = str(PLANK["_id"])
        blocks, report = await ExerciseResolver(db).resolve_blocks(str(USER), blocks)
        assert blocks[0]["exercises"][0]["exercise_id"] == PLANK["_id"]
        assert report["resolved"][0]["method"] == "verified_id"

    async def test_fabricated_id_falls_through_to_name(self):
        db = _db()  # find_one → None: the id doesn't exist
        blocks = _blocks("Plank")
        blocks[0]["exercises"][0]["exercise_id"] = str(ObjectId())  # hallucinated
        blocks, report = await ExerciseResolver(db).resolve_blocks(str(USER), blocks)
        assert blocks[0]["exercises"][0]["exercise_id"] == PLANK["_id"]
        assert report["resolved"][0]["method"] == "exact"

    async def test_fuzzy_variant_reuses_instead_of_duplicating(self):
        # "Push Up" vs catalog "Push-Up": full word overlap → 0.85 → auto-accept.
        db = _db()
        blocks, report = await ExerciseResolver(db).resolve_blocks(str(USER), _blocks("Push Up"))
        ex = blocks[0]["exercises"][0]
        assert ex["exercise_id"] == PUSH_UP["_id"]
        assert ex["exercise_name"] == "Push-Up"
        assert report["resolved"][0]["method"] == "fuzzy"
        db.exercises.insert_one.assert_not_called()

    async def test_vector_high_confidence_accepts(self, monkeypatch):
        monkeypatch.setattr(resolver_module, "generate_embedding", AsyncMock(return_value=[0.1] * 4))
        db = _db(catalog=[PLANK], vector_hits=[{"_id": PUSH_UP["_id"], "name": "Push-Up", "score": 0.95}])
        blocks, report = await ExerciseResolver(db).resolve_blocks(str(USER), _blocks("Press Up"))
        assert blocks[0]["exercises"][0]["exercise_id"] == PUSH_UP["_id"]
        assert report["resolved"][0]["method"] == "vector"

    async def test_no_match_creates_private_exercise(self):
        created = ObjectId()
        db = _db(catalog=[PLANK], created_id=created)
        blocks, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Zercher Carry", muscles=["Core", "Forearms"], discipline=["Strength"])
        )
        assert blocks[0]["exercises"][0]["exercise_id"] == created
        assert report["created"][0]["matched_name"] == "Zercher Carry"
        doc = db.exercises.insert_one.call_args.args[0]
        assert doc["muscles"] == ["Core", "Forearms"]
        assert doc["discipline"] == ["Strength"]
        assert doc["isCommon"] is False and doc["createdBy"] == USER

    async def test_create_defaults_without_classification(self):
        db = _db(catalog=[])
        await ExerciseResolver(db).resolve_blocks(str(USER), _blocks("Mystery Move"))
        doc = db.exercises.insert_one.call_args.args[0]
        assert doc["muscles"] == ["Full Body"]
        assert doc["discipline"] == ["General Fitness"]

    async def test_duplicate_new_name_created_once_per_batch(self):
        db = _db(catalog=[])
        blocks, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Zercher Carry", "Zercher Carry")
        )
        assert db.exercises.insert_one.call_count == 1
        ids = [ex["exercise_id"] for ex in blocks[0]["exercises"]]
        assert ids[0] == ids[1]


class TestAmbiguity:
    async def test_medium_confidence_asks_instead_of_guessing(self):
        # "Dumbbell Chest Press" vs "Chest Press Machine": 0.5 Jaccard + word
        # boosts → 0.8: candidate zone, below auto-accept.
        db = _db()
        blocks, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Dumbbell Chest Press"), on_ambiguous="ask"
        )
        assert len(report["ambiguous"]) == 1
        entry = report["ambiguous"][0]
        assert entry["exercise_name"] == "Dumbbell Chest Press"
        assert entry["candidates"][0]["name"] == "Chest Press Machine"
        assert blocks[0]["exercises"][0].get("exercise_id") is None  # nothing forced
        db.exercises.insert_one.assert_not_called()
        assert "Chest Press Machine" in format_ambiguous_message(report["ambiguous"])

    async def test_best_effort_takes_top_candidate(self):
        db = _db()
        blocks, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Dumbbell Chest Press"), on_ambiguous="best_effort"
        )
        assert report["ambiguous"] == []
        assert blocks[0]["exercises"][0]["exercise_id"] == CHEST_PRESS["_id"]
        db.exercises.insert_one.assert_not_called()

    async def test_substring_tie_is_ambiguous_not_arbitrary(self):
        # "Plank" (not itself in the catalog) substring-matches two entries at
        # 0.9 — auto-accepting whichever sorts first would be silent guesswork.
        side = {"_id": ObjectId(), "name": "Side Plank"}
        jacks = {"_id": ObjectId(), "name": "Plank Jacks"}
        db = _db(catalog=[side, jacks])
        _, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Plank"), on_ambiguous="ask"
        )
        assert len(report["ambiguous"]) == 1
        names = {c["name"] for c in report["ambiguous"][0]["candidates"]}
        assert names == {"Side Plank", "Plank Jacks"}
        db.exercises.insert_one.assert_not_called()

    async def test_ask_abort_defers_creations(self):
        # One ambiguous + one brand-new name: aborting for the question must
        # NOT leave a phantom created exercise behind.
        db = _db()
        _, report = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Dumbbell Chest Press", "Zercher Carry"), on_ambiguous="ask"
        )
        assert len(report["ambiguous"]) == 1
        assert len(report["pending_create"]) == 1
        db.exercises.insert_one.assert_not_called()


class TestPostConditions:
    async def test_no_null_ids_survive_resolution(self):
        db = _db(catalog=[])
        blocks, _ = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("A New One", "Another New One")
        )
        assert all(ex["exercise_id"] for b in blocks for ex in b["exercises"])

    async def test_aux_resolver_fields_stripped_from_persisted_shape(self):
        db = _db()
        blocks, _ = await ExerciseResolver(db).resolve_blocks(
            str(USER), _blocks("Plank", muscles=["Core"], discipline=["Calisthenics"])
        )
        ex = blocks[0]["exercises"][0]
        assert set(ex) == {"exercise_name", "volume", "rest", "notes", "exercise_id"}

    async def test_nameless_entry_raises(self):
        db = _db()
        with pytest.raises(UnresolvedExerciseError):
            await ExerciseResolver(db).resolve_blocks(str(USER), _blocks(""))
