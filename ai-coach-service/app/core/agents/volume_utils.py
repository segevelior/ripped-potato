"""Dependency-free volume parsing shared by skills and services.

Lives outside the skills package so services can import it without triggering
the skills package __init__ (which registers every skill and imports services
back — a circular import).
"""
import re
from typing import Any


def parse_volume(volume: Any) -> tuple[int, int]:
    """Parse a PredefinedWorkout volume string like '3x10' / '3 x 8-12' into
    (sets, reps). Falls back to (3, 10)."""
    m = re.match(r"\s*(\d+)\s*[xX]\s*(\d+)", str(volume or ""))
    if m:
        return int(m.group(1)), int(m.group(2))
    return 3, 10
