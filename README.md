# Ripped Potato

A fitness tracking application migrated from Base44 to a self-hosted architecture.

## Project Structure

```
ripped-potato/
├── ripped-potato-backend/     # FastAPI backend with MongoDB
├── ripped-potato-frontend/    # React frontend with Vite
└── .memory                    # Project development notes
```

## Quick Start

### 1. Backend Setup

```bash
cd ripped-potato-backend
./setup.sh  # Or follow manual setup in backend README
make dev    # Starts the API at http://localhost:8000
```

API docs available at: http://localhost:8000/api/v1/docs

### 2. Frontend Setup

```bash
cd ripped-potato-frontend
npm install
npm run dev  # Starts the app at http://localhost:5173
```

### 3. Create Test User

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123", "full_name": "Test User"}'
```

## Architecture

- **Backend**: FastAPI + MongoDB + JWT authentication
- **Frontend**: React + Vite + Tailwind CSS
- **API**: RESTful with Base44-compatible interface
- **Auth**: JWT with automatic token refresh

## Development Status

### ✅ Completed
- Backend infrastructure (Poetry, Docker, FastAPI)
- Authentication system (JWT with refresh tokens)
- Exercise entity (full CRUD operations)
- Frontend infrastructure with API client
- Login and Exercise management pages

### 🚧 In Progress
- Workout entity
- Additional UI components
- Data migration from Base44

### 📋 TODO
- Remaining entities (Goal, Plan, etc.)
- AI service for workout generation
- File upload for exercise media
- Production deployment

## Development Workflow

1. Backend changes: Edit in `ripped-potato-backend/`
2. Frontend changes: Edit in `ripped-potato-frontend/`
3. Test integration: Run both services locally
4. Reference: Use `synergy-fit` as implementation guide

## Notes

This project is a migration of synergy-fit from Base44 to a self-hosted architecture.
The goal is to maintain API compatibility while gaining full control over the infrastructure. 