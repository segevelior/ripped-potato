"""Tests for the propose_exercise_swap skill and its orchestrator plumbing."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from app.core.agents.orchestrator import (
    _build_preview_card_tag,
    _model_facing_result,
    _needs_grounding,
    _sanitize_replayed_content,
)
from app.core.agents.skills.propose_exercise_swap_skill import propose_exercise_swap

USER_ID = str(ObjectId())

ORIGINAL_ID = ObjectId()
CAND_ID = ObjectId()

ORIGINAL = {"_id": ORIGINAL_ID, "name": "Bench Press", "muscles": ["chest", "triceps"], "equipment": ["barbell"]}
CANDIDATE = {
    "_id": CAND_ID,
    "name": "Push-ups",
    "muscles": ["chest", "triceps"],
    "equipment": [],
    "strain": {"intensity": "moderate", "load": "bodyweight"},
}


def _make_ctx(find_one_results=None, candidates=None):
    ctx = MagicMock()
    # exercises.find_one is called for original and (maybe) replacement lookups.
    ctx.db.exercises.find_one = AsyncMock(side_effect=find_one_results or [ORIGINAL, None])
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=candidates if candidates is not None else [CANDIDATE])
    ctx.db.exercises.find = MagicMock(return_value=cursor)
    ctx.db.users.find_one = AsyncMock(return_value={"profile": {"preferences": {"equipment": []}}})
    return ctx


class TestProposeExerciseSwap:
    async def test_auto_pick_returns_dry_run_card(self):
        ctx = _make_ctx()
        res = await propose_exercise_swap(ctx, USER_ID, {"exercise_id": str(ORIGINAL_ID), "reason": "variety"})
        assert res["success"] is True
        assert res["dry_run"] is True
        assert res["preview_card_tag"] == "exercise-swap"
        card = res["preview_card"]
        assert card["old"]["name"] == "Bench Press"
        assert card["new"]["name"] == "Push-ups"
        assert card["new"]["isNew"] is False
        assert card["offerPermanent"] is False

    async def test_explicit_catalog_replacement(self):
        ctx = _make_ctx(find_one_results=[ORIGINAL, CANDIDATE])
        res = await propose_exercise_swap(
            ctx, USER_ID,
            {"exercise_id": str(ORIGINAL_ID), "replacement_id": str(CAND_ID), "reason": "variety"},
        )
        assert res["preview_card"]["new"]["id"] == str(CAND_ID)
        assert res["preview_card"]["new"]["isNew"] is False

    async def test_unknown_replacement_proposed_as_new(self):
        ctx = _make_ctx(find_one_results=[ORIGINAL, None])
        res = await propose_exercise_swap(
            ctx, USER_ID,
            {"exercise_id": str(ORIGINAL_ID), "replacement_name": "Ring Push-ups",
             "replacement_muscles": ["chest"], "reason": "variety"},
        )
        new = res["preview_card"]["new"]
        assert new["isNew"] is True
        assert new["id"] is None
        assert new["name"] == "Ring Push-ups"
        assert res["preview_card"]["note"]

    async def test_new_replacement_inherits_muscles_when_model_omits_them(self):
        # muscles are required to materialize into the catalog
        ctx = _make_ctx(find_one_results=[ORIGINAL, None])
        res = await propose_exercise_swap(
            ctx, USER_ID,
            {"exercise_id": str(ORIGINAL_ID), "replacement_name": "Side Plank", "reason": "back pain"},
        )
        assert res["preview_card"]["new"]["muscles"] == ORIGINAL["muscles"]

    async def test_pain_reason_no_hard_block_and_offers_permanent(self):
        ctx = _make_ctx()
        res = await propose_exercise_swap(
            ctx, USER_ID, {"exercise_id": str(ORIGINAL_ID), "reason": "shoulder pain"},
        )
        assert res["success"] is True  # unlike substitute_exercise, no safety dead-end
        assert res["preview_card"]["offerPermanent"] is True
        assert "rehab" in res["message"]

    async def test_pain_prefers_lower_strain_candidates(self):
        heavy = {**CANDIDATE, "_id": ObjectId(), "name": "Weighted Dips",
                 "strain": {"intensity": "max", "load": "heavy"}}
        ctx = _make_ctx(candidates=[heavy, CANDIDATE])
        res = await propose_exercise_swap(
            ctx, USER_ID, {"exercise_id": str(ORIGINAL_ID), "reason": "elbow pain"},
        )
        assert res["preview_card"]["new"]["name"] == "Push-ups"

    async def test_unresolvable_everything_fails_softly(self):
        ctx = _make_ctx(find_one_results=[None, None], candidates=[])
        res = await propose_exercise_swap(ctx, USER_ID, {"exercise_name": "Mystery", "reason": "variety"})
        assert res["success"] is False
        assert "Mystery" in res["message"]

    async def test_mutates_nothing(self):
        ctx = _make_ctx()
        await propose_exercise_swap(ctx, USER_ID, {"exercise_id": str(ORIGINAL_ID)})
        for coll in (ctx.db.exercises, ctx.db.users):
            for attr in ("insert_one", "update_one", "update_many", "delete_one", "delete_many"):
                assert not getattr(coll, attr).called


class TestOrchestratorPlumbing:
    def test_tag_uses_preview_card_tag(self):
        result = {"dry_run": True, "preview_card_tag": "exercise-swap", "preview_card": {"v": 1, "old": {}}}
        tag = _build_preview_card_tag(result)
        assert tag.strip().startswith("<exercise-swap payload=")
        assert tag.strip().endswith("</exercise-swap>")
        assert "/>" not in tag

    def test_tag_defaults_to_calendar_preview(self):
        result = {"dry_run": True, "preview_card": {"v": 1}}
        tag = _build_preview_card_tag(result)
        assert "<calendar-preview payload=" in tag

    def test_model_facing_result_strips_tag_key(self):
        result = {"success": True, "preview_card": {}, "preview_card_tag": "exercise-swap"}
        cleaned = _model_facing_result(result)
        assert "preview_card" not in cleaned
        assert "preview_card_tag" not in cleaned
        assert cleaned["success"] is True

    def test_replay_sanitizes_exercise_swap_payload(self):
        content = 'before <exercise-swap payload="abc123"></exercise-swap> after'
        out = _sanitize_replayed_content(content)
        assert "payload" not in out
        assert "<exercise-swap/>" in out

    def test_replay_still_sanitizes_calendar_preview(self):
        content = '<calendar-preview payload="abc"></calendar-preview>'
        out = _sanitize_replayed_content(content)
        assert out == "<calendar-preview/>"

    @pytest.mark.parametrize("message,expected", [
        ('[EXERCISE SWAP exercise_id="x" exercise="Bench Press"]\nUser says: replace this', False),
        ("swap my bench press", True),
        ("what's on my calendar", True),
    ])
    def test_grounding_exemption_for_swap_marker(self, message, expected):
        assert _needs_grounding(message) is expected


class TestConversationTitle:
    def test_exercise_swap_marker_title(self):
        from app.services.conversation_service import ConversationService
        svc = ConversationService.__new__(ConversationService)  # no DB needed
        title = svc._extract_clean_title(
            '[EXERCISE SWAP exercise_id="abc" exercise="Bench Press" workout="Push Day"]\nUser says: it hurts'
        )
        assert title == "Swap: Bench Press"

    def test_exercise_swap_marker_without_name(self):
        from app.services.conversation_service import ConversationService
        svc = ConversationService.__new__(ConversationService)
        assert svc._extract_clean_title("[EXERCISE SWAP]\nhello") == "Exercise swap"
