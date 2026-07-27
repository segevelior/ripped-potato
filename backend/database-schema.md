# MongoDB Database Schema Design

This document is **no longer maintained**. Its contents described an early draft of the
SynergyFit data model (pre-`session` rename, with collections and fields that no longer
exist) and had drifted far from the running system.

Where the schema actually lives:

- **`backend/src/models/`** — the Mongoose models are the executable source of truth for
  backend-owned collections: field types, enums, refs, indexes, virtuals and pre-save hooks.
  Read the model, not a doc.
- **Comments inside those models** — cross-service ownership is documented where it bites:
  a comment on the collection or field records which service writes it and what the other
  service must not touch (see `CalendarEvent.js`, `Plan.js`, `UserMemory.js`). Add such a
  comment whenever you introduce a shared collection or field.
- **`backend/scripts/`** — migrations and seeds, including `migrate-workout-to-session.js`
  (the workout → session cutover) and `add-sessiontemplates-validator.js` (the DB-level
  `$jsonSchema` validator on `sessiontemplates`). The scripts show how existing data was
  reshaped, which is often the fastest way to understand a field's history.
- **AI-coach-owned collections have no Mongoose models.** Their names and shapes are
  defined where they are written: `ai-coach-service/app/services/` and
  `ai-coach-service/app/core/agents/services/`.

If you have a local `development/mongodb-collections.md` (collection inventory, TTLs,
write sites per service, single-writer roadmap), that is a personal working document. It
is gitignored and is **not** part of this repository, so nothing here depends on it —
treat it as notes and the models above as the truth.
