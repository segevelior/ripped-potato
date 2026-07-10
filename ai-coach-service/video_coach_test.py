"""
Coach-level video behavior test (real orchestrator, real YouTube/Tavily, prod data).
Evaluates the DECISIONS: does the coach pick video vs text by context, run both in
parallel when useful, exclude rejected videos, and save approved ones?

Write-safe: save_exercise_video's DB write is intercepted (args recorded, no write);
web_search hits real external APIs (no DB writes). Multi-turn convos are threaded via
conversation_history.

Run: .venv/bin/python video_coach_test.py
"""

import asyncio
import json
import re

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import get_settings
from app.core.agents.orchestrator import AgentOrchestrator

USER_ID = "6a50b08cfc7515275d6e0e68"
EMBED_RE = re.compile(r'<video-embed videoid="([^"]+)"')

# Each scenario is a list of user turns; we assert on the LAST turn's behavior.
SCENARIOS = [
    {
        "name": "show-me -> video",
        "turns": ["can you show me how to do toes to bar?"],
        "expect": "a video embed from a trusted channel",
    },
    {
        "name": "what-muscles -> text (no video)",
        "turns": ["what muscles does a romanian deadlift work?"],
        "expect": "a short text answer, NO video embed",
    },
    {
        "name": "show + explain -> may do both",
        "turns": ["how do I do a muscle up? show me a demo and explain the key steps"],
        "expect": "a video embed AND some text explanation",
    },
    {
        "name": "reject -> exclude & re-search",
        "turns": [
            "show me how to do a dragon flag",
            "that video isn't good, show me a different one",
        ],
        "expect": "second search excludes the first id, returns a different video",
    },
    {
        "name": "approve -> save_exercise_video",
        "turns": [
            "show me how to do a pistol squat",
            "that one's perfect, save it for me",
        ],
        "expect": "save_exercise_video called with the shown video id",
    },
]


async def run_scenario(orch, scenario, recorder_holder):
    history = []
    last = {}
    for turn in scenario["turns"]:
        recorder_holder[0] = []  # fresh tool recorder per turn
        answer_parts, embeds = [], []
        async for ev in orch.process_request_streaming(turn, {"user_id": USER_ID}, conversation_history=history):
            if ev["type"] == "token":
                answer_parts.append(ev["content"])
            elif ev["type"] == "complete":
                answer_parts = [ev["full_response"]]
        answer = "".join(answer_parts).strip()
        embeds = EMBED_RE.findall(answer)
        last = {"turn": turn, "answer": answer, "embeds": embeds, "tools": list(recorder_holder[0])}
        history.append({"role": "human", "content": turn})
        history.append({"role": "ai", "content": answer})
    return last


def install_guard(orch, recorder_holder, saved_calls):
    orig = orch._execute_tool

    async def guarded(uid, fn, args):
        recorder_holder[0].append((fn, args))
        if fn == "save_exercise_video":
            saved_calls.append(args)  # record, do NOT write
            return {"success": True, "message": f"[test] would save video for {args.get('exercise_name')}"}
        if fn in ("web_search", "read_url", "research") or fn.startswith(("get_", "list_", "grep_")):
            return await orig(uid, fn, args)
        # block other writes
        return {"success": False, "blocked": True, "message": "[test] write blocked"}

    orch._execute_tool = guarded


async def main():
    s = get_settings()
    client = AsyncIOMotorClient(s.mongodb_url)
    db = client[s.mongodb_database]
    orch = AgentOrchestrator(db)

    recorder_holder = [[]]
    saved_calls = []
    install_guard(orch, recorder_holder, saved_calls)

    for sc in SCENARIOS:
        last = await run_scenario(orch, sc, recorder_holder)
        tool_names = [t[0] for t in last["tools"]]
        video_args = [t[1] for t in last["tools"] if t[0] == "web_search" and t[1].get("search_type") == "video"]
        print(f"\n{'='*70}\nSCENARIO: {sc['name']}")
        print(f"  expect: {sc['expect']}")
        print(f"  final turn: {last['turn']!r}")
        print(f"  tools: {tool_names}")
        if video_args:
            print(f"  video query/exclude_previous: {[(a.get('query'), a.get('exclude_previous')) for a in video_args]}")
        print(f"  embeds returned: {last['embeds']}")
        if saved_calls:
            print(f"  save_exercise_video calls so far: {saved_calls}")
        print(f"  answer: {last['answer'][:400]}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
