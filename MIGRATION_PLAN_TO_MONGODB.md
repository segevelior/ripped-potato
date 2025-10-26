# 🚀 Migration Plan: localStorage to MongoDB

## Executive Summary
Currently, the app uses a mock SDK that stores all data in browser localStorage. This plan outlines the steps to migrate to the real MongoDB backend while maintaining functionality.

## Current State Analysis

### ✅ What's Working
- **Backend API**: Fully implemented with 10 routes covering 13 MongoDB models
- **Authentication**: JWT-based auth system ready
- **MongoDB Models**: All core models exist (Exercise, Workout, Goal, Plan, PredefinedWorkout, etc.)

### ⚠️ Critical Issues
1. **Frontend uses mock SDK**: `@base44/sdk` points to `../mock-sdk` (localStorage)
2. **Missing Models**: `ProgressionPath` entity has no backend implementation
3. **Naming Conflicts**: `WorkoutTemplate` vs `PredefinedWorkout`, `TrainingPlan` vs `Plan`
4. **No data in MongoDB**: All user data is in localStorage

---

## 📋 Phase 1: Create API Adapter Layer (Week 1)

### Goal: Build adapter without breaking existing functionality

### Step 1.1: Create API Service Layer
**File**: `frontend/src/services/api.js`

```javascript
// This will be our bridge between frontend and backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class APIService {
  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}/api/v1${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.token ? `Bearer ${this.token}` : '',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Entity-specific methods
  exercises = {
    list: () => this.request('/exercises'),
    create: (data) => this.request('/exercises', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => this.request(`/exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => this.request(`/exercises/${id}`, { method: 'DELETE' })
  };

  // Add similar methods for all entities...
}

