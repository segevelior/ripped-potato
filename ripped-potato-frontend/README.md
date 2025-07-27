# Ripped Potato Frontend

React frontend for the Ripped Potato fitness tracking application.

## Features

- JWT authentication with token refresh
- Exercise management (CRUD operations)
- Responsive design with Tailwind CSS
- API client compatible with Base44 interface

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env
```

3. Make sure the backend is running:
```bash
# From the main ripped-potato directory
cd ../ripped-potato-backend
docker-compose -f scripts/docker/docker-compose.yml up -d
poetry run uvicorn app.main:app --reload
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at http://localhost:5173

## API Integration

The API client in `src/api/` provides:
- Authentication (login, register, logout)
- Exercise entity operations (matching Base44 interface)
- Automatic token refresh
- Request/response interceptors

## Project Structure

```
src/
├── api/              # API client and authentication
├── components/       # Reusable React components
├── pages/           # Page components
└── utils/           # Utility functions
```

## Next Steps

1. Create a test user in the backend
2. Login and test exercise operations
3. Add remaining entities (Workout, Goal, etc.)
4. Implement UI components from synergy-fit reference 