"""
Tests for the create_workout_template think-then-act guards:
empty-blocks rejection and title dedup (normalized-exact, with the
confirm_duplicate escape hatch).
"""
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.core.dedup import (
    exercise_content_signature,
    existing_template_duplicate_response,
    find_reusable_template,
    normalize_template_title,
    template_doc_signature,
)
from app.core.agents.services.workout_service import WorkoutService


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def _db_with_templates(docs):
    db = MagicMock()
    db.predefinedworkouts.find = MagicMock(return_value=FakeCursor(docs))
    db.predefinedworkouts.find_one = AsyncMock(
        return_value=docs[0] if docs else None
    )
    return db


USER_ID = str(ObjectId())


class TestNormalizeTemplateTitle:
    def test_strips_date_suffix(self):
        assert normalize_template_title("Endurance 1 (Jul 14)") == "endurance 1"

    def test_case_and_whitespace(self):
        assert normalize_template_title("  Push   Day ") == "push day"

    def test_plain_name_unchanged(self):
        assert normalize_template_title("Endurance 1") == "endurance 1"

    def test_parenthetical_that_is_not_a_date_kept(self):
        assert normalize_template_title("Legs (heavy)") == "legs (heavy)"


class TestExistingTemplateDuplicateResponse:
    async def test_collision_returns_corrective_error(self):
        tid = ObjectId()
        doc = {
            "_id": tid,
            "name": "Endurance 1",
            "goal": "Aerobic base",
            "blocks": [{"exercises": [{"exercise_name": "Run"}] * 6}],
        }
        db = _db_with_templates([doc])
        res = await existing_template_duplicate_response(db, USER_ID, "endurance 1")
        assert res["error"] == "duplicate_template"
        assert res["already_exists"] is True
        assert res["success"] is False
        assert res["existing"]["id"] == str(tid)
        assert res["existing"]["total_exercises"] == 6
        # The message must name the exact next call, with the real id inlined.
        assert f"workout_template_id='{tid}'" in res["message"]
        assert "confirm_duplicate=true" in res["message"]

    async def test_date_suffixed_variant_collides(self):
        doc = {"_id": ObjectId(), "name": "Endurance 1 (Jul 14)", "blocks": []}
        db = _db_with_templates([doc])
        res = await existing_template_duplicate_response(db, USER_ID, "Endurance 1")
        assert res is not None

    async def test_no_false_positive_on_prefix(self):
        doc = {"_id": ObjectId(), "name": "Push Day B", "blocks": []}
        db = _db_with_templates([doc])
        assert await existing_template_duplicate_response(db, USER_ID, "Push Day") is None

    async def test_new_name_returns_none(self):
        db = _db_with_templates([])
        assert await existing_template_duplicate_response(db, USER_ID, "Endurance 1") is None


def _exercises(*prescriptions):
    return [
        {"exerciseName": name, "targetSets": sets, "targetReps": reps}
        for name, sets, reps in prescriptions
    ]


class TestContentSignature:
    def test_name_normalization_case_and_whitespace(self):
        assert exercise_content_signature(_exercises(("Bench  Press", 3, 8))) == \
            exercise_content_signature(_exercises(("bench press ", 3, 8)))

    def test_order_sensitive(self):
        a = exercise_content_signature(_exercises(("Run", 1, 30), ("Burpees", 3, 15)))
        b = exercise_content_signature(_exercises(("Burpees", 3, 15), ("Run", 1, 30)))
        assert a != b

    def test_prescription_change_changes_signature(self):
        assert exercise_content_signature(_exercises(("Run", 3, 10))) != \
            exercise_content_signature(_exercises(("Run", 5, 5)))

    def test_doc_signature_matches_inline_signature(self):
        doc = {"blocks": [{"exercises": [
            {"exercise_name": "Run", "volume": "1x30"},
            {"exercise_name": "Burpees", "volume": "3x15"},
        ]}]}
        assert template_doc_signature(doc) == \
            exercise_content_signature(_exercises(("Run", 1, 30), ("Burpees", 3, 15)))


