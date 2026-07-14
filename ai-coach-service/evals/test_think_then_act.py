"""
Think-then-act eval: replay the Endurance-1 failure family against the real
orchestrator + real LLM, grade trajectories deterministically and diff the
final DB state. pass^k semantics: every one of EVAL_K iterations must pass.

Run:  RUN_LLM_EVALS=1 EVAL_K=2 pytest evals/ -x -q   (from ai-coach-service/)
"""
import os

import pytest

from app.core.agents.orchestrator import AgentOrchestrator
from evals.harness import Trace, instrument, run_turn
from evals.scenarios import SCENARIOS, seed_user

EVAL_K = int(os.environ.get("EVAL_K", "2"))


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.id for s in SCENARIOS])
async def test_scenario(scenario, scratch_db):
    for iteration in range(EVAL_K):
        user_id = await seed_user(scratch_db)  # fresh user per iteration
        refs = await scenario.seed(scratch_db, user_id)

        orchestrator = AgentOrchestrator(scratch_db)
        trace = Trace()
        instrument(orchestrator, trace)

        history = []
        for turn_index, message in enumerate(scenario.turns):
            trace.current_turn = turn_index
            text = await run_turn(orchestrator, message, history, user_id)
            trace.turn_texts.append(text)
            history.append({"role": "human", "content": message})
            history.append({"role": "ai", "content": text})

        problems = []
        for check in scenario.trajectory_checks:
            problems.extend(f"[trajectory] {v}" for v in check(trace))
        problems.extend(
            f"[state] {v}"
            for v in await scenario.final_state_check(scratch_db, user_id, refs, trace)
        )

        if problems:
            calls = "\n".join(
                f"  turn {c.turn}: {c.name}({ {k: v for k, v in (c.args or {}).items() if k != 'workoutDetails'} })"
                for c in trace.calls
            )
            pytest.fail(
                f"scenario '{scenario.id}' iteration {iteration + 1}/{EVAL_K} failed:\n"
                + "\n".join(f"- {p}" for p in problems)
                + f"\n\ntool calls:\n{calls}"
            )
