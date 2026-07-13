---
name: pr-review
description: Review a GitHub PR of this repo for security issues, user-data leakage, and potential bugs; post the findings as a PR review. Usage - /pr-review <PR number or URL>. Never merges or approves-with-merge. Use when asked to review a PR for security or data leakage.
allowed-tools:
  - Bash(gh pr view *)
  - Bash(gh pr diff *)
  - Bash(gh pr review *)
  - Bash(gh pr comment *)
  - Read
  - Grep
  - Glob
---

# PR review — security, user-data leakage, bugs

Input: PR number or URL in `$ARGUMENTS`. If missing, ask.

## Process

1. `gh pr view <n>` and `gh pr diff <n>` — read the full diff. Read the surrounding
   code of every changed hunk (Read/Grep the repo at the PR's context), not just the diff.
2. Check every changed line against the three lenses below.
3. **Verify before reporting:** for each candidate finding, re-read the code and try to
   refute it (is it actually reachable? already handled upstream?). Report only findings
   that survive, each with file:line, a concrete failure scenario, and a suggested fix.
4. Post via `gh pr review <n>` — `--request-changes` if any High finding, else `--comment`.
   Structure: **High / Medium / Low** sections, then a short "checked and clean" list of
   what you looked at. If nothing found, post a comment saying what was checked.
5. **Never merge, never approve** (`--approve` is forbidden — merging is the human's call).

## Lens 1 — Security

- Injection: unsanitized input into MongoDB queries (`$where`, operator injection via
  `req.query`/`req.body` objects), `eval`/`new Function`, shell commands, path traversal.
- AuthN/AuthZ: new endpoints must use the existing auth middleware; object-level checks
  (`userId` scoping on every Mongoose query — a query without a user scope on user data
  is a finding). Admin routes gated by `ADMIN_API_KEY`.
- Secrets: keys/tokens hard-coded, committed `.env`, secrets in client-side (`frontend/`,
  `VITE_*`) code, secrets in render.yaml with values instead of `sync: false`.
- SSRF/unsafe fetch of user-supplied URLs; missing rate limiting on new
  unauthenticated endpoints (pattern: `express-rate-limit` as in `backend/src/routes/feedback.js`).

## Lens 2 — User-data leakage (this app holds fitness/health data — treat as sensitive)

- PII (email, name, tokens) in `console.log`/error logs or error responses. Known repo
  precedent: the Linear feedback failure log intentionally includes submitter email —
  new logging must not casually copy that pattern.
- API responses returning whole Mongoose documents where a projection should strip
  fields (password hashes, OAuth/Strava tokens, other users' data).
- Data sent to third parties (Linear, OpenAI/Anthropic, Strava): only what is needed;
  flag new fields added to outbound payloads.
- Cross-user access: any endpoint/aggregate where one user could read another's
  workouts, memories (`usermemories`), or coach context.
- Frontend: sensitive data in localStorage, URLs/query params, or analytics events.

## Lens 3 — Potential bugs

- Unhandled promise rejections in fire-and-forget async paths (repo has this pattern —
  feedback→Linear is deliberately fire-and-forget; new code must `.catch`).
- Off-by-one / boundary conditions, `==` vs `===`, mutation of shared state (module-level caches).
- Missing input validation on new route params/body; NaN/undefined flowing into Mongoose queries.
- React: hooks deps, state updates after unmount, render loops (repo precedent: chat
  component re-mount loop), missing keys on lists.
- Breaking changes to response shapes consumed by `frontend/` or the MCP connector.

## Rules

- Findings must be concrete (file:line + failure scenario). No style nits, no vague
  "consider…" advice — this review is for blocking real problems.
- Do not push commits to the PR branch; review only.
