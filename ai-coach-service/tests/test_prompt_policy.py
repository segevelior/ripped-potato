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
    assert "session_template_id" in SYSTEM_PROMPT


def test_domain_vocabulary_anchor():
    """Stage 4 of the workout→session rename: the coach must be told that a
    session is the umbrella for ALL training, not a renamed gym workout."""
    assert "DOMAIN VOCABULARY" in SYSTEM_PROMPT
    assert "SESSION vs EXERCISE" in SYSTEM_PROMPT
    # Multi-sport examples are what make the umbrella concrete.
    for sport in ("climbing", "bike ride", "run", "mobility"):
        assert sport in SYSTEM_PROMPT, sport
    # "workout" must survive as USER vocabulary — never scrubbed.
    assert '"workout"' in SYSTEM_PROMPT
    assert "discipline" in SYSTEM_PROMPT
