"""Tests for tool-call memory across turns: history replay of persisted
tool_rounds, the write-aware grounding relaxation, and storage truncation."""

import json

from app.core.agents.orchestrator import (
    REPLAY_TOOL_CHARS_BUDGET,
    REPLAY_TOOL_ROUNDS_LAST_K,
    _call_is_write,
    _expand_tool_rounds,
    _history_to_openai_messages,
    _history_write_in_replay_window,
    _replayable_indexes,
    _sanitize_replayed_content,
)
from app.services.conversation_service import (
    TOOL_RESULT_PERSIST_MAX_CHARS,
    ConversationService,
    _truncate_tool_result,
)


def _round(call_id="call_1", name="get_calendar_events", args='{"start_date":"2026-07-26"}',
           content='{"success": true, "events": []}'):
    return {
        "tool_calls": [{"id": call_id, "name": name, "arguments": args}],
        "results": [{"tool_call_id": call_id, "name": name, "content": content}],
    }


def _ai(content="ok", tool_rounds=None):
    msg = {"role": "ai", "content": content}
    if tool_rounds is not None:
        msg["tool_rounds"] = tool_rounds
    return msg


def _human(content="hi"):
    return {"role": "human", "content": content}


# --- legacy history -------------------------------------------------------

def test_legacy_text_only_history_unchanged():
    history = [_human("hello"), _ai("hi there"), _human("more"), _ai("sure")]
    messages = _history_to_openai_messages(history)
    assert messages == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there"},
        {"role": "user", "content": "more"},
        {"role": "assistant", "content": "sure"},
    ]


# --- expansion ------------------------------------------------------------

def test_tool_rounds_expand_with_adjacency():
    history = [_human("add a workout"), _ai("done", [_round()])]
    messages = _history_to_openai_messages(history)
    assert [m["role"] for m in messages] == ["user", "assistant", "tool", "assistant"]
    assistant_tc = messages[1]
    assert assistant_tc["content"] is None
    assert assistant_tc["tool_calls"][0]["id"] == "call_1"
    assert assistant_tc["tool_calls"][0]["function"]["name"] == "get_calendar_events"
    assert messages[2] == {
        "role": "tool",
        "tool_call_id": "call_1",
        "content": '{"success": true, "events": []}',
    }
    assert messages[3] == {"role": "assistant", "content": "done"}


def test_multi_call_round_keeps_call_order():
    round_ = {
        "tool_calls": [
            {"id": "a", "name": "get_calendar_events", "arguments": "{}"},
            {"id": "b", "name": "grep_workouts", "arguments": "{}"},
        ],
        "results": [
            # persisted out of order on purpose
            {"tool_call_id": "b", "name": "grep_workouts", "content": "B"},
            {"tool_call_id": "a", "name": "get_calendar_events", "content": "A"},
        ],
    }
    expanded = _expand_tool_rounds([round_])
    assert [m["role"] for m in expanded] == ["assistant", "tool", "tool"]
    assert [m["content"] for m in expanded[1:]] == ["A", "B"]  # call order, not stored order


def test_tool_only_turn_with_empty_content_is_valid():
    history = [_human("do it"), _ai("", [_round()])]
    messages = _history_to_openai_messages(history)
    # No empty trailing assistant message; sequence still valid.
    assert [m["role"] for m in messages] == ["user", "assistant", "tool"]


# --- orphan guard ----------------------------------------------------------

def test_orphaned_round_is_skipped_whole():
    orphan = {
        "tool_calls": [
            {"id": "a", "name": "get_calendar_events", "arguments": "{}"},
            {"id": "b", "name": "grep_workouts", "arguments": "{}"},
        ],
        "results": [{"tool_call_id": "a", "name": "get_calendar_events", "content": "A"}],
    }
    assert _expand_tool_rounds([orphan]) == []
    # A good round alongside the orphan still expands.
    assert len(_expand_tool_rounds([orphan, _round()])) == 2


def test_empty_calls_round_is_skipped():
    assert _expand_tool_rounds([{"tool_calls": [], "results": []}]) == []


def test_missing_arguments_and_content_are_coerced():
    round_ = {
        "tool_calls": [{"id": "a", "name": "list_plans"}],
        "results": [{"tool_call_id": "a", "name": "list_plans", "content": None}],
    }
    expanded = _expand_tool_rounds([round_])
    assert expanded[0]["tool_calls"][0]["function"]["arguments"] == "{}"
    assert expanded[1]["content"] == ""


# --- replay window ----------------------------------------------------------

def test_only_last_k_tool_bearing_messages_replay():
    history = []
    for i in range(REPLAY_TOOL_ROUNDS_LAST_K + 2):
        history.append(_human(f"q{i}"))
        history.append(_ai(f"a{i}", [_round(call_id=f"call_{i}")]))
    messages = _history_to_openai_messages(history)
    tool_msgs = [m for m in messages if m.get("role") == "tool"]
    assert len(tool_msgs) == REPLAY_TOOL_ROUNDS_LAST_K
    # The replayed ones are the most recent.
    replayed_ids = {m["tool_call_id"] for m in tool_msgs}
    assert replayed_ids == {"call_3", "call_2"}
    # Older turns still present as plain text.
    assert {"role": "assistant", "content": "a0"} in messages


