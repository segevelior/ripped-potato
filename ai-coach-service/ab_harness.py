"""
A/B behavior harness for the Sensei coach.

Drives the PRODUCTION streaming path (process_request_streaming) against real
(production) Mongo data, READ-ONLY: every write tool is blocked before it can
touch the DB. Measures the core symptom the user reported — "it answers too
fast, it doesn't check anything" — by recording, per prompt:

  - the event sequence (did prose tokens arrive BEFORE the first tool call?)
  - which tools were called, and whether the coach grounded in the user's data
  - latency, and the final answer text

Run from the ai-coach-service dir:
    poetry run python ab_harness.py --label baseline
    OPENAI_MODEL=gpt-4o poetry run python ab_harness.py --label model-4o

Output: appends a section to AB_TEST.md and prints a summary.
"""

import argparse
import asyncio
import json
import re
import time
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.core.agents.orchestrator import AgentOrchestrator

# The real user (segev) — id taken from chatConversations.metadata.user_id
USER_ID = "6a50b08cfc7515275d6e0e68"

# Tools that only READ. Everything else (creates, updates, schedule, log,
# save/delete memory, and ALL skills) is blocked so the harness can never
# mutate production data.
READ_ONLY_TOOLS = {
    "get_calendar_events",
    "list_workout_templates",
    "get_workout_history",
    "list_plans",
    "list_goals",
    "list_exercises",
    "list_memories",
    "grep_exercises",
    "grep_workouts",
    "web_search",
    "read_url",
    "research",
}

# Grounding = the coach actually read the user's plan/calendar/history.
GROUNDING_TOOLS = {
    "get_calendar_events",
    "list_workout_templates",
    "get_workout_history",
    "list_plans",
    "grep_workouts",
}

# "Think like a user": the answer FAILS if it asks the user to hand over data
# the system already has (their own plan/exercises).
PUNT_RE = re.compile(
    r"(paste|share|send( me)?|screenshot|tell me) (the |your |me your )?"
    r"(exercises|workouts?|plan|split|list|sessions)"
    r"|can'?t see the (exact )?exercise",
    re.IGNORECASE,
)

# Exercises that really exist in this user's scheduled workouts (from prod data).
# An answer that names one of these is grounded in the REAL plan, not generic.
REAL_PLAN_EXERCISES = [
    "skin the cat", "explosive pull", "straight bar dip", "hanging l-sit",
    "l-sit", "pike push", "bodyweight row", "victorian", "reverse hyper",
    "toes to bar", "prone y raise", "german hang", "hollow body",
    "russian twist", "side plank", "slow push-up", "scapula", "pancake",
]

PROMPTS = [
    "don't change anything, but based on my training plan, if I want to add or "
    "swap with another exercise and add the dragon flag and the side flag (on a "
    "ladder), in what workouts would you add them? I want the dragon flag once a "
    "week and the side flag once a week.",

    "based on my calendar, which of my endurance days is a better fit for the "
    "side flag — Endurance 1 or Endurance 2?",

    "what's my workout scheduled for Sunday?",

    "in my Strength and Conditioning workout, which exact exercise should I "
    "replace to make room for a dragon flag?",
]


def install_readonly_guard(orch: AgentOrchestrator, current):
    """Wrap _execute_tool ONCE: record to the active recorder, block writes.

    `current` is a one-element list holding the active per-prompt recorder, so
    main() can swap recorders between prompts without re-wrapping.
    """
    original = orch._execute_tool

    async def guarded(user_id, function_name, args):
        if current[0] is not None:
            current[0].append(function_name)
        if function_name not in READ_ONLY_TOOLS:
            return {
                "success": False,
                "blocked": True,
                "message": (
                    f"[harness] '{function_name}' is a write/unsupported tool and "
                    "is blocked in read-only test mode. Continue advising using the "
                    "data you already read; do not attempt to persist changes."
                ),
            }
        return await original(user_id, function_name, args)

    orch._execute_tool = guarded


