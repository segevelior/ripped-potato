"""Tests for dedupe_repeated_response (the gpt-5.4-mini stutter safety net)."""

from app.core.agents.text_utils import dedupe_repeated_response as dedupe


def test_collapses_exact_double_with_newline():
    s = "How many days per week can you run?\nHow many days per week can you run?"
    assert dedupe(s) == "How many days per week can you run?"


def test_collapses_double_and_preserves_quick_replies():
    body = "Yes — 10K in 3 months is realistic from where you are."
    s = f"{body}\n{body}\n\n<quick-replies>\n- Let's do it\n- Not yet\n</quick-replies>"
    out = dedupe(s)
    assert out.count(body) == 1
    assert "<quick-replies>" in out and "Let's do it" in out


def test_leaves_normal_reply_untouched():
    s = "What's your current longest run — 1 km, 3 km, or 5 km?"
    assert dedupe(s) == s


def test_does_not_collapse_legit_repetition():
    # Two halves are NOT identical → must not fold.
    s = "Week 1: Easy Run 3x. Week 2: Easy Run 3x. Week 3: Long Run once."
    assert dedupe(s) == s


def test_empty_and_none_safe():
    assert dedupe("") == ""
    assert dedupe(None) is None


def test_ignores_long_bodies():
    # A long structured answer that happens to have repetitive lines must be safe.
    para = "Do 3 sets of squats and rest 90 seconds between sets for recovery. " * 80
    assert dedupe(para) == para
