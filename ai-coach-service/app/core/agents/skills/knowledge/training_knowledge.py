"""
Training knowledge base — sourced constants for deterministic plan checks.

Follows the reflection_config.py pattern (a plain module of documented dicts, no
class). These thresholds are population-level guidance; several are best-practice
heuristics rather than RCT-proven constants and are tagged accordingly. Skills
read these constants so the numbers live in one auditable place, not in prompts.

Sources are noted inline: WHO 2020 physical-activity guidelines; Schoenfeld et al.
2017 (hypertrophy volume); ACSM Guidelines; concurrent-training reviews
(Schumann 2022). Contested metrics (ACWR, the "10% rule") are flagged so no skill
treats them as settled.
"""

# Minimum training frequency (sessions/week) by goal category.
# Goal categories match the ai-coach `goals` collection: strength, endurance,
# skill, weight, performance, health, general.
MIN_SESSIONS_PER_WEEK = {
    "strength": 2,       # ACSM: 2+ resistance days/week
    "endurance": 3,      # aerobic base needs frequency
    "skill": 2,          # skill acquisition benefits from frequency
    "weight": 3,         # combined resistance + aerobic
    "performance": 3,
    "health": 2,         # WHO: muscle-strengthening 2+ days/week
    "general": 2,
}

# Minimum working sets per week (whole-body proxy; per-muscle counting is a v2
# enhancement that needs exercise->muscle resolution). Hypertrophy anchor:
# Schoenfeld/Ogborn/Krieger 2017 ~10 sets/muscle/week for maximizing growth.
MIN_WEEKLY_SETS = {
    "strength": 10,
    "endurance": 6,
    "skill": 8,
    "weight": 10,
    "performance": 10,
    "health": 6,
    "general": 8,
}

# WHO 2020 aerobic guidance (minutes/week of moderate activity) — used for
# endurance/health/weight goal specificity checks.
WHO_AEROBIC_MIN_MINUTES = 150
WHO_AEROBIC_MAX_MINUTES = 300

# Recovery / spacing (best-practice heuristics).
MIN_HOURS_SAME_MUSCLE = 48          # >=48h between heavy same-muscle sessions
MIN_HOURS_CONCURRENT_SEPARATION = 3  # strength+endurance same day: separate >=3h
DELOAD_EVERY_WEEKS_MIN = 4           # deload cadence 4-6 weeks
DELOAD_EVERY_WEEKS_MAX = 6

# Week-over-week load ramp cap. NOTE: the "10% rule" is NOT an evidence-based
# hard threshold (Buist 2008; Nielsen review) — used here only as a conservative
# guideline default. Allow some slack before flagging.
WEEKLY_RAMP_CAP = 1.10               # guideline
WEEKLY_RAMP_HARD_FLAG = 1.30         # flag clearly aggressive jumps

# Metrics that must never autonomously gate or predict injury (surface honestly).
CONTESTED_METRICS = {
    "ACWR": "Acute:chronic workload ratio — criticized for poor predictive "
            "validity (Impellizzeri 2020). Monitoring aid only, never a gate.",
    "ten_percent_rule": "No evidence for 10%/week as a hard threshold (Buist "
                        "2008; Nielsen review). Guideline, not a rule.",
    "HRV_readiness": "Noisy and individual; a soft nudge, never an autonomous "
                     "decision driver.",
}

# Disciplines that count as aerobic/endurance stimulus (for goal-specificity).
AEROBIC_WORKOUT_TYPES = {"cardio", "hiit", "endurance"}


def min_sessions_for_goal(category: str) -> int:
    return MIN_SESSIONS_PER_WEEK.get((category or "general").lower(), MIN_SESSIONS_PER_WEEK["general"])


def min_weekly_sets_for_goal(category: str) -> int:
    return MIN_WEEKLY_SETS.get((category or "general").lower(), MIN_WEEKLY_SETS["general"])


def expects_deload(weeks_total: int) -> bool:
    """Plans long enough to warrant at least one deload."""
    return weeks_total is not None and weeks_total >= DELOAD_EVERY_WEEKS_MAX
