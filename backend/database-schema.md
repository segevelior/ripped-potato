# MongoDB Database Schema Design

This document is **no longer maintained**. Its contents described an early draft of the
SynergyFit data model (pre-`session` rename, with collections and fields that no longer
exist) and had drifted far from the running system.

Use these instead:

- **[`development/mongodb-collections.md`](../development/mongodb-collections.md)** — the
  authoritative schema reference: every collection, its fields, indexes, TTLs, relationships,
  write sites per service, and the single-writer ownership roadmap.
- **`backend/src/models/`** — the Mongoose models are the executable source of truth for
  backend-owned collections (field types, enums, refs, indexes, pre-save hooks).
- **`backend/scripts/`** — migration and seed scripts, including
  `migrate-workout-to-session.js` (the workout → session cutover) and
  `add-sessiontemplates-validator.js` (the DB-level `$jsonSchema` validator on
  `sessiontemplates`).

The AI-coach-owned collections have no Mongoose models; their names and shapes are defined
in `ai-coach-service/app/services/` and `ai-coach-service/app/core/agents/services/`.
