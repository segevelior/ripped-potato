"""
Real-LLM eval harness for the Sensei agent's think-then-act behavior.

Drives the REAL orchestrator (process_request_streaming — the production
path with the multi-round tool loop) against a scratch MongoDB, captures the
tool-call trace at the single execution choke point (_execute_tool), and
grades trajectories with deterministic checks only (no LLM judge — see
development/ai-coach/evaluation/05-planner-eval-loop.md for why).
"""
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class ToolCall:
    turn: int
    name: str
    args: Dict[str, Any]
    result: Any


@dataclass
class Trace:
    calls: List[ToolCall] = field(default_factory=list)
    turn_texts: List[str] = field(default_factory=list)
    current_turn: int = 0


def instrument(orchestrator, trace: Trace):
    """Wrap the orchestrator's _execute_tool (the choke point both skills and
    legacy handlers flow through) so every tool call lands in the trace."""
    orig = orchestrator._execute_tool

    async def traced(user_id, name, args):
        result = await orig(user_id, name, args)
        trace.calls.append(ToolCall(trace.current_turn, name, args, result))
        return result

    orchestrator._execute_tool = traced
    return orchestrator


async def run_turn(orchestrator, message: str, history: list, user_id: str) -> str:
    """Run one user turn through the streaming path; return the final text."""
    final = None
    tokens: List[str] = []
    async for event in orchestrator.process_request_streaming(
        message, {"user_id": user_id}, conversation_history=history or None
    ):
        etype = event.get("type")
        if etype == "token":
            tokens.append(event.get("content", ""))
        elif etype == "complete":
            final = event.get("full_response")
        elif etype == "error":
            raise AssertionError(f"agent returned error event: {event}")
    return final if final is not None else "".join(tokens)


# ----------------------------- graders -----------------------------

READ_TOOLS = {
    "grep_workouts", "list_workout_templates", "get_calendar_events",
    "list_exercises", "grep_exercises", "get_workout_history",
    "list_plans", "show_plan", "get_daily_recommendation",
}

# Which prior reads legitimize each write. Previews of the same tool count:
# a schedule preview reads the calendar (same-day dedup) before anything is
# written, and a delete preview reads the event.
RELEVANT_READS = {
    "create_workout_template": {"grep_workouts", "list_workout_templates"},
    "schedule_to_calendar": {"get_calendar_events", "grep_workouts",
                             "list_workout_templates", "schedule_to_calendar"},
    "schedule_plan_to_calendar": {"get_calendar_events", "show_plan",
                                  "list_plans", "schedule_plan_to_calendar"},
    "reschedule_session": {"get_calendar_events", "reschedule_session"},
    "delete_calendar_event": {"get_calendar_events", "delete_calendar_event"},
    "delete_workout_template": {"grep_workouts", "list_workout_templates",
                                "delete_workout_template"},
}

ID_ARGS = ("workout_template_id", "event_id", "plan_id", "template_id",
           "predefinedWorkoutId", "exercise_id")


def is_write(call: ToolCall) -> bool:
    """A call that would mutate state (not a preview/dry-run)."""
    name, args = call.name, call.args or {}
    if name in ("schedule_to_calendar", "schedule_plan_to_calendar",
                "reschedule_session"):
        return args.get("dry_run", True) is False
    if name in ("delete_calendar_event", "delete_workout_template"):
        return args.get("confirm", False) is True
    if name in ("create_workout_template", "add_exercise", "log_workout",
                "create_plan", "create_goal", "update_plan", "update_goal",
                "add_plan_workout", "remove_plan_workout",
                "update_calendar_workout"):
        return True
    return False


def _is_preview(call: ToolCall) -> bool:
    name, args = call.name, call.args or {}
    if name in ("schedule_to_calendar", "schedule_plan_to_calendar",
                "reschedule_session"):
        return args.get("dry_run", True) is not False
    if name in ("delete_calendar_event", "delete_workout_template"):
        return args.get("confirm", False) is not True
    return False


def _succeeded(call: ToolCall) -> bool:
    return isinstance(call.result, dict) and call.result.get("success") is not False


def assert_read_before_write(trace: Trace) -> List[str]:
    """Every write must be preceded (anywhere earlier in the CONVERSATION —
    the read→preview→confirm flow spans turns) by a relevant successful read."""
    violations = []
    seen_reads = set()
    for i, call in enumerate(trace.calls):
        if is_write(call):
            required = RELEVANT_READS.get(call.name)
            if required is not None and not (required & seen_reads):
                violations.append(
                    f"call #{i} {call.name} (turn {call.turn}) with no prior "
                    f"relevant read; reads so far: {sorted(seen_reads)}"
                )
        if _succeeded(call) and (call.name in READ_TOOLS or _is_preview(call)):
            seen_reads.add(call.name)
    return violations


def assert_id_provenance(trace: Trace) -> List[str]:
    """Every id argument must have appeared in an earlier tool result —
    ids from thin air are hallucinations."""
    violations = []
    emitted = ""
    for i, call in enumerate(trace.calls):
        for arg in ID_ARGS:
            value = (call.args or {}).get(arg)
            if value and str(value) not in emitted:
                violations.append(
                    f"call #{i} {call.name} used {arg}={value} that appeared "
                    f"in no earlier tool result"
                )
        try:
            emitted += json.dumps(call.result, default=str)
        except (TypeError, ValueError):
            emitted += str(call.result)
    return violations


_SUCCESS_CLAIMS = ("scheduled ✅", "✅ scheduled", "it's scheduled", "has been scheduled",
                   "added to your calendar", "deleted it", "it's deleted", "removed it from")


def assert_no_false_success(trace: Trace) -> List[str]:
    """If a turn performed no successful write, its text must not claim one.
    Heuristic — the authoritative check is the final-state diff."""
    violations = []
    for turn, text in enumerate(trace.turn_texts):
        turn_writes = [c for c in trace.calls if c.turn == turn and is_write(c)]
        wrote = any(_succeeded(c) for c in turn_writes)
        if not wrote:
            lowered = (text or "").lower()
            for claim in _SUCCESS_CLAIMS:
                if claim in lowered:
                    violations.append(
                        f"turn {turn} claims success ('{claim}') but no "
                        f"successful write happened that turn"
                    )
                    break
    return violations


def assert_no_writes(trace: Trace) -> List[str]:
    """For must-ask scenarios: the whole conversation performs zero writes."""
    return [
        f"call #{i} {c.name} is a write but this scenario allows none"
        for i, c in enumerate(trace.calls) if is_write(c)
    ]
