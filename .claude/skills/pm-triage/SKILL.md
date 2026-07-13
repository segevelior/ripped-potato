---
name: pm-triage
description: PM triage of the Linear "Feedback Inbox" — classify un-done feedback as bug / feature request / undefined behavior, investigate the codebase, file structured Claude-ready work tickets into the matching Linear project, estimate scope, and mark the feedback issue Done. Use when asked to triage feedback, process the feedback queue, or act as PM on Linear feedback.
allowed-tools:
  - mcp__claude_ai_Linear__list_issues
  - mcp__claude_ai_Linear__get_issue
  - mcp__claude_ai_Linear__save_issue
  - mcp__claude_ai_Linear__save_comment
  - mcp__claude_ai_Linear__list_issue_labels
  - mcp__claude_ai_Linear__list_projects
  - Read
  - Grep
  - Glob
---

# PM Triage — Feedback Inbox → work tickets

You are acting as the product manager for this repo (Torii / SynergyFit fitness app).
Process every un-triaged feedback issue and turn it into implementable work tickets.

## Linear layout (team: Torii, id `9f100643-967e-4250-b034-e64bf8ec102f`)

| Project | Purpose |
|---|---|
| **Feedback Inbox** | Raw feedback (created by backend). **Done = triaged.** |
| **Bugs** | Behavior contradicts intended behavior |
| **Feature Requests** | New capability / enhancement |
| **Undefined Behavior** | Works as coded, but correct behavior was never defined — needs a product decision |

Statuses: Backlog / Todo / In Progress / In Review / Done / Canceled / Duplicate.
Readiness labels: `claude-ready` (implementable as-is), `needs-human` (can't be fully scoped).

If the Linear MCP tools are not loaded, load them with ToolSearch first. If the Linear
connector is entirely unavailable, stop and report that — do not improvise another channel.

## Progress checklist (copy and track)

```
Triage progress:
- [ ] 1. Fetch un-done feedback from Feedback Inbox
- [ ] 2. Dedup against existing open work tickets
- [ ] 3. Classify each item (one item may yield several tickets)
- [ ] 4. Investigate repo per item (code pointers)
- [ ] 5. File work tickets (template + estimate + labels)
- [ ] 6. Comment links on feedback issue, mark it Done
- [ ] 7. Report summary table
```

## Step 1 — Fetch

`list_issues` with `project="Feedback Inbox"`, then keep issues whose status is
**not** Done, Canceled, or Duplicate. For each, `get_issue` for the full description
(list output truncates). Feedback bodies contain: rating, category, page, submitter,
user agent, then free text after a `---` divider.

## Step 2 — Dedup

`list_issues` for the three output projects (open statuses). If a feedback item is
already covered by an existing ticket: comment the link on the feedback issue and set
its status to **Duplicate** with `duplicateOf` pointing at the existing ticket. No new ticket.

## Step 3 — Classify

For each distinct problem inside a feedback item (a single feedback often lists several):

- **Bug** → project *Bugs*: observed behavior contradicts what the code/product clearly intends.
- **Feature request** → project *Feature Requests*: asks for something that doesn't exist.
- **Undefined behavior** → project *Undefined Behavior*: the app does what the code says,
  but nobody ever decided what *should* happen. These tickets MUST have an
  "Open questions" section and the `needs-human` label.

When unsure between bug and undefined behavior, check the code (Step 4) — if you can point
at a clear defect, it's a bug.

## Step 4 — Investigate the repo

For every prospective ticket, find concrete code pointers before filing it:
Grep/Glob the relevant area (`frontend/src/` for UI, `backend/src/` for API,
`ai-coach-service/` for the AI coach) and read enough to name the responsible
files/components/endpoints. Do not guess paths — verify they exist.

**Batching rule:** with ≤4 feedback items, investigate inline. With 5+, spawn one
`ticket-investigator` subagent per item (they are read-only and return classification +
code pointers + scope signals), then file all tickets yourself from their summaries.

## Step 5 — File work tickets

For each ticket, `save_issue` (create) with:
- `team`: Torii, `project`: per classification, `state`: Todo
- `title`: imperative and specific ("Fix dashboard content unreachable below Progression on mobile"), no `[Feedback]` prefix
- `description`: follow [TICKET-TEMPLATE.md](TICKET-TEMPLATE.md) exactly
- `labels`: one type label (`Bug` / `Feature Request` / `UI/UX` / `Performance` / …) **plus** `claude-ready` or `needs-human`
- `estimate`: points per [COMPLEXITY.md](COMPLEXITY.md) (1/2/3/5/8). If estimates are not
  enabled on the team yet, the save may drop the field — still record the points in the
  "Scope estimate" section of the description.
- `relatedTo`: the source feedback issue id
- `priority`: 2 (High) for broken core flows, 3 (Medium) default, 4 (Low) for polish

## Step 6 — Close the loop

On the source feedback issue:
1. `save_comment` listing the created tickets (identifiers + one-liners) and any parts you deliberately did NOT ticket (with reason).
2. `save_issue` → status **Done**.

Only mark Done after its tickets exist. Never edit the feedback description.

## Step 7 — Report

End with a markdown table: feedback issue → created tickets (id, project, estimate, readiness label), plus anything skipped and why.

## Rules

- Never merge anything; never change code in this skill — triage only.
- Never delete or archive issues.
- One ticket = one independently shippable change. Split aggressively.
- Write tickets so a fresh Claude Code session can implement them from the body alone
  (that is the `claude-ready` bar; when in doubt, label `needs-human`).
