# AI Coach Service

Python-based AI coaching service for SynergyFit/Ripped Potato fitness application.

> **Terminology:** a **session** is any training activity — a gym workout, a climbing
> session, a bike ride, a run, a mobility block — and the `discipline` field says which
> sport it is. Tools, collections and fields use session vocabulary
> (`create_session_template`, `log_session`, `sessiontemplates`, `sessionlogs`).
> Any recorded transcript or captured output in this repo (e.g. `AB_TEST.md`) predates
> the workout→session rename and is kept verbatim — it is not rewritten.

## Features

- 🤖 Intelligent fitness coaching using GPT-3.5/GPT-4
- 💪 Exercise alternatives and form guidance
- 📋 Training plan generation (sessions across any discipline)
- 🎯 Context-aware responses based on user data
- 🔐 JWT authentication compatible with Node.js backend
- 📊 MongoDB integration for user data

## Setup

1. Install Poetry (Python dependency manager):
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

2. Install dependencies:
```bash
poetry install
```

3. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run the service:
```bash
poetry run uvicorn app.main:app --reload --port 8001
```

## Project Structure

```
app/
├── api/           # API endpoints
│   └── v1/        # API version 1
├── core/          # Core business logic
│   └── agents/    # AI agents
├── prompts/       # Centralized prompt management
├── models/        # Data models
├── middleware/    # Authentication and middleware
└── services/      # Business services
```

## Customizing AI Behavior

Edit the prompts in `app/prompts/fitness_coach.py` to adjust:
- How the AI responds to greetings
- Exercise alternative suggestions
- Workout plan generation
- Form and technique guidance

## Environment Variables

See `.env.example` for required configuration.

## Integration

The service integrates with the existing Node.js backend:
- Node.js backend proxies AI requests to this service
- JWT tokens from Node.js are validated here
- User data is loaded from shared MongoDB

## Development

```bash
# Run with auto-reload
poetry run uvicorn app.main:app --reload --port 8001

# Run tests (when implemented)
poetry run pytest
```