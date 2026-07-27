"""Tests for app.core.llm_cache — the content-fingerprint cache key shared by
LLM-backed endpoints. These are pure unit tests: no DB, no LLM, no I/O."""

from datetime import datetime

import pytest

from app.core import llm_cache
from app.core.llm_cache import fingerprint, normalize_for_hash, part_of_day

BASE = dict(
    context="RECENT WORKOUTS: none",
    prompts=["system prompt", "task prompt"],
    model="gpt-5.6-mini",
    parts=["user-1", "2026-07-26", "morning", "none"],
)


def _at(hour, minute=0):
    return datetime(2026, 7, 26, hour, minute)


class TestPartOfDay:
    @pytest.mark.parametrize(
        "hour,minute,expected",
        [
            (0, 0, "night"), (5, 59, "night"),
            (6, 0, "morning"), (11, 59, "morning"),
            (12, 0, "afternoon"), (17, 59, "afternoon"),
            (18, 0, "evening"), (23, 59, "evening"),
        ],
    )
    def test_bucket_boundaries(self, hour, minute, expected):
        assert part_of_day(_at(hour, minute)) == expected

    def test_bogus_input_does_not_raise(self):
        # Totality matters: this runs on the request path, and a bad clock must
        # degrade to a cache miss rather than a 500.
        assert part_of_day(object()) == "unknown"
        assert part_of_day(None) == "unknown"


class TestNormalizeForHash:
    def test_replaces_the_exact_value(self):
        out = normalize_for_hash(
            "Local time: Sunday, July 26, 2026 at 09:14 AM",
            {"local_time": "Sunday, July 26, 2026 at 09:14 AM"},
        )
        assert out == "Local time: <local_time>"

    def test_absent_value_leaves_text_untouched(self):
        # Proves we don't over-scrub: exact replacement can't eat athlete
        # content the way a /\d\d:\d\d/ regex would.
        text = "Athlete note: PB 5k in 21:30, knee sore since 08:00"
        assert normalize_for_hash(text, {"local_time": "09:14 AM"}) == text

    def test_no_volatile_map_is_a_noop(self):
        assert normalize_for_hash("hello", None) == "hello"
        assert normalize_for_hash("hello", {}) == "hello"

    def test_empty_values_are_skipped(self):
        assert normalize_for_hash("hello", {"x": ""}) == "hello"

    def test_none_text(self):
        assert normalize_for_hash(None) == ""


class TestFingerprint:
    def test_is_deterministic_and_sha256_shaped(self):
        first = fingerprint(**BASE)
        assert first == fingerprint(**BASE)
        assert len(first) == 64
        assert all(c in "0123456789abcdef" for c in first)

    @pytest.mark.parametrize(
        "override",
        [
            {"context": "RECENT WORKOUTS: 5k run"},
            {"prompts": ["system prompt CHANGED", "task prompt"]},
            {"prompts": ["system prompt", "task prompt CHANGED"]},
            {"model": "gpt-5.6"},
            {"parts": ["user-2", "2026-07-26", "morning", "none"]},
            {"parts": ["user-1", "2026-07-27", "morning", "none"]},
            {"parts": ["user-1", "2026-07-26", "afternoon", "none"]},
            {"parts": ["user-1", "2026-07-26", "morning", "medium"]},
            {"prompt_version": "99"},
        ],
        ids=["context", "system_prompt", "task_prompt", "model",
             "user", "date", "bucket", "reasoning_effort", "prompt_version"],
    )
    def test_every_field_participates(self, override):
        assert fingerprint(**{**BASE, **override}) != fingerprint(**BASE)

    def test_prompt_edit_changes_the_key(self):
        """The classic bug this design exists to prevent: keying on the data but
        not the prompt text, so a prompt edit keeps serving answers written by
        the old prompt."""
        original = fingerprint(context="ctx", prompts=["Ask about readiness."])
        edited = fingerprint(context="ctx", prompts=["Ask about readiness. Be brief."])
        assert original != edited

    def test_prompt_version_is_read_at_call_time(self, monkeypatch):
        before = fingerprint(**BASE)
        monkeypatch.setattr(llm_cache, "PROMPT_VERSION", "2")
        assert fingerprint(**BASE) != before

    def test_field_separator_prevents_collisions(self):
        # Without the \x1f separator, concatenation makes ("ab","c") and
        # ("a","bc") hash identically.
        assert fingerprint(context="b", parts=["a"]) != fingerprint(context="", parts=["ab"])
        assert fingerprint(context="", prompts=["ab"]) != fingerprint(context="b", prompts=["a"])

    def test_volatile_value_is_neutralized(self):
        """Two requests a minute apart must produce the same key."""
        def key(local_time):
            return fingerprint(
                context=f"Local time: {local_time}\nGoals: none",
                volatile={"local_time": local_time},
            )

        assert key("09:14 AM") == key("09:15 AM")

    def test_unnormalized_volatile_value_would_miss(self):
        """Guards the normalization itself: drop `volatile` and the keys diverge,
        which is exactly the every-request-misses failure."""
        a = fingerprint(context="Local time: 09:14 AM")
        b = fingerprint(context="Local time: 09:15 AM")
        assert a != b

    def test_is_total_on_junk_input(self):
        # A keying bug must never raise on the request path.
        digest = fingerprint(context=None, prompts=[None], parts=[123, None], model=None)
        assert len(digest) == 64

    def test_surrogates_do_not_raise(self):
        assert len(fingerprint(context="bad \ud800 char")) == 64
