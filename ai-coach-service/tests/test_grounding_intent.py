"""Tests for the grounding-intent regex (TOR-19 added today's-pick phrasings)."""

import pytest

from app.core.agents.orchestrator import _needs_grounding


@pytest.mark.parametrize("message", [
    # New TOR-19 phrasings
    "what's today's pick?",
    "tell me about the suggested workout",
    "what's my recommended workout?",
    "what should I do today?",
    "what should I train today",
    "should I rest today?",
    "should I train today?",
    "should I work out today?",
    "do I have a workout today?",
    "have I got a workout today?",
    # Pre-existing phrasings must keep matching
    "what's on my calendar this week?",
    "show me my plan",
    "can we swap tomorrow's session?",
    "what is today's workout?",
    "workout for tomorrow",
])
def test_grounding_matches(message):
    assert _needs_grounding(message) is True


@pytest.mark.parametrize("message", [
    "I love working out",
    "how do I do a push-up?",
    "what's a good rep range for hypertrophy?",
    "I did a great workout yesterday",
])
def test_grounding_does_not_match(message):
    assert _needs_grounding(message) is False
