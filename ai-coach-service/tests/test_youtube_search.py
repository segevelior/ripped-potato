"""Unit tests for the YouTube video ranker (pure functions — no network)."""

from app.core.agents.services.youtube_search import (
    _duration_fit,
    _norm_channel,
    _parse_iso8601_duration,
    score_video,
)


def test_parse_iso8601_duration():
    assert _parse_iso8601_duration("PT8M32S") == 512
    assert _parse_iso8601_duration("PT1H2M3S") == 3723
    assert _parse_iso8601_duration("PT45S") == 45
    assert _parse_iso8601_duration("") == 0
    assert _parse_iso8601_duration("garbage") == 0


def test_duration_fit_prefers_tutorial_length():
    assert _duration_fit(8 * 60) == 1.0          # 8 min — ideal
    assert _duration_fit(3 * 60) == 1.0          # 3 min — ideal
    assert _duration_fit(45 * 60) < 0.5          # 45 min lecture — poor
    assert _duration_fit(20) < _duration_fit(300)  # 20s short < 5 min


def test_norm_channel_handles_spacing_and_punct():
    assert _norm_channel("Saturno Movement") == "saturnomovement"
    assert _norm_channel("SaturnoMovement") == "saturnomovement"
    assert _norm_channel("ATHLEAN-X") == "athleanx"
    assert _norm_channel("Athlean-X") == _norm_channel("athleanx")


def test_trusted_channel_dominates():
    trusted = {"name": "FitnessFAQs", "channelTitle": "FitnessFAQs",
               "viewCount": 100_000, "likeCount": 3000, "durationSeconds": 400}
    random_viral = {"channelTitle": "RandomBro", "viewCount": 5_000_000,
                    "likeCount": 200_000, "durationSeconds": 400}
    assert score_video(trusted) > score_video(random_viral)


def test_spacing_variant_still_credited():
    spaced = {"channelTitle": "Saturno Movement", "viewCount": 100_000, "likeCount": 3000, "durationSeconds": 300}
    joined = {"channelTitle": "SaturnoMovement", "viewCount": 100_000, "likeCount": 3000, "durationSeconds": 300}
    # Both should get the trusted boost -> identical, high score.
    assert score_video(spaced) == score_video(joined)
    assert score_video(joined) >= 8.0


def test_low_quality_scores_low():
    bad = {"channelTitle": "SomeGuy", "viewCount": 500, "likeCount": 3, "durationSeconds": 3000}
    assert score_video(bad) < 3.0


def test_engagement_and_popularity_break_ties_among_untrusted():
    strong = {"channelTitle": "NobodyA", "viewCount": 1_000_000, "likeCount": 40_000, "durationSeconds": 400}
    weak = {"channelTitle": "NobodyB", "viewCount": 2_000, "likeCount": 20, "durationSeconds": 400}
    assert score_video(strong) > score_video(weak)
