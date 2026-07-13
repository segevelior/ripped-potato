---
name: fix-ticket
description: Claim and implement a Claude-ready Linear ticket end-to-end - claim it (In Progress) first thing, then branch, code, verify, open a PR, move the ticket to In Review. Usage - /fix-ticket TOR-nn, or /fix-ticket with no args to pick the next free ticket. Never merges. Use when asked to fix, implement, or tackle a Linear ticket, or to check what is free to work on.
allowed-tools:
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__list_issues
  - mcp__claude_ai_Linear__save_issue
  - mcp__claude_ai_Linear__save_comment
---

# Fix a Linear ticket

Input: a ticket identifier in `$ARGUMENTS` (e.g. `TOR-12`), or nothing → pick the next
free ticket yourself (see "Picking a free ticket").

**Concurrency contract (multiple Claude Code sessions run in parallel and cannot see
each other — the Linear status IS the lock):**

- **Free to work on** = status **Backlog** or **Todo** AND no assignee.
- **In Progress / In Review / Done** = owned by someone else. Never touch, never "help".
- **Claim before you think.** The very first mutation — before reading code, planning,
  or branching — is `save_issue` → status **In Progress** + assignee `me`. Only then
  start working.
- If you stop for any reason before opening a PR (gate fail, stale ticket, error),
  **release the claim**: status back to **Todo**, remove yourself as assignee,
  `save_comment` why. Never leave a ticket In Progress that nobody is working on.

## Picking a free ticket (no-args mode)

`list_issues` for projects **Bugs** and **Feature Requests** (team Torii); keep only
free tickets (rule above) labeled `claude-ready` and not blocked. Pick by highest
priority, then lowest estimate. If none, report "nothing free to work on" and stop.
Then continue below with the picked ticket.

## 0 — Claim (FIRST, before anything else)

1. `get_issue` the ticket (load Linear MCP tools via ToolSearch if needed).
2. If it is not free (rule above) → stop and report who/what owns it. Do not comment.
3. Immediately `save_issue` → status **In Progress**, assignee `me`.
4. Re-`get_issue` and confirm you are the assignee. If someone else appears, you lost
   the race — back off silently and report.

## 1 — Gate (after claiming)

- Labeled **`needs-human`**, or missing **Acceptance criteria** / **Code pointers**
  sections → do NOT implement. `save_comment` explaining exactly what is missing or
  which product decision is needed, **release the claim**, and stop.

## 2 — Start

1. Make sure the working tree is clean and based on latest `main` (`git fetch origin && git status`). If dirty, release the claim, stop and report.
2. Branch: use the ticket's `gitBranchName` from `get_issue` (e.g. `segevelior/tor-12-...`): `git checkout -b <gitBranchName> origin/main`.

## 3 — Implement

- Follow the ticket's **Code pointers** and satisfy every **Acceptance criteria** checkbox.
- Match surrounding code style; smallest change that meets the criteria.
- If the ticket turns out to be materially wrong (pointers stale, criteria impossible),
  stop, `save_comment` what you found, add label `needs-human`, **release the claim**,
  and report — do not improvise a different scope.

## 4 — Verify

- Run the repo's relevant checks (frontend: `npm run build --prefix frontend`; backend: `npm test --prefix backend` if tests exist for the area). Lint gate: the repo has pre-existing lint errors, so the bar is **no new lint findings** on changed files (diff against `origin/main`), not a clean run.
- Exercise the changed flow itself where feasible (the project `/verify` flow, or a targeted manual check) — not just the build.
- Record what you ran and the results; they go in the PR body.

## 5 — Ship (PR only — NEVER merge)

1. Commit with a message referencing the ticket (`TOR-nn: <summary>`).
2. Push the branch and open a PR with `gh pr create`:
   - Title: `TOR-nn: <ticket title>`
   - Body: what changed, how it was verified (actual commands + results), link to the Linear ticket, and each acceptance criterion checked off.
3. **Immediately after the PR exists:** `save_issue` → status **In Review** with `links`
   to the PR URL; `save_comment` a one-paragraph summary. (In Review + PR link is how
   other sessions know this ticket is done-pending-merge.)
4. **Do not merge. Do not enable auto-merge.** Merging is the human's checkpoint.

## Report

End with: ticket → branch → PR URL → verification results → anything left open.
