# Scope estimation signals → points

Estimate from the *investigated* code, not the feedback text. Scale: 1 / 2 / 3 / 5 / 8.

| Points | Meaning | Typical signals |
|---|---|---|
| 1 | Trivial | One file, cosmetic/copy/CSS, no logic change, no tests needed |
| 2 | Small | 1–2 files, isolated logic, existing test file to extend |
| 3 | Half-day | Several files in one layer (frontend-only or backend-only), new component or endpoint tweak, manual verification needed |
| 5 | Multi-day | Crosses layers (frontend + backend), state/data-shape changes, migration of existing documents, or touchy shared code (auth, AI-coach routing) |
| 8 | Too big | Needs design or a product decision, multiple features entangled — **split it** or label `needs-human` |

Modifiers (bump one level if any apply):
- Touches MongoDB schema or requires backfill/migration of existing documents.
- Requires a deploy-time change (render.yaml, env vars) beyond code.
- Touches the AI-coach prompt/tool-routing layer (`ai-coach-service/`) — behavior is
  probabilistic, verification is slower.
- No existing test coverage in the area AND the change is behavioral.

Repo layout reminders:
- `frontend/` — React (Vite). Pages in `frontend/src/pages/`, shared UI in `frontend/src/components/`.
- `backend/` — Express API (`backend/src/routes/`, `backend/src/services/`, Mongoose models in `backend/src/models/`).
- `ai-coach-service/` — the Sensei AI coach service.
- Deploy config: `render.yaml` (Render.com).
