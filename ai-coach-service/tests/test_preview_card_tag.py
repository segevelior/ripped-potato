"""Tests for the <calendar-preview> token the orchestrator emits for dry-run
previews, and for the model-facing stripping of the preview_card payload."""

import base64
import json
import re

from app.core.agents.orchestrator import _build_preview_card_tag, _model_facing_result

CARD = {"v": 1, "title": "Easy Run (Jul 13)", "date": "2026-07-13", "type": "session"}
PREVIEW_RESULT = {"success": True, "dry_run": True, "message": "…", "preview_card": CARD}


class TestBuildPreviewCardTag:
    def test_round_trips_payload(self):
        tag = _build_preview_card_tag(PREVIEW_RESULT)
        payload = re.search(r'payload="([^"]+)"', tag).group(1)
        assert json.loads(base64.b64decode(payload)) == CARD

    def test_tag_is_explicitly_closed(self):
        # parse5 (rehype-raw) ignores the self-closing slash on unknown
        # elements; a dangling open tag would swallow all following siblings.
        tag = _build_preview_card_tag(PREVIEW_RESULT)
        assert "</calendar-preview>" in tag
        assert "/>" not in tag

    def test_none_without_card_or_dry_run(self):
        assert _build_preview_card_tag({"success": True, "dry_run": True}) is None
        assert _build_preview_card_tag({"success": True, "preview_card": CARD}) is None
        assert _build_preview_card_tag("not a dict") is None
        assert _build_preview_card_tag(None) is None


class TestModelFacingResult:
    def test_strips_preview_card_only(self):
        stripped = _model_facing_result(PREVIEW_RESULT)
        assert "preview_card" not in stripped
        assert stripped["dry_run"] is True
        # Original result is not mutated (the tag builder still needs the card).
        assert "preview_card" in PREVIEW_RESULT

    def test_passthrough_without_card(self):
        result = {"success": True, "message": "ok"}
        assert _model_facing_result(result) is result
        assert _model_facing_result("text") == "text"
