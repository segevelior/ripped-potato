"""Tests for the pure plan-building logic (skeleton normalize/materialize/adapt)."""

from datetime import datetime

import pytest

from app.core.agents.skills.plan_builder import (
    _scaled_sets,
    build_plan_weeks_from_skeleton,
    build_week_stub,
    coerce_exercise_numbers,
    compute_adaptation,
    compute_current_week,
    materialize_week,
    normalize_skeleton,
    planner_model,
    week_is_resolved,
)


def _skeleton(weeks_total=8):
    return {
        "phases": [
            {
                "name": "Base", "startWeek": 1, "endWeek": 4,
                "focus": "base building", "progression": "add volume",
                "disciplines": [{"discipline": "running", "sessionsPerWeek": 2}],
                "sessionBlueprints": [
                    {"title": "Tempo Run", "discipline": "running", "type": "cardio",
                     "durationMinutes": 45, "dayHint": 1,
                     "exercises": [{"exerciseName": "Tempo Run", "sets": 1, "reps": 1,
                                    "timeSeconds": 1800, "notes": "at threshold pace"}]},
                    {"title": "Pull Strength", "discipline": "calisthenics", "type": "strength",
                     "durationMinutes": 45, "dayHint": 3,
                     "exercises": [{"exerciseName": "Pull-up", "sets": 4, "reps": 6},
                                   {"exerciseName": "Ring Dip", "sets": 3, "reps": 8}]},
                ],
            },
            {
                "name": "Build", "startWeek": 5, "endWeek": 8,
                "focus": "specificity", "progression": "intensity",
                "disciplines": [{"discipline": "running", "sessionsPerWeek": 2}],
                "sessionBlueprints": [
                    {"title": "Intervals", "discipline": "running", "type": "cardio",
                     "durationMinutes": 45, "dayHint": 1,
                     "exercises": [{"exerciseName": "Interval Run", "sets": 1, "reps": 1}]},
                    {"title": "Pull Strength B", "discipline": "calisthenics", "type": "strength",
                     "durationMinutes": 45, "dayHint": 3,
                     "exercises": [{"exerciseName": "Weighted Pull-up", "sets": 5, "reps": 3}]},
                ],
            },
        ],
        "weekIntents": [
            {"weekNumber": w, "phase": "Base" if w <= 4 else "Build",
             "focus": f"week {w}", "deload": w == 5, "volumeMultiplier": 0.6 if w == 5 else 1.0}
            for w in range(1, weeks_total + 1)
        ],
        "deloadWeeks": [5],
        "milestones": [{"week": 4, "title": "Checkpoint", "criteria": "3 strict pull-ups"}],
    }


class TestCoerce:
    def test_prose_reps_moved_to_notes(self):
        out = coerce_exercise_numbers([{"exerciseName": "Tempo Run", "sets": 3,
                                        "reps": "8 min at half marathon pace"}])
        assert out[0]["reps"] == 1
        assert "half marathon pace" in out[0]["notes"]

    def test_numeric_string_reps_parsed(self):
        out = coerce_exercise_numbers([{"exerciseName": "Squat", "sets": "4", "reps": "6"}])
        assert out[0]["sets"] == 4 and out[0]["reps"] == 6

    def test_garbage_defaults(self):
        out = coerce_exercise_numbers([{"exerciseName": "X", "sets": None, "reps": None}])
        assert out[0]["sets"] == 3 and out[0]["reps"] == 1


class TestPlannerModel:
    def test_override_wins(self):
        class S:
            openai_model = "mini"
            openai_model_planner = "strong"
        assert planner_model(S()) == "strong"

    def test_fallback(self):
        class S:
            openai_model = "mini"
            openai_model_planner = None
        assert planner_model(S()) == "mini"


