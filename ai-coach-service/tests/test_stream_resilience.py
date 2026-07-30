"""Stream-loop resilience: a tool round cut by the output cap must not
silently evaporate the turn (2026-07-30 prod incident), malformed tool args
must not kill the stream, and an empty completion must still persist a
message so the human turn is never orphaned."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.agents.orchestrator import (
    ROUND_MAX_COMPLETION_TOKENS,
    TRUNCATED_ROUND_MESSAGE,
    AgentOrchestrator,
)


# --- fake OpenAI streaming machinery --------------------------------------

def _chunk(content=None, tool_calls=None, finish_reason=None):
    delta = SimpleNamespace(content=content, tool_calls=tool_calls)
    choice = SimpleNamespace(delta=delta, finish_reason=finish_reason)
    return SimpleNamespace(choices=[choice])


def _tool_call_chunk(index, call_id=None, name=None, arguments=None):
    fn = SimpleNamespace(name=name, arguments=arguments)
    return SimpleNamespace(index=index, id=call_id, function=fn)


async def _stream(chunks):
    for c in chunks:
        yield c


def _fake_client(streams):
    """OpenAI client double: each chat.completions.create call pops the next
    scripted stream."""
    client = MagicMock()
    queue = list(streams)

    async def create(**kwargs):
        return _stream(queue.pop(0))

    client.chat.completions.create = AsyncMock(side_effect=create)
    return client


@pytest.fixture
def orchestrator():
    """Real AgentOrchestrator over mocks: AttachmentService patched out (its
    GridFS bucket rejects a MagicMock db); data/memory/context reads stubbed."""
    with patch("app.core.agents.orchestrator.AttachmentService"):
        orch = AgentOrchestrator(MagicMock(), None)
    orch.data_reader.process = AsyncMock(return_value={
        "user_profile": {}, "exercises": [], "workouts": [], "goals": [],
    })
    orch.memory_service.get_user_memories = AsyncMock(return_value=[])
    orch._build_extra_context = AsyncMock(return_value="")
    orch._requires_reflection = MagicMock(return_value=False)
    orch._execute_tool = AsyncMock(return_value={"success": True, "message": "ok"})
    return orch


async def _collect(orch, message="do the thing"):
    events = []
    async for ev in orch.process_request_streaming(
        message, {"user_id": "u1"}, conversation_history=None
    ):
        events.append(ev)
    return events


# --- finish_reason=length with accumulated tool calls ----------------------

@pytest.mark.asyncio
async def test_length_cut_round_yields_honest_message_not_silence(orchestrator):
    orchestrator.client = _fake_client([[
        _chunk(tool_calls=[_tool_call_chunk(0, "call_1", "add_exercise", '{"name": "Easy Bould')]),
        _chunk(finish_reason="length"),
    ]])

    events = await _collect(orchestrator)

    # No tool ran, but the turn is NOT empty: the honest notice streamed out
    assert not any(e["type"] == "tool_start" for e in events)
    tokens = "".join(e.get("content", "") for e in events if e["type"] == "token")
    assert TRUNCATED_ROUND_MESSAGE in tokens
    complete = next(e for e in events if e["type"] == "complete")
    assert TRUNCATED_ROUND_MESSAGE in complete["full_response"]
    # The discarded round must not be persisted for replay
    assert not complete.get("tool_rounds")


@pytest.mark.asyncio
async def test_length_cut_follow_up_round_same_behaviour(orchestrator):
    valid_args = json.dumps({"name": "Easy Bouldering"})
    orchestrator.client = _fake_client([
        # Round 1: one valid tool call, executes fine
        [
            _chunk(tool_calls=[_tool_call_chunk(0, "call_1", "add_exercise", valid_args)]),
            _chunk(finish_reason="tool_calls"),
        ],
        # Follow-up round: cut by the cap mid-args
        [
            _chunk(tool_calls=[_tool_call_chunk(0, "call_2", "create_session_template", '{"name": "Boulder')]),
            _chunk(finish_reason="length"),
        ],
    ])

    events = await _collect(orchestrator)

    assert sum(1 for e in events if e["type"] == "tool_start") == 1  # only round 1
    tokens = "".join(e.get("content", "") for e in events if e["type"] == "token")
    assert TRUNCATED_ROUND_MESSAGE in tokens


# --- malformed args inside an executed round -------------------------------

@pytest.mark.asyncio
async def test_malformed_args_feed_error_result_and_siblings_still_run(orchestrator):
    valid_args = json.dumps({"name": "Easy Bouldering"})
    orchestrator.client = _fake_client([
        [
            _chunk(tool_calls=[_tool_call_chunk(0, "call_1", "add_exercise", valid_args)]),
            _chunk(tool_calls=[_tool_call_chunk(1, "call_2", "add_exercise", '{"name": "trunc')]),
            _chunk(finish_reason="tool_calls"),
        ],
        # Final response round after tools
        [_chunk(content="Done."), _chunk(finish_reason="stop")],
    ])

    events = await _collect(orchestrator)

    # The valid sibling executed; the malformed one surfaced as a failure
    assert orchestrator._execute_tool.await_count == 1
    completes = [e for e in events if e["type"] == "tool_complete"]
    assert any(c["success"] for c in completes)
    assert any(not c["success"] and c["message"] == "arguments truncated" for c in completes)
    # Stream survived to a normal completion
    complete = next(e for e in events if e["type"] == "complete")
    assert "Done." in complete["full_response"]
    # Replay adjacency: the persisted round has a result for BOTH calls
    (round_,) = complete["tool_rounds"]
    assert {r["tool_call_id"] for r in round_["results"]} == {"call_1", "call_2"}


# --- empty completion must still persist something (chat_stream) -----------

@pytest.mark.asyncio
async def test_empty_completion_saves_fallback_message():
    from app.api.v1.chat_stream import generate_sse_stream

    async def empty_orchestrator_stream(**kwargs):
        yield {"type": "complete", "full_response": "", "tool_rounds": []}

    orch = MagicMock()
    orch.process_request_streaming = empty_orchestrator_stream
    conversation_service = MagicMock()
    conversation_service.add_message = AsyncMock(return_value=True)

    lines = []
    async for line in generate_sse_stream(
        orchestrator=orch,
        message="Okay",
        user_context={"user_id": "u1"},
        conversation_service=conversation_service,
        conversation_id="conv-1",
        conversation_history=[],
    ):
        lines.append(line)

    # The turn persisted with the fallback text — never an orphaned human turn
    conversation_service.add_message.assert_awaited_once()
    saved = conversation_service.add_message.await_args.kwargs
    assert "Something went wrong" in saved["content"]
    # And the user saw it too
    assert any("Something went wrong" in line for line in lines if '"token"' in line)


@pytest.mark.asyncio
async def test_normal_completion_unchanged():
    from app.api.v1.chat_stream import generate_sse_stream

    async def ok_stream(**kwargs):
        yield {"type": "token", "content": "Hi there"}
        yield {"type": "complete", "full_response": "Hi there", "tool_rounds": []}

    orch = MagicMock()
    orch.process_request_streaming = ok_stream
    conversation_service = MagicMock()
    conversation_service.add_message = AsyncMock(return_value=True)

    async for _ in generate_sse_stream(
        orchestrator=orch,
        message="hello",
        user_context={"user_id": "u1"},
        conversation_service=conversation_service,
        conversation_id="conv-1",
        conversation_history=[],
    ):
        pass

    saved = conversation_service.add_message.await_args.kwargs
    assert saved["content"] == "Hi there"


def test_round_cap_fits_a_multi_create_round():
    # Regression guard on the constant itself: 3 rich templates + 5 exercises
    # ≈ 6-8k chars of JSON args ≈ 2-3k tokens, plus reasoning-free prose.
    assert ROUND_MAX_COMPLETION_TOKENS >= 8000
