# AI Coach Skills

A **skill** is a self-contained tool for the AI coach: its OpenAI function
definition and its async handler live in one file and register themselves.

This replaces the legacy three-step process (schema dict in
`tool_definitions/*.py` + handler method on a service + routing entry in
`orchestrator._execute_tool`). Skills registered here are picked up
automatically — the orchestrator merges them into `get_tools()` and routes
execution to them in `_execute_tool` (registry takes precedence over legacy
tools with the same name).

## How to add a skill (one file)

1. Copy `example_skill.py` to `your_skill.py`.
2. Set `name`, `description`, and a JSON-Schema `parameters` object in the
   `@skill(...)` decorator.
3. Implement the async handler:

   ```python
   from app.core.agents.skills.registry import SkillContext, skill

   @skill(
       name="my_skill",
       description="What it does and when to use it.",
       parameters={
           "type": "object",
           "properties": {"foo": {"type": "string"}},
           "required": ["foo"],
       },
   )
   async def my_skill(ctx: SkillContext, user_id: str, args: dict) -> dict:
       # ctx.db, ctx.settings, and every service (ctx.plan_service,
       # ctx.calendar_service, ctx.goal_service, ...) are available.
       return {"success": True, "message": "done"}
   ```

4. Add the import to the "Register skill modules" block in `__init__.py`:

   ```python
   from app.core.agents.skills import my_skill  # noqa: F401,E402
   ```

That's it — no orchestrator changes needed.

## Handler contract

- Signature: `async def handler(ctx: SkillContext, user_id: str, args: dict) -> dict`
- Return a dict; convention is `{"success": bool, "message": str, ...}` so the
  model can report the outcome (matches the legacy tool handlers).
- `ctx` (`SkillContext`) exposes `db`, `settings`, and all existing services, so a
  skill can hit Mongo directly or delegate to a service (see `example_skill.py`).

## Notes

- Skill names must be unique within the registry; registering a duplicate raises
  at import time.
- A skill whose name matches a legacy tool overrides it (the legacy definition is
  deduped out of `get_tools()` and execution routes to the skill).
