# Sensei think-then-act evals

Real-LLM behavioral evals for the agent's read-before-write discipline,
derived from the "Add Endurance 1" production failure (empty placeholder
template, duplicates, skip-instead-of-delete).

## What runs

Each scenario in `scenarios.py` seeds a throwaway user on a **scratch
database** (`sensei-evals-<pid>-<ts>`) on the configured Atlas cluster,
drives the real `AgentOrchestrator.process_request_streaming` (real OpenAI
key + model from `.env`), and grades with:

- **Trajectory invariants** (`harness.py`): read-before-write, id
  provenance (every id arg must appear in an earlier tool result), no
  false-success claims, no-writes for must-ask scenarios.
- **Final-state diff**: the DB is the ground truth (tau-bench style) —
  exactly one linked event, no empty templates, deleted means gone.
- **pass^k**: `EVAL_K` iterations per scenario (default 2), all must pass.

The scratch DB is dropped unconditionally in teardown.

## Running

```bash
cd ai-coach-service
RUN_LLM_EVALS=1 EVAL_K=2 pytest evals/ -x -q
```

- Never runs by default: the directory is outside `testpaths` and every
  test is skipped unless `RUN_LLM_EVALS=1`.
- **Costs real OpenAI tokens**: ~6 scenarios × K iterations × 2–5 model
  rounds each. Keep `EVAL_K` small for smoke runs.
- Model comes from `.env` (`OPENAI_MODEL`) — run A/B by switching the
  model or the code revision, keeping the eval suite fixed.
