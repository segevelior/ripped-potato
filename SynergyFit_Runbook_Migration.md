
# SynergyFit — Runbook for Local Run, Render Deployment, and Future Refactors

> **Goal:** Get the exported Base44 app running locally and on Render under our own Git repository **as-is**, then document next steps to decouple from Base44 (own backend & DB) and **migrate the AI agent to Python/LangGraph**.

---

## 1) Snapshot (What we have)

- **Stack:** Vite + React SPA
- **SDK:** `@base44/sdk` configured in `src/api/base44Client.js` with `requiresAuth: true`
- **Entities used:** Exercise, Workout, ExternalActivity, WorkoutTemplate, Discipline, WorkoutType, TrainingPlan, PredefinedWorkout, Goal, ProgressionPath, UserGoalProgress, Plan, UserTrainingPattern
- **Auth:** `base44.auth` via SDK (browser-based)  
- **LLM usage:** `base44.integrations.Core.InvokeLLM` (assistant UI can be deferred initially)
- **Aliases:** `@` → `./src` (`vite.config.js`, `jsconfig.json`)
- **Lockfile:** none (decide on npm/yarn/pnpm; use npm for now)

---

## 2) Phase 0 — Make it Run Locally (minimal changes)

### 2.1 Prerequisites
- **Node.js:** 20 LTS (18 may work but 20 is recommended with Vite 6)
- **Git clone** of the exported repo

### 2.2 Commands
```bash
# in project root
npm install
npm run dev
# open the printed URL (typically http://localhost:5173)
```

### 2.3 Base44 Allowed Origins (critical for auth)
Add to your Base44 project's **Allowed Origins / Redirect URIs**:
- `http://localhost:5173`
- `http://127.0.0.1:5173`

### 2.4 Smoke Test
- App loads without build errors
- Authentication flow works (SDK login)  
- Basic pages render (Dashboard, Calendar, Exercises, etc.)
- If the **AI assistant** panel errors, temporarily ignore or hide it (LLM integration can be configured later)

### 2.5 Troubleshooting
- **Auth/CORS issues:** verify Allowed Origins (above) and the `appId` in `src/api/base44Client.js`
- **RLS/permissions:** sign in with a user who has read/write access to required entities; relax RLS for testing if needed
- **Networking:** check browser Network tab for failing requests to Base44 endpoints; confirm you are logged in

---

## 3) Phase 1 — Render Deployment (as-is)

We have two paths. **Start with A** (simplest) and use **B** when we need server-side secrets.

### 3.1 Option A — Render Static Site (no secrets)
- **Build command:** `npm ci || npm install && npm run build`
- **Publish directory:** `dist`
- **Environment:** no `VITE_*` required right now (app doesn’t use client envs)
- **Base44 Allowed Origins:** add your Render site URL (and any custom domain) to Base44 project settings

**Pros:** simplest, fast.  
**Cons:** any future API keys added to the frontend would be public; for keys, switch to Option B.

### 3.2 Option B — Render Web Service with a Tiny Proxy (for secrets)
Add a minimalist proxy (Node or Python) to hold secrets server-side (e.g., AI keys), and serve the SPA.

