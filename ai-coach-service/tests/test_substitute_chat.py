"""Tests for the substitute chat endpoint and the shared option-validation helpers."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from pydantic import ValidationError

import app.api.v1.exercises as ex

USER_ID = str(ObjectId())
CURRENT_USER = {"user_id": USER_ID, "email": "t@t.co", "username": "t"}

ORIGINAL_ID = ObjectId()
CAND_ID = ObjectId()

ORIGINAL = {"_id": ORIGINAL_ID, "name": "Pull-up", "muscles": ["back", "biceps"], "equipment": []}
CANDIDATE = {
    "_id": CAND_ID,
    "name": "Chin-up",
    "muscles": ["back", "biceps"],
    "equipment": [],
    "strain": {"intensity": "high", "load": "bodyweight"},
}
POOL_BY_ID = {str(CAND_ID): CANDIDATE}


# ---------------------------- _parse_llm_options ----------------------------

class TestParseLlmOptions:
    def test_catalog_option_projected_from_pool(self):
        data = {"options": [{"source": "catalog", "id": str(CAND_ID), "note": "close match"}]}
        out = ex._parse_llm_options(data, POOL_BY_ID, ORIGINAL, 4)
        assert len(out) == 1
        assert out[0]["source"] == "catalog"
        assert out[0]["id"] == str(CAND_ID)
        assert out[0]["name"] == "Chin-up"
        assert out[0]["note"] == "close match"

    def test_hallucinated_catalog_id_dropped(self):
        data = {"options": [{"source": "catalog", "id": str(ObjectId()), "note": "fake"}]}
        assert ex._parse_llm_options(data, POOL_BY_ID, ORIGINAL, 4) == []

    def test_new_option_inherits_muscles_when_invalid(self):
        data = {"options": [{"source": "new", "name": "Archer Row", "muscles": ["nonsense"]}]}
        out = ex._parse_llm_options(data, POOL_BY_ID, ORIGINAL, 4)
        assert out[0]["muscles"] == ["back", "biceps"]

    def test_new_option_skipped_when_muscles_uninheritable(self):
        data = {"options": [{"source": "new", "name": "Archer Row", "muscles": []}]}
        assert ex._parse_llm_options(data, POOL_BY_ID, {}, 4) == []

    def test_new_option_strain_mapped_to_camel_case(self):
        data = {"options": [{
            "source": "new", "name": "Ring Row", "muscles": ["back"],
            "strain": {"intensity": "high", "load": "bodyweight",
                       "duration_type": "reps", "typical_volume": "3x8"},
        }]}
        out = ex._parse_llm_options(data, POOL_BY_ID, ORIGINAL, 4)
        assert out[0]["strain"] == {
            "intensity": "high", "load": "bodyweight",
            "durationType": "reps", "typicalVolume": "3x8",
        }

    def test_count_capped(self):
        data = {"options": [{"source": "catalog", "id": str(CAND_ID)}] * 6}
        assert len(ex._parse_llm_options(data, POOL_BY_ID, ORIGINAL, 4)) == 4


# ---------------------------- request schema ----------------------------

class TestChatRequestSchema:
    def test_oversized_message_rejected(self):
        with pytest.raises(ValidationError):
            ex.SubstituteChatRequest(message="x" * 1001)

    def test_empty_message_rejected(self):
        with pytest.raises(ValidationError):
            ex.SubstituteChatRequest(message="")

    def test_bad_history_role_rejected(self):
        with pytest.raises(ValidationError):
            ex.SubstituteChatRequest(message="hi", history=[{"role": "system", "content": "x"}])


# ---------------------------- endpoint ----------------------------

def _mock_db(monkeypatch, original=ORIGINAL, candidates=None):
    db = MagicMock()
    db.exercises.find_one = AsyncMock(return_value=original)
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=candidates if candidates is not None else [CANDIDATE])
    db.exercises.find = MagicMock(return_value=cursor)
    db.users.find_one = AsyncMock(return_value={"profile": {"preferences": {"equipment": []}}})
    monkeypatch.setattr("app.main.db", db)
    return db


def _mock_openai(monkeypatch, payload=None, fail=False):
    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        if fail:
            raise RuntimeError("llm boom")
        response = MagicMock()
        response.choices[0].message.content = json.dumps(payload)
        return response

    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=create)
    factory = MagicMock(return_value=client)
    monkeypatch.setattr(ex, "AsyncOpenAI", factory)
    return captured, factory


class TestSubstituteChat:
    async def test_first_turn_pain_routes_to_safety_without_llm(self, monkeypatch):
        _mock_db(monkeypatch)
        _, factory = _mock_openai(monkeypatch, payload={"reply": "nope"})
        req = ex.SubstituteChatRequest(message="sharp pain in my shoulder", exercise_id=str(ORIGINAL_ID))
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.routed == "safety"
        assert res.options == []
        assert res.reply
        factory.assert_not_called()

    async def test_happy_path_returns_reply_and_validated_options(self, monkeypatch):
        _mock_db(monkeypatch)
        payload = {
            "reply": "Chin-ups keep the pull pattern.",
            "options": [
                {"source": "catalog", "id": str(CAND_ID), "note": "same muscles"},
                {"source": "catalog", "id": str(ObjectId()), "note": "hallucinated"},
            ],
        }
        captured, _ = _mock_openai(monkeypatch, payload=payload)
        req = ex.SubstituteChatRequest(message="I want variety", exercise_id=str(ORIGINAL_ID))
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.reply == "Chin-ups keep the pull pattern."
        assert [o.name for o in res.options] == ["Chin-up"]
        assert res.fallback is False
        # System prompt grounds on the real candidate pool.
        assert str(CAND_ID) in captured["messages"][0]["content"]
        assert "temperature" not in captured

    async def test_history_truncated_to_last_8(self, monkeypatch):
        _mock_db(monkeypatch)
        captured, _ = _mock_openai(monkeypatch, payload={"reply": "ok", "options": []})
        history = [{"role": "user", "content": f"msg {i}"} for i in range(12)]
        req = ex.SubstituteChatRequest(message="so what do you think?", history=history)
        await ex.substitute_chat(req, CURRENT_USER)
        # system + 8 history + current user message
        assert len(captured["messages"]) == 10
        assert captured["messages"][1]["content"] == "msg 4"

    async def test_llm_failure_falls_back_to_pool(self, monkeypatch):
        _mock_db(monkeypatch)
        _mock_openai(monkeypatch, fail=True)
        req = ex.SubstituteChatRequest(message="I want variety", exercise_id=str(ORIGINAL_ID))
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.fallback is True
        assert [o.name for o in res.options] == ["Chin-up"]
        assert res.reply

    async def test_llm_failure_with_pain_in_history_returns_safety(self, monkeypatch):
        _mock_db(monkeypatch)
        _mock_openai(monkeypatch, fail=True)
        req = ex.SubstituteChatRequest(
            message="ok so what instead?",
            history=[{"role": "user", "content": "I get elbow pain on these"},
                     {"role": "assistant", "content": "tell me more"}],
            exercise_id=str(ORIGINAL_ID),
        )
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.routed == "safety"
        assert res.options == []
        assert res.fallback is True

    async def test_non_json_reply_is_used_as_plain_text(self, monkeypatch):
        _mock_db(monkeypatch)
        captured = {}

        async def create(**kwargs):
            captured.update(kwargs)
            response = MagicMock()
            response.choices[0].message.content = "Try chin-ups instead, they keep the same pull pattern."
            return response

        client = MagicMock()
        client.chat.completions.create = AsyncMock(side_effect=create)
        monkeypatch.setattr(ex, "AsyncOpenAI", MagicMock(return_value=client))

        req = ex.SubstituteChatRequest(message="I want variety", exercise_id=str(ORIGINAL_ID))
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.reply.startswith("Try chin-ups")
        assert res.options == []
        assert res.fallback is False

    async def test_assistant_history_replayed_as_json(self, monkeypatch):
        _mock_db(monkeypatch)
        captured, _ = _mock_openai(monkeypatch, payload={"reply": "ok", "options": []})
        req = ex.SubstituteChatRequest(
            message="so what instead?",
            history=[{"role": "user", "content": "I want variety"},
                     {"role": "assistant", "content": "What equipment do you have?"}],
            exercise_id=str(ORIGINAL_ID),
        )
        await ex.substitute_chat(req, CURRENT_USER)
        assistant_turn = captured["messages"][2]
        assert assistant_turn["role"] == "assistant"
        assert json.loads(assistant_turn["content"]) == {"reply": "What equipment do you have?", "options": []}
        # User turns stay verbatim.
        assert captured["messages"][1]["content"] == "I want variety"

    async def test_empty_llm_content_falls_back(self, monkeypatch):
        _mock_db(monkeypatch)
        captured = {}

        async def create(**kwargs):
            captured.update(kwargs)
            response = MagicMock()
            response.choices[0].message.content = ""
            return response

        client = MagicMock()
        client.chat.completions.create = AsyncMock(side_effect=create)
        monkeypatch.setattr(ex, "AsyncOpenAI", MagicMock(return_value=client))

        req = ex.SubstituteChatRequest(message="I want variety", exercise_id=str(ORIGINAL_ID))
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.fallback is True
        assert [o.name for o in res.options] == ["Chin-up"]

    async def test_unresolvable_exercise_still_chats_without_pool(self, monkeypatch):
        _mock_db(monkeypatch, original=None)
        captured, _ = _mock_openai(monkeypatch, payload={"reply": "Try weighted dips.", "options": []})
        req = ex.SubstituteChatRequest(message="I want something harder", exercise_name="Mystery Move")
        res = await ex.substitute_chat(req, CURRENT_USER)
        assert res.reply == "Try weighted dips."
        assert "no matching exercises" in captured["messages"][0]["content"]


# ---------------------------- rank regression after helper extraction ----------------------------

class TestRankStillWorks:
    async def test_rank_uses_shared_pool_and_parser(self, monkeypatch):
        _mock_db(monkeypatch)
        payload = {"options": [{"source": "catalog", "id": str(CAND_ID), "note": "fits"}]}
        _mock_openai(monkeypatch, payload=payload)
        req = ex.SubstituteRankRequest(exercise_id=str(ORIGINAL_ID), count=5)
        res = await ex.substitute_rank(req, CURRENT_USER)
        assert res.fallback is False
        assert [o.name for o in res.options] == ["Chin-up"]

    async def test_rank_pain_reason_still_gated(self, monkeypatch):
        _mock_db(monkeypatch)
        _, factory = _mock_openai(monkeypatch, payload={})
        req = ex.SubstituteRankRequest(exercise_id=str(ORIGINAL_ID), reason="pain or injury")
        res = await ex.substitute_rank(req, CURRENT_USER)
        assert res.routed == "safety"
        factory.assert_not_called()
