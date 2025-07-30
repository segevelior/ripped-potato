# Mock Base44 SDK

This is a local mock implementation of the Base44 SDK for development purposes.

## Features

- Drop-in replacement for `@base44/sdk`
- Uses localStorage for data persistence
- Includes seed data for testing
- Mock authentication (accepts any credentials)
- All CRUD operations supported

## Data Management

### Converting CSV to JSON

If you have CSV exports from Base44:

```bash
cd mock-sdk/data
node csv-to-json.js Exercise < exercises.csv > exercises.json
```

### Seed Data

The SDK automatically loads seed data on first use, including:
- Sample exercises with progressions
- Disciplines and workout types
- Example goals
- Predefined workouts

### Clearing Data

To reset all data:
```javascript
localStorage.clear();
// Then reload the page to get fresh seed data
```

## API Compatibility

This mock maintains the same API as Base44:
- `base44.auth.*` - Authentication methods
- `base44.entities.*` - Entity CRUD operations
- `base44.integrations.Core.*` - Mock integrations

## Limitations

- No real authentication (for development only)
- No server persistence (uses localStorage)
- Mock AI responses
- File uploads return fake URLs