export const apiService = new APIService();
```

### Step 1.2: Create Entity Wrappers
**Files**: `frontend/src/api/entities/*.js`

For each entity, create a wrapper that matches the mock SDK interface:

```javascript
// frontend/src/api/entities/Exercise.js
import { apiService } from '../../services/api';

export const Exercise = {
  async list() {
    return await apiService.exercises.list();
  },
  async create(data) {
    return await apiService.exercises.create(data);
  },
  async update(id, data) {
    return await apiService.exercises.update(id, data);
  },
  async delete(id) {
    return await apiService.exercises.delete(id);
  },
  async findById(id) {
    const exercises = await this.list();
    return exercises.find(e => e.id === id || e._id === id);
  }
};
```

### Step 1.3: Create Switch Mechanism
**File**: `frontend/src/api/config.js`

```javascript
// Toggle between mock and real API
export const API_MODE = import.meta.env.VITE_API_MODE || 'mock'; // 'mock' or 'real'

export const shouldUseMockAPI = () => {
  return API_MODE === 'mock';
};
```

### Step 1.4: Update Entity Imports
**File**: `frontend/src/api/entities.js`

```javascript
import { shouldUseMockAPI } from './config';

// Mock SDK imports
import * as mockEntities from '@base44/sdk';

// Real API imports
import * as realEntities from './entities/index';

// Export the appropriate implementation
export const Exercise = shouldUseMockAPI() ? mockEntities.Exercise : realEntities.Exercise;
export const Workout = shouldUseMockAPI() ? mockEntities.Workout : realEntities.Workout;
// ... continue for all entities
```

**Testing Checklist**:
- [ ] API service can connect to backend
- [ ] Authentication headers are sent correctly
- [ ] Each entity wrapper works with mock data
- [ ] Switch mechanism toggles properly

---

## 📋 Phase 2: Fix Missing Backend Components (Week 1-2)

### Step 2.1: Create ProgressionPath Model
**File**: `backend/src/models/ProgressionPath.js`

```javascript
const mongoose = require('mongoose');

const progressionPathSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  fromGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
  toGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' },
  requirements: [{
    type: { type: String, enum: ['exercise', 'skill', 'milestone'] },
    targetId: mongoose.Schema.Types.ObjectId,
    targetName: String,
    minimumLevel: Number
  }],
  estimatedWeeks: Number,
  difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  isCommon: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('ProgressionPath', progressionPathSchema);
```

### Step 2.2: Create ProgressionPath Routes
**File**: `backend/src/routes/progressionPaths.js`

```javascript
const router = require('express').Router();
const ProgressionPath = require('../models/ProgressionPath');
const { auth, optionalAuth } = require('../middleware/auth');

// GET all progression paths
router.get('/', optionalAuth, async (req, res) => {
  try {
    const query = req.user
      ? { $or: [{ isCommon: true }, { createdBy: req.user.id }] }
      : { isCommon: true };

    const paths = await ProgressionPath.find(query)
      .populate('fromGoal toGoal');

    res.json({ success: true, data: paths });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add other CRUD operations...

module.exports = router;
```

### Step 2.3: Register New Routes
**File**: `backend/src/server.js`

Add to routes section:
```javascript
app.use('/api/v1/progression-paths', require('./routes/progressionPaths'));
```

### Step 2.4: Resolve Naming Conflicts

Create alias routes for naming compatibility:

```javascript
// In backend/src/server.js
app.use('/api/v1/training-plans', require('./routes/plans')); // Alias for plans
app.use('/api/v1/workout-templates', require('./routes/predefinedWorkouts')); // Alias
```

**Testing Checklist**:
- [ ] ProgressionPath model created and indexed
- [ ] ProgressionPath routes tested with Postman
- [ ] Naming aliases work correctly
- [ ] All routes return expected format

---

## 📋 Phase 3: Data Migration (Week 2)

### Step 3.1: Export localStorage Data
Create a utility to export current localStorage data:

**File**: `frontend/public/export-data.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Export LocalStorage Data</title>
</head>
<body>
  <h1>Export Your Data</h1>
  <button onclick="exportData()">Export to JSON</button>

  <script>
    function exportData() {
      const data = {};
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('base44_')) {
          const entityName = key.replace('base44_', '');
          try {
            data[entityName] = JSON.parse(localStorage.getItem(key));
          } catch (e) {
            console.error(`Failed to parse ${key}:`, e);
          }
        }
      });

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `synergyfit-data-${Date.now()}.json`;
      a.click();
    }
  </script>
</body>
</html>
```

### Step 3.2: Create Import Script
**File**: `backend/scripts/import-user-data.js`

```javascript
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

// Import all models
const Exercise = require('../src/models/Exercise');
const Workout = require('../src/models/Workout');
const Goal = require('../src/models/Goal');
const Plan = require('../src/models/Plan');
const PredefinedWorkout = require('../src/models/PredefinedWorkout');
// ... other models

async function importData(filePath) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Import exercises first (no dependencies)
    if (data.Exercise) {
      for (const exercise of data.Exercise) {
        await Exercise.create({
          ...exercise,
          _id: undefined, // Let MongoDB generate new IDs
          isCommon: false, // User's personal exercises
          createdBy: userId // Set to actual user ID
        });
      }
      console.log(`Imported ${data.Exercise.length} exercises`);
    }

    // Import workouts (depends on exercises)
    if (data.Workout) {
      // ... similar pattern
    }

    // Continue for other entities...

    console.log('Import complete!');
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// Run: node scripts/import-user-data.js path/to/exported-data.json
importData(process.argv[2]);
```

### Step 3.3: Seed Common Data
```bash
cd backend
node scripts/seedExercises.js
node scripts/seed-predefined-workouts.js
```

**Testing Checklist**:
- [ ] Export utility works in browser
- [ ] Import script handles all entities
- [ ] ID references are maintained
- [ ] Common data is seeded

---

## 📋 Phase 4: Frontend Integration (Week 2-3)

### Step 4.1: Update package.json
Remove mock SDK dependency:

```json
{
  "dependencies": {
    // Remove: "@base44/sdk": "file:../mock-sdk",
    // Add if needed: "axios": "^1.6.0" for API calls
  }
}
```

### Step 4.2: Update Environment Variables
**File**: `frontend/.env.production`

```env
VITE_API_URL=https://ripped-potato-api.onrender.com
VITE_API_MODE=real
```

**File**: `frontend/.env.development`

```env
VITE_API_URL=http://localhost:5001
VITE_API_MODE=mock  # Use 'real' when ready to test with backend
```

### Step 4.3: Update Authentication Flow
**File**: `frontend/src/contexts/AuthContext.jsx`

Update to use real API authentication instead of mock:

```javascript
const login = async (email, password) => {
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (data.success) {
      localStorage.setItem('auth_token', data.token);
      setUser(data.user);
      return data.user;
    }
    throw new Error(data.message);
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};
```

### Step 4.4: Test Each Page
Test order (from simple to complex):

1. [ ] Authentication (login/register)
2. [ ] Exercises page (list, create, edit, delete)
3. [ ] PredefinedWorkouts page
4. [ ] Goals page
5. [ ] Plans page
6. [ ] Dashboard
7. [ ] Live workout features

**Testing Checklist**:
- [ ] All CRUD operations work
- [ ] Data persists after refresh
- [ ] No localStorage dependencies remain
- [ ] Performance is acceptable

---

## 📋 Phase 5: Deployment & Cutover (Week 3)

### Step 5.1: Backend Deployment Prep
1. Ensure all environment variables are set in Render:
   - `MONGODB_URI` (with IP whitelist updated)
   - `JWT_SECRET`
   - `ALLOWED_ORIGINS` (include frontend URL)

2. Run migrations in production:
```bash
# SSH into Render or run via web console
node scripts/seedExercises.js
node scripts/seed-predefined-workouts.js
```

### Step 5.2: Frontend Deployment
1. Build with production config:
```bash
cd frontend
VITE_API_MODE=real npm run build
```

2. Deploy to Render

### Step 5.3: Gradual Rollout
1. **Day 1-3**: Deploy with `VITE_API_MODE=mock` (safe fallback)
2. **Day 4-7**: Switch to `VITE_API_MODE=real` for testing
3. **Day 8+**: Full production on MongoDB

### Step 5.4: Data Migration for Users
Provide users with:
1. Export tool (before switching)
2. Import instructions
3. Support period for issues

**Deployment Checklist**:
- [ ] Backend deployed and accessible
- [ ] MongoDB Atlas IP whitelist includes Render
- [ ] Frontend built with correct API URL
- [ ] Authentication works in production
- [ ] Common data is available
- [ ] User migration path documented

---

## 🚨 Risk Mitigation

### Potential Issues & Solutions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Export tool + backup localStorage |
| API response format mismatch | Medium | Add response transformers |
| Performance degradation | Medium | Implement caching layer |
| Authentication failures | High | Keep mock SDK as fallback initially |
| Missing features in backend | Medium | Implement missing endpoints first |

### Rollback Plan
1. Keep mock SDK code in separate branch
2. Environment variable to switch back instantly
3. localStorage data remains until explicitly cleared
4. Document all changes for quick reversal

---

## 📊 Success Metrics

- [ ] Zero data loss during migration
- [ ] Page load time < 2 seconds
- [ ] All features working as before
- [ ] MongoDB contains all user data
- [ ] No localStorage dependencies
- [ ] Users can access from any device

---

## 🎯 Quick Start Commands

```bash
# Backend Development
cd backend
npm run dev

# Frontend Development (with mock)
cd frontend
VITE_API_MODE=mock npm run dev

# Frontend Development (with real API)
cd frontend
VITE_API_MODE=real npm run dev

# Test API endpoints
curl http://localhost:5001/api/v1/exercises
curl http://localhost:5001/api/v1/predefined-workouts
curl http://localhost:5001/api/v1/goals

# Check MongoDB data
cd backend
node -e "require('./scripts/check-db-status.js')"
```

---

## 📅 Timeline

**Week 1**: API Adapter Layer + Missing Components
**Week 2**: Data Migration + Frontend Integration
**Week 3**: Testing + Deployment + User Migration

Total Effort: ~3 weeks for complete migration

---

## Next Immediate Steps

1. **Create API service layer** (Step 1.1)
2. **Implement ProgressionPath model** (Step 2.1)
3. **Test with one entity first** (e.g., Exercise)
4. **Export current localStorage data** (backup)

This plan ensures a smooth transition from localStorage to MongoDB while maintaining all functionality and providing fallback options.