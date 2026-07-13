---
name: fix-ticket
description: Implement a Claude-ready Linear ticket end-to-end - branch, code, verify, open a PR, move the ticket to In Review. Usage - /fix-ticket TOR-nn. Never merges. Use when asked to fix, implement, or tackle a Linear ticket.
allowed-tools:
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__save_issue
  - mcp__claude_ai_Linear__save_comment
---

# Fix a Linear ticket

Input: a ticket identifier in `$ARGUMENTS` (e.g. `TOR-12`). If missing, ask for one.

## 0 — Gate

`get_issue` the ticket (load Linear MCP tools via ToolSearch if needed) and check:

- Labeled **`needs-human`**, or missing **Acceptance criteria** / **Code pointers**
  sections → do NOT implement. `save_comment` on the ticket explaining exactly what is
  missing or which product decision is needed, tell the user, and stop.
- Status is In Progress / In Review with an existing open PR attached → stop and report
  (someone/something is already on it).

## 1 — Start

1. Make sure the working tree is clean and based on latest `main` (`git fetch origin && git status`). If dirty, stop and report.
2. Branch: use the ticket's `gitBranchName` from `get_issue` (e.g. `segevelior/tor-12-...`): `git checkout -b <gitBranchName> origin/main`.
3. `save_issue` → status **In Progress**, assignee `me`.

## 2 — Implement

- Follow the ticket's **Code pointers** and satisfy every **Acceptance criteria** checkbox.
- Match surrounding code style; smallest change that meets the criteria.
- If the ticket turns out to be materially wrong (pointers stale, criteria impossible),
  stop, `save_comment` what you found, move status back to **Todo** with label
  `needs-human`, and report — do not improvise a different scope.

## 3 — Verify

- Run the repo's relevant checks (frontend: `npm run build --prefix frontend`; backend: `npm test --prefix backend` if tests exist for the area). Lint gate: the repo has pre-existing lint errors, so the bar is **no new lint findings** on changed files (diff against `origin/main`), not a clean run.
- Exercise the changed flow itself where feasible (the project `/verify` flow, or a targeted manual check) — not just the build.
- Record what you ran and the results; they go in the PR body.

## 4 — Ship (PR only — NEVER merge)

1. Commit with a message referencing the ticket (`TOR-nn: <summary>`).
2. Push the branch and open a PR with `gh pr create`:
   - Title: `TOR-nn: <ticket title>`
   - Body: what changed, how it was verified (actual commands + results), link to the Linear ticket, and each acceptance criterion checked off.
3. On the ticket: `save_issue` → status **In Review** with `links` to the PR URL; `save_comment` a one-paragraph summary.
4. **Do not merge. Do not enable auto-merge.** Merging is the human's checkpoint.

## Report

End with: ticket → branch → PR URL → verification results → anything left open.