async def run_prompt(orch: AgentOrchestrator, prompt: str, current) -> dict:
    """Run one prompt fresh (no history) and record the event trace."""
    tool_calls = []
    current[0] = tool_calls

    events = []            # ordered ("token" | "tool_start" | ...) for sequencing
    first_token_time = None
    first_tool_time = None
    answer_parts = []
    start = time.time()

    user_context = {"user_id": USER_ID}

    async for ev in orch.process_request_streaming(prompt, user_context):
        etype = ev.get("type")
        now = time.time() - start
        if etype == "token":
            if first_token_time is None:
                first_token_time = now
            events.append("token")
            answer_parts.append(ev.get("content", ""))
        elif etype == "tool_start":
            if first_tool_time is None:
                first_tool_time = now
            events.append(f"tool:{ev.get('tool')}")
        elif etype == "tool_complete":
            pass
        elif etype == "complete":
            answer_parts = [ev.get("full_response", "".join(answer_parts))]
        elif etype == "error":
            events.append(f"error:{ev.get('message')}")

    elapsed = time.time() - start

    # Did the model emit prose BEFORE calling any tool? (the reported symptom)
    answered_before_checking = False
    for e in events:
        if e == "token":
            answered_before_checking = True
            break
        if e.startswith("tool:"):
            break

    grounded = any(t in GROUNDING_TOOLS for t in tool_calls)

    answer = "".join(answer_parts).strip()
    answer_lines = answer.splitlines()
    words = len(answer.split())
    bullets = sum(1 for ln in answer_lines if ln.lstrip()[:1] in {"-", "*", "•"})
    headers = sum(1 for ln in answer_lines if ln.lstrip().startswith("#"))
    # Conversational = ends by inviting a reply / asking something, and not a wall of text.
    asks_question = "?" in answer[-400:]

    lower = answer.lower()
    punted = bool(PUNT_RE.search(answer))
    named_real_exercises = [e for e in REAL_PLAN_EXERCISES if e in lower]
    # User outcome: got a grounded, specific answer without being asked to do
    # the system's job. This is the metric that matters.
    solved = grounded and not punted

    return {
        "punted": punted,
        "named_real_exercises": named_real_exercises,
        "solved": solved,
        "prompt": prompt,
        "tools_called": tool_calls,
        "grounded": grounded,
        "answered_before_checking": answered_before_checking,
        "any_tool_called": len(tool_calls) > 0,
        "first_token_s": round(first_token_time, 2) if first_token_time is not None else None,
        "first_tool_s": round(first_tool_time, 2) if first_tool_time is not None else None,
        "elapsed_s": round(elapsed, 2),
        "words": words,
        "bullets": bullets,
        "headers": headers,
        "asks_question": asks_question,
        "answer": answer,
    }


def render_md(label: str, model: str, results: list) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    grounded_n = sum(1 for r in results if r["grounded"])
    answered_first_n = sum(1 for r in results if r["answered_before_checking"])
    no_tool_n = sum(1 for r in results if not r["any_tool_called"])
    n = len(results)
    avg_words = round(sum(r["words"] for r in results) / n) if n else 0
    asks_n = sum(1 for r in results if r["asks_question"])

    lines = []
    lines.append(f"\n\n## Run: `{label}`  ({ts})")
    lines.append(f"- Model: **{model}**")
    lines.append(f"- Grounded in user data (called a plan/calendar tool): **{grounded_n}/{n}**")
    lines.append(f"- Answered with prose BEFORE checking any tool: **{answered_first_n}/{n}**  _(the reported bug — lower is better)_")
    lines.append(f"- Called NO tool at all: **{no_tool_n}/{n}**")
    lines.append(f"- Avg answer length: **{avg_words} words**  _(conversational target: short — lower is better)_")
    lines.append(f"- Ends by asking the user something: **{asks_n}/{n}**")
    solved_n = sum(1 for r in results if r["solved"])
    punted_n = sum(1 for r in results if r["punted"])
    lines.append(f"- **SOLVED as a user would judge it (grounded + didn't punt): {solved_n}/{n}**")
    lines.append(f"- Punted back to the user ('paste your plan'): **{punted_n}/{n}**  _(instant fail)_")
    lines.append("")
    lines.append("| # | solved | grounded | punted | real exercises named | words | bullets | tools called | total (s) |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(results, 1):
        tools = ", ".join(r["tools_called"]) or "—"
        named = ", ".join(r["named_real_exercises"][:4]) or "—"
        lines.append(
            f"| {i} | {'✅' if r['solved'] else '❌'} | {'✅' if r['grounded'] else '❌'} | "
            f"{'⚠️ yes' if r['punted'] else 'no'} | {named} | "
            f"{r['words']} | {r['bullets']} | {tools} | {r['elapsed_s']} |"
        )
    lines.append("")
    for i, r in enumerate(results, 1):
        lines.append(f"<details><summary>Prompt {i} — answer</summary>\n")
        lines.append(f"**Q:** {r['prompt']}\n")
        lines.append(f"**Tools:** {r['tools_called']}\n")
        lines.append(f"**A:**\n\n{r['answer']}\n")
        lines.append("</details>\n")
    return "\n".join(lines)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="run", help="label for this A/B run")
    args = parser.parse_args()

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_database]

    print(f"[harness] DB={settings.mongodb_database}  model={settings.openai_model}  label={args.label}")
    orch = AgentOrchestrator(db)
    current = [None]
    install_readonly_guard(orch, current)

    results = []
    for p in PROMPTS:
        print(f"\n[harness] >>> {p[:70]}...")
        r = await run_prompt(orch, p, current)
        results.append(r)
        print(f"    grounded={r['grounded']}  answered_before_checking={r['answered_before_checking']}  "
              f"tools={r['tools_called']}  elapsed={r['elapsed_s']}s")

    md = render_md(args.label, settings.openai_model, results)
    with open("AB_TEST.md", "a") as f:
        f.write(md)
    print("\n[harness] appended results to AB_TEST.md")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
