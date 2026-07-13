# Claude-ready ticket template

Every ticket description created by `/pm-triage` uses exactly these sections, in this
order. Omit a section only where marked optional. Use real newlines, GitHub-flavored
markdown, and repo-relative file paths.

```markdown
## Source
[TOR-nn](https://linear.app/torii-fitness/issue/TOR-nn) — reported by <name>, page `<page>`, <date>.

## Problem / Request
One paragraph in product terms: what the user experiences / wants, and why it matters.

## Reproduction / Current behavior
_(bugs & undefined behavior; omit for pure feature requests)_
1. Step-by-step repro.
2. **Expected:** …
3. **Actual:** …
Include viewport/device if relevant (feedback includes the user agent).

## Code pointers
- `frontend/src/pages/Dashboard.jsx` — <why this file is implicated>
- `backend/src/routes/feedback.js:27-60` — <…>
Verified paths only (found via investigation, not guessed). Name relevant endpoints,
components, and MongoDB collections.

## Acceptance criteria
- [ ] Verifiable outcome 1 (phrase it so a reviewer can check it)
- [ ] Verifiable outcome 2
- [ ] No regression in <adjacent flow>

## Scope estimate
**N points** — one line of reasoning: files touched, schema/deploy implications,
test surface. (1=trivial, 2=small, 3=half-day, 5=multi-day, 8=needs design/split.)

## Open questions
_(mandatory for Undefined Behavior tickets; omit elsewhere if empty)_
- Product decision needed: …
```

Title style: imperative, specific, ≤80 chars. Good: "Cap feedback textarea at 1000 chars
to match backend truncation". Bad: "Feedback issues".
