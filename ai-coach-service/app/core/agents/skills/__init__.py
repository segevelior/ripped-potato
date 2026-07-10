"""
Skills package for the AI coach.

Importing this package registers every skill module (each import triggers the
@skill decorator side-effect). To add a skill: create a module here and add its
import to the "Register skill modules" block below.
"""

from app.core.agents.skills.registry import (  # noqa: F401
    SkillContext,
    SkillRegistry,
    get_skill_definitions,
    get_skill_handler,
    get_skill_names,
    registry,
    skill,
)

# ---- Register skill modules (import for decorator side-effects) ----
# Add one import line per new skill file.
from app.core.agents.skills import example_skill  # noqa: F401,E402
from app.core.agents.skills import schedule_plan_skill  # noqa: F401,E402

__all__ = [
    "SkillContext",
    "SkillRegistry",
    "get_skill_definitions",
    "get_skill_handler",
    "get_skill_names",
    "registry",
    "skill",
]
