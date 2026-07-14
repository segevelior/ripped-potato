"""
Regression guard for the system prompt: the tool_use_policy block must exist
and the incident-hardened anchors it deliberately does NOT replace must
survive future edits byte-for-byte at the phrase level.
"""
from app.core.agents.prompts import SYSTEM_PROMPT


def test_tool_use_policy_block_present():
    assert "<tool_use_policy>" in SYSTEM_PROMPT
    assert "</tool_use_policy>" in SYSTEM_PROMPT
    assert "Read before write" in SYSTEM_PROMPT
    assert "No placeholders, no invented IDs" in SYSTEM_PROMPT
    assert "Delete vs skip" in SYSTEM_PROMPT


def test_incident_hardened_anchors_untouched():
    # TOR-88: declined previews must never be written.
    assert "HONOR THE ANSWER (CRITICAL)" in SYSTEM_PROMPT
    assert "dry-run PREVIEW" in SYSTEM_PROMPT
    # Plans-from-tools highest-priority rule.
    assert "PLANS COME FROM TOOLS" in SYSTEM_PROMPT
    # Ground-in-real-data rule.
    assert "GROUND IN THE USER'S REAL DATA FIRST" in SYSTEM_PROMPT


def test_new_tools_documented():
    assert "delete_calendar_event" in SYSTEM_PROMPT
    assert "workout_template_id" in SYSTEM_PROMPT