def test_char_budget_collapses_oversized_history():
    big = "x" * (REPLAY_TOOL_CHARS_BUDGET + 1)
    history = [_human("q"), _ai("a", [_round(content=big)])]
    messages = _history_to_openai_messages(history)
    assert all(m.get("role") != "tool" for m in messages)
    assert {"role": "assistant", "content": "a"} in messages


def test_budget_stops_at_first_unaffordable_message():
    # Newest fits, the one before it blows the budget -> only newest replays.
    big = "x" * REPLAY_TOOL_CHARS_BUDGET
    history = [
        _human("q1"), _ai("a1", [_round(call_id="old", content=big)]),
        _human("q2"), _ai("a2", [_round(call_id="new", content="small")]),
    ]
    idx = _replayable_indexes(history)
    assert idx == {3}


# --- calendar-preview sanitization ------------------------------------------

def test_calendar_preview_payload_stripped_on_replay():
    content = 'Preview: <calendar-preview payload="eyJ2IjoxfQ=="></calendar-preview> confirm?'
    assert _sanitize_replayed_content(content) == "Preview: <calendar-preview/> confirm?"
    history = [_human("q"), _ai(content)]
    messages = _history_to_openai_messages(history)
    assert "payload" not in messages[1]["content"]


# --- write classification ----------------------------------------------------

def test_reads_are_not_writes():
    assert _call_is_write("get_calendar_events", "{}") is False
    assert _call_is_write("grep_workouts", '{"pattern": "x"}') is False


def test_always_write_tools():
    assert _call_is_write("save_memory", "{}") is True
    assert _call_is_write("log_workout", None) is True


def test_dry_run_preview_is_read_and_confirmed_write_is_write():
    assert _call_is_write("schedule_to_calendar", "{}") is False  # dry_run defaults true
    assert _call_is_write("schedule_to_calendar", '{"dry_run": true}') is False
    assert _call_is_write("schedule_to_calendar", '{"dry_run": false}') is True
    assert _call_is_write("delete_calendar_event", "{}") is False
    assert _call_is_write("delete_calendar_event", '{"confirm": true}') is True
    # resolve_week writes by default (dry_run defaults false)
    assert _call_is_write("resolve_week", "{}") is True
    assert _call_is_write("resolve_week", '{"dry_run": true}') is False


def test_malformed_arguments_do_not_crash():
    assert _call_is_write("schedule_to_calendar", "not json") is False
    assert _call_is_write("save_memory", "not json") is True


def test_write_in_replay_window_detection():
    no_write = [_human("q"), _ai("a", [_round()])]
    assert _history_write_in_replay_window(no_write) is False

    with_write = [
        _human("q"),
        _ai("a", [_round(name="schedule_to_calendar", args='{"dry_run": false}')]),
    ]
    assert _history_write_in_replay_window(with_write) is True

    # A write outside the replay window (older than K affordable turns) is invisible.
    history = [_human("q0"), _ai("a0", [_round(name="save_memory")])]
    for i in range(1, REPLAY_TOOL_ROUNDS_LAST_K + 1):
        history.append(_human(f"q{i}"))
        history.append(_ai(f"a{i}", [_round(call_id=f"c{i}")]))
    assert _history_write_in_replay_window(history) is False


# --- storage truncation -------------------------------------------------------

def test_small_result_untouched():
    content = '{"success": true}'
    out, truncated = _truncate_tool_result(content)
    assert out == content and truncated is False


def test_json_truncation_stays_valid_and_annotates():
    events = [{"title": f"event {i}", "notes": "n" * 200} for i in range(100)]
    content = json.dumps({"success": True, "events": events})
    assert len(content) > TOOL_RESULT_PERSIST_MAX_CHARS
    out, truncated = _truncate_tool_result(content)
    assert truncated is True
    parsed = json.loads(out)  # must remain valid JSON
    assert parsed["truncated"] is True
    assert parsed["omitted_items"] == 100 - len(parsed["events"])
    assert len(parsed["events"]) > 0  # kept items intact
    assert parsed["events"][0] == events[0]
    assert len(out) <= TOOL_RESULT_PERSIST_MAX_CHARS


def test_non_json_truncation_slices():
    out, truncated = _truncate_tool_result("y" * (TOOL_RESULT_PERSIST_MAX_CHARS + 500))
    assert truncated is True
    assert out.endswith("...[truncated]")


def test_bound_tool_rounds_caps_results():
    big = json.dumps({"success": True, "items": [{"n": i, "pad": "p" * 300} for i in range(200)]})
    rounds = [{
        "tool_calls": [{"id": "a", "name": "grep_workouts", "arguments": "{}"}],
        "results": [{"tool_call_id": "a", "name": "grep_workouts", "content": big}],
    }]
    bounded = ConversationService._bound_tool_rounds(rounds)
    result = bounded[0]["results"][0]
    assert result["truncated"] is True
    assert len(result["content"]) <= TOOL_RESULT_PERSIST_MAX_CHARS
    json.loads(result["content"])
    # Original input not mutated.
    assert rounds[0]["results"][0]["content"] == big
