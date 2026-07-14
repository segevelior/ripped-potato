"""Volume-string parsing and template flattening shared by calendar flows.

Calendar events reference a PredefinedWorkout instead of embedding exercises,
so every consumer derives sets/reps from the template's blocks via these
helpers. Mirrors backend/src/utils/volume.js.
"""

import re
from typing import Any, Dict, List


def parse_volume(volume: Any) -> tuple[int, int]:
    """Parse a PredefinedWorkout volume string like '3x10' / '3 x 8-12' into
    (sets, reps). Falls back to (3, 10)."""
    m = re.match(r"\s*(\d+)\s*[xX]\s*(\d+)", str(volume or ""))
    if m:
        return int(m.group(1)), int(m.group(2))
    return 3, 10


def flatten_template_exercises(template: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten template blocks[].exercises[] into the per-exercise shape the
    coach surfaces (name/targetSets/targetReps/notes + exerciseId)."""
    flattened = []
    for block in (template or {}).get("blocks", []) or []:
        for ex in block.get("exercises", []) or []:
            sets, reps = parse_volume(ex.get("volume"))
            flattened.append({
                "exerciseId": ex.get("exercise_id"),
                "exerciseName": ex.get("exercise_name", ""),
                "targetSets": sets,
                "targetReps": reps,
                "notes": ex.get("notes", ""),
            })
    return flattened
