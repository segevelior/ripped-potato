"""Tests for the league-map endpoint (sports-news follows classification)."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.v1 import league_map
from app.models.schemas import (
    LeagueMapRequest,
    LeagueMapTriedEntry,
    LeagueMapWhitelistEntry,
)

USER = {"user_id": "user-1"}

WHITELIST = [
    LeagueMapWhitelistEntry(slug="soccer/eng.1", name="Premier League", aliases=["EPL"]),
    LeagueMapWhitelistEntry(slug="racing/f1", name="Formula 1", aliases=["F1"]),
    LeagueMapWhitelistEntry(slug="racing/irl", name="IndyCar Series", aliases=[]),
]


def _llm_response(payload):
    msg = MagicMock()
    msg.content = payload if isinstance(payload, str) else json.dumps(payload)
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


class _FakeSettings:
    openai_api_key = "test-key"
    openai_model_fast = "fast-model"

    def llm_tuning_params(self, temperature=None):
        return {"temperature": temperature}


@pytest.fixture
def fake_client(monkeypatch):
    client = MagicMock()
    client.chat.completions.create = AsyncMock()
    monkeypatch.setattr(league_map, "AsyncOpenAI", MagicMock(return_value=client))
    monkeypatch.setattr(league_map, "get_settings", MagicMock(return_value=_FakeSettings()))
    return client


async def test_uses_fast_model_and_filters_to_whitelist(fake_client):
    fake_client.chat.completions.create.return_value = _llm_response(
        {"label": "Motorsport", "candidates": ["racing/f1", "racing/hallucinated", "racing/irl"]}
    )

    resp = await league_map.map_league(
        LeagueMapRequest(query="motorsport", whitelist=WHITELIST), USER
    )

    call_kwargs = fake_client.chat.completions.create.call_args.kwargs
    assert call_kwargs["model"] == "fast-model"
    assert call_kwargs["response_format"] == {"type": "json_object"}
    assert resp.unmatched is False
    assert resp.label == "Motorsport"
    assert resp.candidates == ["racing/f1", "racing/irl"]
    assert resp.rejected == ["racing/hallucinated"]


async def test_tried_and_failed_slugs_are_excluded_and_in_prompt(fake_client):
    fake_client.chat.completions.create.return_value = _llm_response(
        {"label": "Motorsport", "candidates": ["racing/f1", "racing/irl"]}
    )

    resp = await league_map.map_league(
        LeagueMapRequest(
            query="motorsport",
            whitelist=WHITELIST,
            tried_and_failed=[LeagueMapTriedEntry(slug="racing/f1", error="HTTP 404")],
        ),
        USER,
    )

    assert resp.candidates == ["racing/irl"]
    assert "racing/f1" in resp.rejected
    user_msg = fake_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "racing/f1: HTTP 404" in user_msg


async def test_whitelist_is_embedded_in_system_prompt(fake_client):
    fake_client.chat.completions.create.return_value = _llm_response(
        {"label": "EPL", "candidates": ["soccer/eng.1"]}
    )

    await league_map.map_league(LeagueMapRequest(query="EPL", whitelist=WHITELIST), USER)

    system_msg = fake_client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
    assert "soccer/eng.1 — Premier League (EPL)" in system_msg
    assert "racing/irl — IndyCar Series" in system_msg


async def test_unmatched_passthrough(fake_client):
    fake_client.chat.completions.create.return_value = _llm_response(
        {"unmatched": True, "reason": "ESPN has no chess coverage"}
    )

    resp = await league_map.map_league(
        LeagueMapRequest(query="chess", whitelist=WHITELIST), USER
    )

    assert resp.unmatched is True
    assert resp.reason == "ESPN has no chess coverage"
    assert resp.candidates == []


async def test_label_falls_back_to_query_and_candidates_capped(fake_client):
    many = [
        LeagueMapWhitelistEntry(slug=f"soccer/l{i}", name=f"League {i}", aliases=[])
        for i in range(6)
    ]
    fake_client.chat.completions.create.return_value = _llm_response(
        {"candidates": [f"soccer/l{i}" for i in range(6)]}
    )

    resp = await league_map.map_league(
        LeagueMapRequest(query="all the soccer", whitelist=many), USER
    )

    assert resp.label == "all the soccer"
    assert len(resp.candidates) == league_map.MAX_CANDIDATES


async def test_malformed_model_output_raises_502(fake_client):
    fake_client.chat.completions.create.return_value = _llm_response("not json at all")

    with pytest.raises(HTTPException) as exc_info:
        await league_map.map_league(
            LeagueMapRequest(query="motorsport", whitelist=WHITELIST), USER
        )
    assert exc_info.value.status_code == 502


async def test_llm_failure_raises_502(fake_client):
    fake_client.chat.completions.create.side_effect = RuntimeError("connection refused")

    with pytest.raises(HTTPException) as exc_info:
        await league_map.map_league(
            LeagueMapRequest(query="motorsport", whitelist=WHITELIST), USER
        )
    assert exc_info.value.status_code == 502