**Node/Express skeleton (example):**
```js
// server.js
import express from 'express';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

// Static SPA
app.use(express.static(path.join(__dirname, 'dist')));

// Example AI proxy (POST /api/ai)
app.use(express.json());
app.post('/api/ai', async (req, res) => {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'proxy_error', detail: String(e) });
  }
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Running on :${PORT}`));
```

**Render settings (Web Service):**
- **Build:** `npm ci && npm run build`
- **Start:** `node server.js`
- **Env vars (Render → Environment):** `OPENAI_API_KEY` (and any others)
- **Health:** open root URL; proxy endpoint at `/api/ai`

> Keep secrets out of `VITE_*`. Frontend calls `/api/ai` which holds the server key.

---

## 4) Phase 2 — Stabilize & Document

### 4.1 Choose a package manager and lock it
- Decide on **npm** (default) and commit the generated `package-lock.json` for reproducible builds.

### 4.2 Add runbook artifacts to repo
- `README_RUNBOOK.md` (this file)
- `.env.example` (only non-secret placeholders, if needed)
- Basic **CI** (optional): build on PR to ensure Vite builds cleanly

### 4.3 Observability
- Enable browser error logging capture (Sentry/Console collection) if needed
- Add a simple uptime check (e.g., Render health check or external ping)

---

## 5) Phase 3 — Future Refactors (own backend & DB, decoupling from Base44)

> Only start once “as-is” deployment is stable.

### 5.1 Backend introduction (minimal API facade)
- Start a small backend (Node/Fastify or Python/FastAPI) that **mimics** the subset of Base44 endpoints used by the SPA
- Gradually move calls in the SPA from `@base44/sdk` to your backend endpoints
- Keep identical DTOs to minimize UI churn

### 5.2 Database
- Create schema for your entities (Exercise, Workout, Goal, etc.)
- Pick a managed DB (e.g., Postgres) and deploy on Render
- Implement RLS-like constraints in-app (or DB policies) to maintain the current security model
- Provide a minimal data seeding script and a migration plan (export from Base44 → CSV/JSON → import)

### 5.3 Auth
- Replace `base44.auth` with your own solution (e.g., Auth0, Clerk, or a custom JWT auth)
- Provide `/auth/login` and `/auth/logout`; store tokens in **httpOnly** cookies
- Ensure SPA uses the new auth state when calling your backend

### 5.4 Gradual cutover
- Feature-flag endpoints and flip sections of the UI to the new backend one by one
- Maintain a rollback plan (switch SDK calls back if needed)

---

## 6) Phase 4 — AI Agent migration to Python/LangGraph

### 6.1 Architecture
- Spin up a **Python (FastAPI) microservice**: `/v1/agent/*`
- Implement LangGraph for stateful tools and control flow
- Keep the SPA unchanged; it calls `/api/ai` which forwards to the Python agent

**FastAPI skeleton (example):**
```python
# app.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import httpx

app = FastAPI()

class ChatRequest(BaseModel):
    messages: list

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

@app.post("/v1/agent/chat")
async def agent_chat(req: ChatRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(500, "Missing OPENAI_API_KEY")
    # placeholder: call OpenAI or your LangGraph pipeline here
    return {"reply": "Hello from agent", "echo": req.messages}
```

**Render settings (Web Service, Python):**
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
- **Env vars:** `OPENAI_API_KEY`, etc.

### 6.2 SPA wiring
- If using Option B proxy, point `/api/ai` → Python agent `/v1/agent/chat`
- Keep request/response JSON identical to simplify the UI integration

### 6.3 Observability and guardrails
- Add structured logging (request ID, user ID, latency)
- Rate-limit `/v1/agent/*`
- Add retries and failure fallbacks on the proxy

---

## 7) Rollback & Recovery

- **Local:** revert to previous commit; `npm run dev` sanity check
- **Render Static Site:** redeploy previous successful build from Render’s deploys list
- **Render Web Service:** redeploy prior image; restore env vars if changed

---

## 8) Open Questions / TODOs

- Confirm Base44 **Allowed Origins** for local and Render domains
- Confirm which features **must** be functional on Day 1 (AI assistant optional?)
- Inventory any additional integrations (email, storage, OAuth)
- Decide on the backend language for proxy and future services (Node vs Python)
- Lock package manager and commit lockfile

---

## 9) Appendix — Commands & Files

**Local**
```bash
npm install
npm run dev
```

**Build (anywhere)**
```bash
npm run build
```

**Render Static Site**
- Build: `npm ci || npm install && npm run build`
- Publish: `dist`

**Render Web Service (Node proxy)**
- Build: `npm ci && npm run build`
- Start: `node server.js`
- Env: `OPENAI_API_KEY=***` (Render → Environment)

**Key files**
- `src/api/base44Client.js` — Base44 SDK client
- `src/api/entities.js` — exported entities (`base44.entities.*`)
- `src/api/integrations.js` — `base44.integrations.Core` (LLM, email, etc.)
- `vite.config.js` / `jsconfig.json` — path alias and dev server config

---

### Template reference (user-provided)

# [Project Name] Implementation Guide & Memory
# Last Updated: [DATE]
# Status: [Current Phase/Milestone]

## PROJECT OVERVIEW

**Goal**: [Main objective in one sentence]

**Tech Stack**: [Core technologies]

**Architecture**: [High-level approach - microservices, monolith, etc.]

## IMPLEMENTATION STATUS

### ✅ COMPLETED COMPONENTS

#### [Major Component 1]
- [x] **[Sub-component]** - [Brief description]
  - [Key feature or metric]
  - [Performance benchmark]
  - [Important implementation detail]

#### [Major Component 2]  
- [x] **[Sub-component]** - [Brief description]
  - [Key achievement]
  - [Integration point]

### 🔄 PARTIALLY IMPLEMENTED

#### [Component Name]
- [x] [What's done]
- [ ] **MISSING**: [Critical gap]
- [ ] **MISSING**: [Another gap]

### ❌ CRITICAL MISSING COMPONENTS

#### [High Priority Missing Piece]
```
# NEEDED: path/to/files
- component1.py ([purpose])
- component2.py ([purpose])
```

## CRITICAL DECISIONS & CROSSROADS

### ✅ Decision 1: [Decision Name] ([Date])
**Context**: [Why this decision was needed]

**Options Considered**:
1. **[Option A]**: Pros: [benefits]. Cons: [drawbacks]
2. **[Option B]**: Pros: [benefits]. Cons: [drawbacks]  
3. **[Option C]**: Pros: [benefits]. Cons: [drawbacks]

**Choice**: [What we chose and why]

**Results**: [Outcome/metrics if available]

### 🔄 CURRENT CROSSROADS: [Current Decision Point] ([Date])

**Context**: [Current situation requiring decision]

**Option A: [Approach Name]**
- **Pros**: [Benefits]
- **Cons**: [Drawbacks]
- **Timeline**: [Estimated effort]
- **Risk**: [Risk level and main concerns]

**Option B: [Alternative Approach]**
- **Pros**: [Benefits]
- **Cons**: [Drawbacks]
- **Timeline**: [Estimated effort]  
- **Risk**: [Risk level and main concerns]

**Recommendation**: [Current thinking and rationale]

## DEBUGGING PLAYBOOK

### Common Issues & Solutions

#### Issue 1: [Problem Description]
**Symptoms**: [How to recognize this issue]
**Investigation Steps**:
```bash
# [Command to check X]
# [Command to verify Y]
```
**Root Causes**: 
- [Most common cause] ([frequency]% of cases)
- [Second cause] ([frequency]% of cases)

#### Issue 2: [Another Common Problem]
**Symptoms**: [Recognition pattern]
**Quick Fix**: [Immediate solution]
**Long-term Fix**: [Proper resolution]

### Performance Benchmarks
```
[Key Metric 1]: [Target/Current value]
[Key Metric 2]: [Target/Current value]
[Key Metric 3]: [Target/Current value]
```

## IMMEDIATE PRIORITIES

### This Week: [Current Focus]
- [ ] **[High Priority Task]**
  - [Specific action item]
  - **Goal**: [Success criteria]

### Next 1-2 Weeks: [Near-term Focus]
- [ ] **[Important Task]**
  - [Implementation approach]
  - **Decision Point**: [Key choice to make]

## MEDIUM-TERM ROADMAP (1-2 months)

### 1. [Major Initiative]
- [ ] [Component A]
- [ ] [Component B]
- [ ] [Component C]

### 2. [Another Initiative]
- [ ] [Feature X]
- [ ] [Integration Y]

## TECHNICAL DEBT & IMPROVEMENTS

### High Priority
- [ ] **[Critical Issue]**: [Description and impact]
- [ ] **[Important Refactor]**: [Reason and scope]

### Medium Priority  
- [ ] **[Code Quality Issue]**: [Description]
- [ ] **[Performance Improvement]**: [Expected benefit]

### Low Priority
- [ ] **[Nice to Have]**: [Minor improvement]

## INTEGRATION POINTS

### Internal Dependencies
- **[Service/Component A]**: [How it connects and data flow]
- **[Service/Component B]**: [Integration pattern]

### External Dependencies
- **[External Service]**: [Purpose and current status]
- **[Third-party API]**: [Usage and limitations]

## TEAM KNOWLEDGE

### Current Expertise
- **[Team Member]**: [Key skills and ownership areas]
- **[Team Member]**: [Key skills and ownership areas]

### Knowledge Gaps
- **[Skill/Technology]**: [Current gap and plan to address]

## NEXT SESSION FOCUS

1. **Immediate**: [What to tackle right now]
2. **This Week**: [Key milestone to hit]
3. **Blocker**: [What's preventing progress]

## USEFUL COMMANDS

```bash
# [Purpose]
[command]

# [Another purpose]  
[command]

# [Development workflow]
[command]
```

## LESSONS LEARNED

### What Worked Well
1. **[Success Pattern]**: [Why it worked]
2. **[Good Decision]**: [Positive outcome]

### What We'd Do Differently
1. **[Improvement Area]**: [What we learned]
2. **[Process Issue]**: [Better approach]

### Key Insights
1. **[Important Learning]**: [Why this matters]
2. **[Technical Insight]**: [Implication for future work]

---
*This file is the project brain. Update it when making decisions or encountering issues. Future developers (including AI assistants) will need this context.*