class TestFindReusableTemplate:
    EXERCISES = _exercises(("Run", 1, 30), ("Burpees", 3, 15))

    def _doc(self, name, is_common=False, oid=None):
        return {
            "_id": oid or ObjectId(),
            "name": name,
            "isCommon": is_common,
            "blocks": [{"exercises": [
                {"exercise_name": "Run", "volume": "1x30"},
                {"exercise_name": "Burpees", "volume": "3x15"},
            ]}],
        }

    async def test_no_content_match_returns_none(self):
        db = _db_with_templates([self._doc("Endurance 1")])
        assert await find_reusable_template(
            db, USER_ID, "Endurance 1", _exercises(("Run", 5, 5))
        ) is None

    async def test_empty_exercises_returns_none(self):
        db = _db_with_templates([self._doc("Endurance 1")])
        assert await find_reusable_template(db, USER_ID, "Endurance 1", []) is None

    async def test_name_match_beats_common(self):
        named = self._doc("Endurance 1 (Jul 07)")
        common = self._doc("Aerobic Base", is_common=True)
        db = _db_with_templates([common, named])
        match = await find_reusable_template(db, USER_ID, "Endurance 1", self.EXERCISES)
        assert match["_id"] == named["_id"]

    async def test_common_beats_private_when_names_equal(self):
        private = self._doc("Endurance 1")
        common = self._doc("Endurance 1", is_common=True)
        db = _db_with_templates([private, common])
        match = await find_reusable_template(db, USER_ID, "Endurance 1", self.EXERCISES)
        assert match["_id"] == common["_id"]

    async def test_oldest_wins_as_final_tiebreak(self):
        older = self._doc("Endurance 1", oid=ObjectId("6" + "0" * 23))
        newer = self._doc("Endurance 1", oid=ObjectId("7" + "0" * 23))
        db = _db_with_templates([newer, older])
        match = await find_reusable_template(db, USER_ID, "Endurance 1", self.EXERCISES)
        assert match["_id"] == older["_id"]


class TestCreateWorkoutTemplateGuards:
    def _service(self, existing_docs):
        db = _db_with_templates(existing_docs)
        db.predefinedworkouts.insert_one = AsyncMock(
            return_value=MagicMock(inserted_id=ObjectId())
        )
        return WorkoutService(db), db

    async def test_empty_blocks_rejected_before_insert(self):
        service, db = self._service([])
        res = await service.create_workout_template(
            USER_ID, {"name": "Endurance 1", "blocks": []}
        )
        assert res["success"] is False
        assert res["error"] == "empty_workout_template"
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_blocks_with_no_exercises_rejected(self):
        service, db = self._service([])
        res = await service.create_workout_template(
            USER_ID,
            {"name": "Endurance 1", "blocks": [{"name": "Main", "exercises": []}]},
        )
        assert res["error"] == "empty_workout_template"
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_duplicate_title_blocked_before_insert(self):
        existing = {"_id": ObjectId(), "name": "Endurance 1", "blocks": []}
        service, db = self._service([existing])
        res = await service.create_workout_template(
            USER_ID,
            {"name": "Endurance 1",
             "blocks": [{"name": "Main", "exercises": [{"exercise_name": "Run", "volume": "3x10"}]}]},
        )
        assert res["error"] == "duplicate_template"
        db.predefinedworkouts.insert_one.assert_not_called()

    async def test_confirm_duplicate_bypasses_dedup(self, monkeypatch):
        existing = {"_id": ObjectId(), "name": "Endurance 1", "blocks": []}
        service, db = self._service([existing])

        resolver = MagicMock()
        resolver.resolve_blocks = AsyncMock(side_effect=lambda uid, blocks, **kw: (
            blocks, {"ambiguous": [], "created": []}
        ))
        monkeypatch.setattr(
            "app.core.agents.services.workout_service.ExerciseResolver",
            lambda db: resolver,
        )

        res = await service.create_workout_template(
            USER_ID,
            {"name": "Endurance 1", "confirm_duplicate": True,
             "blocks": [{"name": "Main", "exercises": [{"exercise_name": "Run", "volume": "3x10"}]}]},
        )
        assert res["success"] is True
        db.predefinedworkouts.insert_one.assert_called_once()