class TestNormalizeSkeleton:
    def test_valid_passes_through(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        assert len(s["phases"]) == 2
        assert len(s["weekIntents"]) == 8
        assert s["deloadWeeks"] == [5]
        assert s["milestones"][0]["week"] == 4

    def test_gap_between_phases_closed(self):
        raw = _skeleton()
        raw["phases"][1]["startWeek"] = 7  # gap: weeks 5-6 uncovered
        s = normalize_skeleton(raw, 8, 2)
        covered = set()
        for p in s["phases"]:
            covered.update(range(p["startWeek"], p["endWeek"] + 1))
        assert covered == set(range(1, 9))

    def test_missing_intents_synthesized(self):
        raw = _skeleton()
        raw["weekIntents"] = raw["weekIntents"][:3]  # model only wrote 3
        s = normalize_skeleton(raw, 8, 2)
        assert [i["weekNumber"] for i in s["weekIntents"]] == list(range(1, 9))

    def test_deload_inserted_for_long_plan_without_one(self):
        raw = _skeleton()
        raw["deloadWeeks"] = []
        for i in raw["weekIntents"]:
            i["deload"] = False
            i["volumeMultiplier"] = 1.0
        s = normalize_skeleton(raw, 8, 2)
        assert s["deloadWeeks"], "expects a deload for an 8-week plan"

    def test_deload_intent_capped_at_deload_multiplier(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        wk5 = next(i for i in s["weekIntents"] if i["weekNumber"] == 5)
        assert wk5["deload"] is True
        assert wk5["volumeMultiplier"] <= 0.6

    def test_empty_returns_empty(self):
        assert normalize_skeleton({}, 8, 2) == {}

    def test_prose_reps_in_blueprints_coerced(self):
        raw = _skeleton()
        raw["phases"][0]["sessionBlueprints"][0]["exercises"][0]["reps"] = "30 min easy"
        s = normalize_skeleton(raw, 8, 2)
        ex = s["phases"][0]["sessionBlueprints"][0]["exercises"][0]
        assert isinstance(ex["reps"], int)


class TestMaterializeWeek:
    def test_day_hints_respected(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        week = materialize_week(s, 1, [1, 3])
        assert [w["dayOfWeek"] for w in week["workouts"]] == [1, 3]
        assert week["workouts"][0]["customWorkout"]["title"] == "Tempo Run"
        assert week["resolved"] is True

    def test_unhinted_days_filled_in_order(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        week = materialize_week(s, 1, [2, 5])  # hints 1,3 not available
        assert [w["dayOfWeek"] for w in week["workouts"]] == [2, 5]

    def test_deload_week_scales_sets(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        normal = materialize_week(s, 6, [1, 3])   # Build phase, mult 1.0
        deload = materialize_week(s, 5, [1, 3])   # deload, mult 0.6
        n_sets = len(normal["workouts"][1]["customWorkout"]["exercises"][0]["sets"])
        d_sets = len(deload["workouts"][1]["customWorkout"]["exercises"][0]["sets"])
        assert d_sets < n_sets
        assert deload["deloadWeek"] is True

    def test_timed_work_carries_time_and_notes(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        week = materialize_week(s, 1, [1, 3])
        run = week["workouts"][0]["customWorkout"]["exercises"][0]
        assert run["sets"][0]["time"] == 1800
        assert "threshold pace" in run["notes"]
        assert "threshold pace" in week["workouts"][0]["notes"]

    def test_uncovered_week_returns_none(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        assert materialize_week(s, 99, [1, 3]) is None


class TestStubsAndFullBuild:
    def test_stub_is_unresolved_with_intent(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        stub = build_week_stub(s, 6)
        assert stub["resolved"] is False
        assert stub["workouts"] == []
        assert stub["weekNumber"] == 6

    def test_full_build_materializes_horizon_only(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        weeks = build_plan_weeks_from_skeleton(s, [1, 3], 8, horizon=2)
        assert len(weeks) == 8
        assert all(w["resolved"] is True for w in weeks[:2])
        assert all(w["resolved"] is False for w in weeks[2:])

    def test_week_is_resolved_missing_flag_means_resolved(self):
        assert week_is_resolved({"weekNumber": 1}) is True
        assert week_is_resolved({"weekNumber": 1, "resolved": False}) is False


class TestComputeAdaptation:
    def _adherence(self, pct, missed=0, completed=5):
        return {"adherencePct": pct, "missed": missed, "completed": completed}

    def test_no_data_uses_intent(self):
        mult, note, deload = compute_adaptation(self._adherence(None), False, 1.1, 1.0)
        assert mult == 1.1 and not deload

    def test_high_adherence_capped_by_ramp(self):
        # intent jumps 1.0 -> 1.5: cap at prev * WEEKLY_RAMP_CAP (1.10)
        mult, note, _ = compute_adaptation(self._adherence(95), False, 1.5, 1.0)
        assert mult == pytest.approx(1.10)
        assert note  # explains the cap

    def test_mid_adherence_holds(self):
        mult, note, _ = compute_adaptation(self._adherence(75), False, 1.2, 1.0)
        assert mult == pytest.approx(1.0)

    def test_low_adherence_reduces_and_never_stacks(self):
        mult, note, _ = compute_adaptation(self._adherence(40, missed=3), False, 1.2, 1.0)
        assert mult == pytest.approx(0.9)
        assert "not stacked" in note

    def test_two_low_weeks_converts_to_deload(self):
        mult, note, deload = compute_adaptation(
            self._adherence(40), False, 1.0, 1.0,
            consecutive_low_weeks=2, weeks_since_deload=5,
        )
        assert deload is True
        assert mult <= 0.6

    def test_deload_conversion_respects_min_gap(self):
        mult, note, deload = compute_adaptation(
            self._adherence(40), False, 1.0, 1.0,
            consecutive_low_weeks=2, weeks_since_deload=2,  # too soon
        )
        assert deload is False

    def test_safety_flags_clamp_to_one(self):
        mult, note, _ = compute_adaptation(self._adherence(None), True, 1.2, 1.0)
        assert mult <= 1.0
        assert "conservative" in note.lower()


class TestComputeCurrentWeek:
    def test_advances_one_week_after_seven_days(self):
        week, anchor, changed = compute_current_week(
            2, 8, datetime(2026, 7, 1), None, datetime(2026, 7, 9))
        assert (week, changed) == (3, True)
        assert anchor == datetime(2026, 7, 8)  # +7d, not today (no drift)

    def test_no_advance_before_seven_days(self):
        week, _, changed = compute_current_week(
            2, 8, datetime(2026, 7, 5), None, datetime(2026, 7, 9))
        assert (week, changed) == (2, False)

    def test_advances_at_most_one_week_even_after_long_gap(self):
        # 3 weeks elapsed (e.g. plan was paused): advance by ONE, not three.
        week, _, changed = compute_current_week(
            2, 8, datetime(2026, 6, 1), None, datetime(2026, 7, 9))
        assert (week, changed) == (3, True)

    def test_falls_back_to_start_date(self):
        week, _, changed = compute_current_week(
            1, 8, None, datetime(2026, 7, 1), datetime(2026, 7, 9))
        assert (week, changed) == (2, True)

    def test_clamped_at_weeks_total(self):
        week, _, changed = compute_current_week(
            8, 8, datetime(2026, 6, 1), None, datetime(2026, 7, 9))
        assert (week, changed) == (8, False)

    def test_no_anchor_no_change(self):
        week, _, changed = compute_current_week(1, 8, None, None, datetime(2026, 7, 9))
        assert (week, changed) == (1, False)


class TestTimedVolumeScaling:
    """Deload/taper must scale endurance DURATION, not just set counts —
    a single-set long run can't drop below one set."""

    def test_deload_scales_run_duration(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        normal = materialize_week(s, 1, [1, 3])          # mult 1.0
        deload = materialize_week(s, 1, [1, 3], volume_multiplier=0.6)
        run_n = normal["workouts"][0]["customWorkout"]["exercises"][0]["sets"][0]["time"]
        run_d = deload["workouts"][0]["customWorkout"]["exercises"][0]["sets"][0]["time"]
        assert run_d < run_n
        assert run_d == int(run_n * 0.6)

    def test_progression_does_not_inflate_duration(self):
        s = normalize_skeleton(_skeleton(), 8, 2)
        week = materialize_week(s, 1, [1, 3], volume_multiplier=1.1)
        run = week["workouts"][0]["customWorkout"]["exercises"][0]["sets"][0]["time"]
        assert run == 1800  # duration prescriptions don't auto-inflate

    def test_duration_floor_sixty_seconds(self):
        out = _scaled_sets({"exerciseName": "Sprint", "sets": 1, "reps": 1, "timeSeconds": 90}, 0.1)
        assert out[0]["time"] == 60
