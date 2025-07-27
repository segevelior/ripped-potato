# Ripped Potato Backend API

FastAPI-based backend for the Ripped Potato fitness tracking application.

## Features

- JWT-based authentication
- MongoDB database with Beanie ODM
- RESTful API with GraphQL-style search
- Async/await throughout
- Automatic API documentation

## Setup

### Prerequisites

- Python 3.9+
- MongoDB (via Docker or local installation)
- Poetry (install with `pip install poetry`)

### Installation

1. Clone the repository:
```bash
cd ripped-potato-backend
```

2. Install dependencies with Poetry:
```bash
poetry install
```

3. Activate the virtual environment:
```bash
poetry shell
```

4. Copy environment variables:
```bash
cp .env.example .env
```

5. Start MongoDB (using Docker):
```bash
docker-compose -f scripts/docker/docker-compose.yml up -d
```

### Running the Server

Development mode with auto-reload:
```bash
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or if you're already in the poetry shell:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- API: http://localhost:8000
- Docs: http://localhost:8000/api/v1/docs
- ReDoc: http://localhost:8000/api/v1/redoc

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user

### Exercises
- `POST /api/v1/exercises/search` - Search exercises (GraphQL-style)
- `GET /api/v1/exercises/{id}` - Get exercise by ID
- `POST /api/v1/exercises` - Create exercise
- `PUT /api/v1/exercises/{id}` - Update exercise
- `DELETE /api/v1/exercises/{id}` - Delete exercise

## Testing

Run the setup test:
```bash
poetry run python tests/test_setup.py
```

Run all tests:
```bash
poetry run pytest
```

Code formatting:
```bash
poetry run black app/
poetry run isort app/
```

## Project Structure

```
app/
├── api/            # API routes and dependencies
├── core/           # Core configuration and security
├── db/             # Database connection and setup
├── models/         # MongoDB document models
├── schemas/        # Pydantic schemas
└── main.py         # FastAPI application
```
