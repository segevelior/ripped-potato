// Mock Base44 SDK - Browser-safe version with no external imports
// This provides a drop-in replacement for @base44/sdk with localStorage

// Real auth module with JWT
const auth = {
  user: null,
  token: null,
  baseURL: import.meta.env?.VITE_API_URL || 'http://localhost:5001/api/v1',
  
  async signIn(email, password) {
    try {
      console.log('🔐 Attempting login with backend...');
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      this.user = data.data.user;
      this.token = data.data.token;
      
      // Store in localStorage
      localStorage.setItem('authToken', this.token);
      localStorage.setItem('authUser', JSON.stringify(this.user));
      
      console.log('✅ Login successful');
      return this.user;
    } catch (error) {
      console.warn('⚠️ Login failed, using mock auth:', error.message);
      // Fallback to mock auth
      this.user = {
        id: 'mock-user-123',
        email: email || 'user@example.com',
        name: 'Test User'
      };
      localStorage.setItem('mockAuth', JSON.stringify(this.user));
      return this.user;
    }
  },
  
  async signOut() {
    this.user = null;
    this.token = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('mockAuth');
  },
  
  // Alias for Base44 compatibility
  async login() {
    // Base44's login() method doesn't take parameters, it redirects to their auth page
    // For our implementation, we'll redirect to our auth page
    window.location.href = '/auth';
  },
  
  async getCurrentUser() {
    if (!this.user) {
      // Try to restore from localStorage
      const token = localStorage.getItem('authToken');
      const user = localStorage.getItem('authUser');
      
      if (token && user) {
        this.token = token;
        this.user = JSON.parse(user);
      } else {
        // Check for mock auth
        const mockUser = localStorage.getItem('mockAuth');
        if (mockUser) {
          this.user = JSON.parse(mockUser);
        }
      }
    }
    return this.user;
  },
  
  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('authToken');
    }
    return this.token;
  },
  
  getAuthHeaders() {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },
  
  onAuthStateChange(callback) {
    callback(this.user);
    return () => {};
  }
};

// Base entity class with CRUD operations
class MockEntity {
  constructor(name) {
    this.name = name;
    this.data = this.loadData();
  }
  
  loadData() {
    try {
      const stored = localStorage.getItem(`base44_${this.name}`);
      const data = stored ? JSON.parse(stored) : [];
      return data;
    } catch (error) {
      console.error(`Error loading ${this.name} from localStorage:`, error);
      return [];
    }
  }
  
  saveData() {
    localStorage.setItem(`base44_${this.name}`, JSON.stringify(this.data));
  }
  
  async create(item) {
    const newItem = {
      ...item,
      id: item.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.push(newItem);
    this.saveData();
    return newItem;
  }
  
  async find(query = {}) {
    return [...this.data];
  }
  
  // Base44 compatibility - list() is what the app uses
  async list(query = {}) {
    return [...this.data];
  }
  
  async findOne(query) {
    return this.data[0] || null;
  }
  
  async findById(id) {
    return this.data.find(item => item.id === id) || null;
  }
  
  // Base44 compatibility - get() is used for single items
  async get(id) {
    return this.findById(id);
  }
  
  async update(id, updates) {
    const index = this.data.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    this.data[index] = {
      ...this.data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    return this.data[index];
  }
  
  async delete(id) {
    const index = this.data.findIndex(item => item.id === id);
    if (index === -1) return false;
    
    this.data.splice(index, 1);
    this.saveData();
    return true;
  }
  
  // Base44 compatibility - filter() method
  async filter(query = {}) {
    let filtered = [...this.data];
    
    // Simple filtering by exact match
    Object.keys(query).forEach(key => {
      if (query[key] !== undefined) {
        filtered = filtered.filter(item => item[key] === query[key]);
      }
    });
    
    return filtered;
  }
}

// Base API Entity class with common CRUD operations
class APIEntity extends MockEntity {
  constructor(entityName, endpoint) {
    super(entityName);
    this.endpoint = endpoint || entityName.toLowerCase() + 's';
    this.baseURL = `${import.meta.env?.VITE_API_URL || 'http://localhost:5001/api'}/v1`;
  }

  async list() {
    try {
      const response = await fetch(`${this.baseURL}/${this.endpoint}`, {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        console.warn(`⚠️ API list error for ${this.endpoint}, falling back to localStorage`);
        return super.list();
      }
      
      const result = await response.json();
      const items = result.data?.[this.endpoint] || result.data || result || [];
      
      // Normalize IDs
      return items.map(item => ({
        ...item,
        id: item.id || item._id,
        _id: undefined
      }));
    } catch (error) {
      console.warn(`⚠️ API list error for ${this.endpoint}, falling back to localStorage:`, error.message);
      return super.list();
    }
  }
}

// API Exercise Entity - uses backend API with localStorage fallback
class APIExercise extends APIEntity {
  constructor() {
    console.log('🔧 APIExercise constructor starting...');
    super('Exercise', 'exercises'); // Pass entity name and endpoint
    console.log('🔧 APIExercise constructor completed successfully');
  }

  // Inherited list() method from APIEntity

  async create(exerciseData) {
    try {
      console.log('🌐 Trying API call to create exercise...');
      const response = await fetch(`${this.baseURL}/exercises`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(exerciseData)
      });
      
      if (!response.ok) {
        console.warn('⚠️ API create failed, falling back to localStorage');
        return super.create(exerciseData);
      }
      
      const result = await response.json();
      console.log('✅ API create successful');
      
      // Handle nested response structure and normalize ID
      const exercise = result.data?.exercise || result;
      return {
        ...exercise,
        id: exercise.id || exercise._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API create error, falling back to localStorage:', error.message);
      return super.create(exerciseData);
    }
  }

  async get(id) {
    return this.findById(id);
  }

  async findById(id) {
    try {
      const response = await fetch(`${this.baseURL}/exercises/${id}`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        return super.get(id);
      }
      return await response.json();
    } catch (error) {
      console.warn('⚠️ API get error, falling back to localStorage:', error.message);
      return super.get(id);
    }
  }

  async update(id, updates) {
    try {
      const response = await fetch(`${this.baseURL}/exercises/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        return super.update(id, updates);
      }
      
      return await response.json();
    } catch (error) {
      console.warn('⚠️ API update error, falling back to localStorage:', error.message);
      return super.update(id, updates);
    }
  }

  async delete(id) {
    try {
      const response = await fetch(`${this.baseURL}/exercises/${id}`, {
        method: 'DELETE',
        headers: {
          ...auth.getAuthHeaders()
        }
      });
      
      if (!response.ok) {
        return super.delete(id);
      }
      
      return true;
    } catch (error) {
      console.warn('⚠️ API delete error, falling back to localStorage:', error.message);
      return super.delete(id);
    }
  }


  // Use parent's filter method for now
  // async filter(query = {}) is inherited from MockEntity
}

// API Workout Entity - uses backend API with localStorage fallback
class APIWorkout extends APIEntity {
  constructor() {
    console.log('🔧 APIWorkout constructor starting...');
    super('Workout', 'workouts');
    console.log('🔧 APIWorkout constructor completed successfully');
  }

  async list(query = {}) {
    try {
      console.log('🌐 Trying API call to fetch workouts...');
      const response = await fetch(`${this.baseURL}/workouts`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        console.warn('⚠️ API call failed, falling back to localStorage');
        return super.list(query);
      }
      const data = await response.json();
      // Backend returns { success: true, data: { workouts: [...] } }
      const workouts = data.data?.workouts || data.workouts || data;
      
      // Normalize the data: convert _id to id
      const normalized = workouts.map(w => ({
        ...w,
        id: w.id || w._id,
        _id: undefined // Remove _id to avoid confusion
      }));
      
      console.log('✅ API call successful, got', normalized.length, 'workouts');
      return normalized;
    } catch (error) {
      console.warn('⚠️ API error, falling back to localStorage:', error.message);
      return super.list(query);
    }
  }

  async create(workoutData) {
    try {
      console.log('🌐 Trying API call to create workout...');
      const response = await fetch(`${this.baseURL}/workouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(workoutData)
      });
      
      if (!response.ok) {
        console.warn('⚠️ API create failed, falling back to localStorage');
        return super.create(workoutData);
      }
      
      const result = await response.json();
      console.log('✅ API create successful');
      
      // Handle nested response structure and normalize ID
      const workout = result.data?.workout || result;
      return {
        ...workout,
        id: workout.id || workout._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API create error, falling back to localStorage:', error.message);
      return super.create(workoutData);
    }
  }

  async get(id) {
    return this.findById(id);
  }

  async findById(id) {
    try {
      const response = await fetch(`${this.baseURL}/workouts/${id}`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        return super.get(id);
      }
      const data = await response.json();
      const workout = data.data?.workout || data;
      return {
        ...workout,
        id: workout.id || workout._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API get error, falling back to localStorage:', error.message);
      return super.get(id);
    }
  }

  async update(id, updates) {
    try {
      const response = await fetch(`${this.baseURL}/workouts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        return super.update(id, updates);
      }
      
      const result = await response.json();
      const workout = result.data?.workout || result;
      return {
        ...workout,
        id: workout.id || workout._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API update error, falling back to localStorage:', error.message);
      return super.update(id, updates);
    }
  }

  async delete(id) {
    try {
      const response = await fetch(`${this.baseURL}/workouts/${id}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        return super.delete(id);
      }
      
      return true;
    } catch (error) {
      console.warn('⚠️ API delete error, falling back to localStorage:', error.message);
      return super.delete(id);
    }
  }
}

// API Goal Entity - uses backend API with localStorage fallback
class APIGoal extends MockEntity {
  constructor() {
    console.log('🔧 APIGoal constructor starting...');
    super('Goal'); // Initialize parent MockEntity
    this.baseURL = import.meta.env?.VITE_API_URL || 'http://localhost:5001/api/v1';
    console.log('🔧 APIGoal constructor completed successfully');
  }

  async list(query = {}) {
    try {
      console.log('🌐 Trying API call to fetch goals...');
      const response = await fetch(`${this.baseURL}/goals`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        console.warn('⚠️ API call failed, falling back to localStorage');
        return super.list(query);
      }
      const data = await response.json();
      // Backend returns { goals: [...], pagination: {...} }
      const goals = data.goals || data;
      
      // Normalize the data: convert _id to id
      const normalized = goals.map(g => ({
        ...g,
        id: g.id || g._id,
        _id: undefined // Remove _id to avoid confusion
      }));
      
      console.log('✅ API call successful, got', normalized.length, 'goals');
      return normalized;
    } catch (error) {
      console.warn('⚠️ API error, falling back to localStorage:', error.message);
      return super.list(query);
    }
  }

  async create(goalData) {
    try {
      console.log('🌐 Trying API call to create goal...');
      const response = await fetch(`${this.baseURL}/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(goalData)
      });
      
      if (!response.ok) {
        console.warn('⚠️ API create failed, falling back to localStorage');
        return super.create(goalData);
      }
      
      const result = await response.json();
      console.log('✅ API create successful');
      
      // Handle nested response structure and normalize ID
      const goal = result.data?.goal || result;
      return {
        ...goal,
        id: goal.id || goal._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API create error, falling back to localStorage:', error.message);
      return super.create(goalData);
    }
  }

  async get(id) {
    return this.findById(id);
  }

  async findById(id) {
    try {
      const response = await fetch(`${this.baseURL}/goals/${id}`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        return super.get(id);
      }
      const data = await response.json();
      const goal = data.data?.goal || data;
      return {
        ...goal,
        id: goal.id || goal._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API get error, falling back to localStorage:', error.message);
      return super.get(id);
    }
  }

  async update(id, updates) {
    try {
      const response = await fetch(`${this.baseURL}/goals/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        return super.update(id, updates);
      }
      
      const result = await response.json();
      const goal = result.data?.goal || result;
      return {
        ...goal,
        id: goal.id || goal._id,
        _id: undefined
      };
    } catch (error) {
      console.warn('⚠️ API update error, falling back to localStorage:', error.message);
      return super.update(id, updates);
    }
  }

  async delete(id) {
    try {
      const response = await fetch(`${this.baseURL}/goals/${id}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        return super.delete(id);
      }
      
      return true;  
    } catch (error) {
      console.warn('⚠️ API delete error, falling back to localStorage:', error.message);
      return super.delete(id);
    }
  }
}

// API PredefinedWorkout Entity
class APIPredefinedWorkout extends MockEntity {
  constructor() {
    console.log('🔧 APIPredefinedWorkout constructor starting...');
    super('PredefinedWorkout');
    this.baseURL = import.meta.env?.VITE_API_URL || 'http://localhost:5001/api/v1';
    console.log('🔧 APIPredefinedWorkout constructor completed successfully');
  }

  async list(query = {}) {
    try {
      console.log('🌐 Trying API call to fetch predefined workouts...');
      const response = await fetch(`${this.baseURL}/predefined-workouts`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) {
        console.warn('⚠️ API call failed, falling back to localStorage');
        return super.list(query);
      }
      const data = await response.json();
      const workouts = data.data?.predefinedWorkouts || data.predefinedWorkouts || data;
      const normalized = workouts.map(w => ({ ...w, id: w.id || w._id, _id: undefined }));
      console.log('✅ API call successful, got', normalized.length, 'predefined workouts');
      return normalized;
    } catch (error) {
      console.warn('⚠️ API error, falling back to localStorage:', error.message);
      return super.list(query);
    }
  }

  async create(data) {
    try {
      console.log('🌐 Trying API call to create predefined workout...');
      const response = await fetch(`${this.baseURL}/predefined-workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth.getAuthHeaders() },
        body: JSON.stringify(data)
      });
      if (!response.ok) return super.create(data);
      const result = await response.json();
      const workout = result.data?.predefinedWorkout || result;
      return { ...workout, id: workout.id || workout._id, _id: undefined };
    } catch (error) {
      return super.create(data);
    }
  }

  async get(id) { return this.findById(id); }
  async findById(id) {
    try {
      const response = await fetch(`${this.baseURL}/predefined-workouts/${id}`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) return super.get(id);
      const data = await response.json();
      const workout = data.data?.predefinedWorkout || data;
      return { ...workout, id: workout.id || workout._id, _id: undefined };
    } catch (error) {
      return super.get(id);
    }
  }

  async update(id, updates) {
    try {
      const response = await fetch(`${this.baseURL}/predefined-workouts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth.getAuthHeaders() },
        body: JSON.stringify(updates)
      });
      if (!response.ok) return super.update(id, updates);
      const result = await response.json();
      const workout = result.data?.predefinedWorkout || result;
      return { ...workout, id: workout.id || workout._id, _id: undefined };
    } catch (error) {
      return super.update(id, updates);
    }
  }

  async delete(id) {
    try {
      const response = await fetch(`${this.baseURL}/predefined-workouts/${id}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) return super.delete(id);
      return true;
    } catch (error) {
      return super.delete(id);
    }
  }
}

// API Plan Entity
class APIPlan extends MockEntity {
  constructor() {
    console.log('🔧 APIPlan constructor starting...');
    super('Plan');
    this.baseURL = import.meta.env?.VITE_API_URL || 'http://localhost:5001/api/v1';
    console.log('🔧 APIPlan constructor completed successfully');
  }

  async list(query = {}) {
    try {
      console.log('🌐 Trying API call to fetch plans...');
      const response = await fetch(`${this.baseURL}/plans`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) return super.list(query);
      const data = await response.json();
      const plans = data.data?.plans || data.plans || data;
      const normalized = plans.map(p => ({ ...p, id: p.id || p._id, _id: undefined }));
      console.log('✅ API call successful, got', normalized.length, 'plans');
      return normalized;
    } catch (error) {
      return super.list(query);
    }
  }

  async create(data) {
    try {
      const response = await fetch(`${this.baseURL}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth.getAuthHeaders() },
        body: JSON.stringify(data)
      });
      if (!response.ok) return super.create(data);
      const result = await response.json();
      const plan = result.data?.plan || result;
      return { ...plan, id: plan.id || plan._id, _id: undefined };
    } catch (error) {
      return super.create(data);
    }
  }

  async get(id) { return this.findById(id); }
  async findById(id) {
    try {
      const response = await fetch(`${this.baseURL}/plans/${id}`, {
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) return super.get(id);
      const data = await response.json();
      const plan = data.data?.plan || data;
      return { ...plan, id: plan.id || plan._id, _id: undefined };
    } catch (error) {
      return super.get(id);
    }
  }

  async update(id, updates) {
    try {
      const response = await fetch(`${this.baseURL}/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth.getAuthHeaders() },
        body: JSON.stringify(updates)
      });
      if (!response.ok) return super.update(id, updates);
      const result = await response.json();
      const plan = result.data?.plan || result;
      return { ...plan, id: plan.id || plan._id, _id: undefined };
    } catch (error) {
      return super.update(id, updates);
    }
  }

  async delete(id) {
    try {
      const response = await fetch(`${this.baseURL}/plans/${id}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      if (!response.ok) return super.delete(id);
      return true;
    } catch (error) {
      return super.delete(id);
    }
  }
}

// User entity with me() method
class MockUser extends MockEntity {
  constructor() {
    super('User');
  }
  
  async me() {
    // Return current user data
    return {
      id: 'user-1',
      name: 'Test User',
      email: 'test@synergyfit.com',
      profile: {
        age: 30,
        weight: 75,
        height: 180,
        fitnessLevel: 'intermediate'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

// API-connected User class
class APIUser extends MockUser {
  constructor() {
    super();
    this.baseURL = `${import.meta.env?.VITE_API_URL || 'http://localhost:5001/api'}/v1`;
  }
  
  async me() {
    try {
      // First try to get user from localStorage
      const cachedUser = localStorage.getItem('authUser');
      if (cachedUser) {
        return JSON.parse(cachedUser);
      }
      
      // If not in localStorage, fetch from API
      const response = await fetch(`${this.baseURL}/auth/profile`, {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        console.warn('Failed to fetch user profile, using mock data');
        return super.me();
      }
      
      const result = await response.json();
      const user = result.data || result;
      
      // Cache in localStorage
      localStorage.setItem('authUser', JSON.stringify(user));
      
      return user;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return super.me();
    }
  }
}

// Create entities
console.log('🚀 Starting entity creation...');

// Create entities with error handling
const entities = {};

try {
  console.log('📍 Creating Exercise entity with APIExercise...');
  entities.Exercise = new APIExercise(); // 🔄 Testing API integration
  console.log('✅ Exercise entity created successfully');
} catch (error) {
  console.error('❌ Failed to create APIExercise, falling back to MockEntity:', error);
  entities.Exercise = new MockEntity('Exercise');
}

try {
  console.log('📍 Creating Workout entity with APIWorkout...');
  entities.Workout = new APIWorkout(); // 🔄 Testing API integration
  console.log('✅ Workout entity created successfully');
} catch (error) {
  console.error('❌ Failed to create APIWorkout, falling back to MockEntity:', error);
  entities.Workout = new MockEntity('Workout');
}

try {
  console.log('📍 Creating Goal entity with APIGoal...');
  entities.Goal = new APIGoal(); // 🔄 Testing API integration
  console.log('✅ Goal entity created successfully');
} catch (error) {
  console.error('❌ Failed to create APIGoal, falling back to MockEntity:', error);
  entities.Goal = new MockEntity('Goal');
}

try {
  console.log('📍 Creating PredefinedWorkout entity with APIPredefinedWorkout...');
  entities.PredefinedWorkout = new APIPredefinedWorkout(); // 🔄 Testing API integration
  console.log('✅ PredefinedWorkout entity created successfully');
} catch (error) {
  console.error('❌ Failed to create APIPredefinedWorkout, falling back to MockEntity:', error);
  entities.PredefinedWorkout = new MockEntity('PredefinedWorkout');
}

try {
  console.log('📍 Creating Plan entity with APIPlan...');
  entities.Plan = new APIPlan(); // 🔄 Testing API integration
  console.log('✅ Plan entity created successfully');
} catch (error) {
  console.error('❌ Failed to create APIPlan, falling back to MockEntity:', error);
  entities.Plan = new MockEntity('Plan');
}

// Create other entities (remaining non-API entities)
const otherEntities = {
  ExternalActivity: new MockEntity('ExternalActivity'),
  WorkoutTemplate: new MockEntity('WorkoutTemplate'),
  Discipline: new MockEntity('Discipline'),
  WorkoutType: new MockEntity('WorkoutType'),
  TrainingPlan: new MockEntity('TrainingPlan'),
  ProgressionPath: new MockEntity('ProgressionPath'),
  UserGoalProgress: new MockEntity('UserGoalProgress'),
  UserTrainingPattern: new MockEntity('UserTrainingPattern'),
  User: new APIUser() // ✅ Use API-connected User with me() method
};

// Merge entities
Object.assign(entities, otherEntities);
console.log('✅ All entities created successfully');

// Mock integrations
const integrations = {
  Core: {
    async InvokeLLM(prompt) {
      console.log('Mock LLM invoke:', prompt);
      return {
        response: "I'm a mock AI assistant. I can help you with your fitness goals!",
        tokens: 50
      };
    },
    
    async SendEmail(to, subject, body) {
      console.log('Mock email:', { to, subject, body });
      return { success: true, messageId: 'mock-123' };
    },
    
    async UploadFile(file) {
      console.log('Mock file upload:', file.name);
      return {
        url: `https://mock-storage.example.com/${file.name}`,
        size: file.size,
        type: file.type
      };
    },
    
    async GenerateImage(prompt) {
      console.log('Mock image generation:', prompt);
      return {
        url: `https://picsum.photos/400/300`,
        prompt
      };
    },
    
    async ExtractDataFromUploadedFile(fileUrl) {
      console.log('Mock data extraction:', fileUrl);
      return {
        extractedData: {},
        success: true
      };
    }
  }
};

// Initialize sample data function
function initializeSampleData(entities) {
  console.log('Initializing sample data...');
  
  // Sample exercise data
  const sampleExercises = [
    {
      id: 'ex-1',
      name: 'Push-up',
      muscles: ['chest', 'triceps', 'shoulders', 'core'],
      discipline: ['strength', 'bodyweight'],
      equipment: [],
      strain: {
        intensity: 'moderate',
        load: 'bodyweight',
        duration_type: 'reps',
        typical_volume: '3x15'
      },
      description: 'Classic bodyweight pushing exercise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ex-2',
      name: 'Pull-up',
      muscles: ['back', 'biceps', 'forearms'],
      discipline: ['strength', 'bodyweight'],
      equipment: ['pull-up bar'],
      strain: {
        intensity: 'high',
        load: 'bodyweight',
        duration_type: 'reps',
        typical_volume: '3x8'
      },
      description: 'Vertical pulling exercise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ex-3',
      name: 'Squat',
      muscles: ['quadriceps', 'glutes', 'hamstrings', 'core'],
      discipline: ['strength'],
      equipment: [],
      strain: {
        intensity: 'moderate',
        load: 'bodyweight',
        duration_type: 'reps',
        typical_volume: '3x20'
      },
      description: 'Fundamental lower body exercise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ex-4',
      name: 'Plank',
      muscles: ['core', 'shoulders', 'back'],
      discipline: ['strength', 'stability'],
      equipment: [],
      strain: {
        intensity: 'low',
        load: 'bodyweight',
        duration_type: 'time',
        typical_volume: '3x60s'
      },
      description: 'Isometric core stability exercise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ex-5',
      name: 'Running',
      muscles: ['legs', 'core'],
      discipline: ['cardio', 'endurance'],
      equipment: [],
      strain: {
        intensity: 'moderate',
        load: 'bodyweight',
        duration_type: 'time',
        typical_volume: '30 minutes'
      },
      description: 'Cardiovascular endurance exercise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  
  // Save sample exercises to localStorage for Exercise entity
  localStorage.setItem('base44_Exercise', JSON.stringify(sampleExercises));
  console.log('Initialized Exercise data in localStorage:', sampleExercises.length, 'exercises');
  
  // Add disciplines
  entities.Discipline.data = [
    { id: 'd-1', name: 'strength' },
    { id: 'd-2', name: 'cardio' },
    { id: 'd-3', name: 'flexibility' },
    { id: 'd-4', name: 'bodyweight' },
    { id: 'd-5', name: 'endurance' },
    { id: 'd-6', name: 'stability' }
  ];
  entities.Discipline.saveData();
  
  // Add workout types
  entities.WorkoutType.data = [
    { id: 'wt-1', name: 'strength' },
    { id: 'wt-2', name: 'cardio' },
    { id: 'wt-3', name: 'hybrid' },
    { id: 'wt-4', name: 'recovery' },
    { id: 'wt-5', name: 'hiit' }
  ];
  entities.WorkoutType.saveData();
  
  // Add sample goals
  entities.Goal.data = [
    {
      id: 'goal-1',
      name: 'First Pull-up',
      discipline: ['strength', 'bodyweight'],
      description: 'Achieve your first unassisted pull-up',
      category: 'skill',
      difficulty_level: 'beginner',
      estimated_weeks: 12,
      prerequisites: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'goal-2',
      name: '5K Run',
      discipline: ['cardio', 'endurance'],
      description: 'Complete a 5K run without stopping',
      category: 'endurance',
      difficulty_level: 'beginner',
      estimated_weeks: 8,
      prerequisites: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'goal-3',
      name: '100 Push-ups',
      discipline: ['strength', 'bodyweight'],
      description: 'Complete 100 push-ups in a single workout',
      category: 'performance',
      difficulty_level: 'intermediate',
      estimated_weeks: 6,
      prerequisites: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  entities.Goal.saveData();
  console.log('Initialized Goal data:', entities.Goal.data.length, 'goals');
  
  // Add sample predefined workouts
  entities.PredefinedWorkout.data = [
    {
      id: 'pw-1',
      name: 'Climbing + Push Strength Day',
      goal: 'Build upper body pushing strength while maintaining climbing technique and finger strength.',
      type: 'strength',
      primary_disciplines: ['climbing', 'calisthenics'],
      difficulty_level: 'intermediate',
      duration_minutes: 90,
      estimated_duration: 90,
      description: 'A comprehensive climbing and strength workout focusing on pushing movements',
      blocks: [
        {
          name: 'Warm-up',
          duration_minutes: 15,
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_name: 'Shoulder Warm-up',
              volume: '5 min',
              notes: 'Include band pull-aparts and arm circles'
            },
            {
              exercise_id: 'ex-4',
              exercise_name: 'Handstand Hold',
              volume: '3x30s',
              notes: 'Against wall for support'
            }
          ]
        },
        {
          name: 'Upper Body Strength',
          duration_minutes: 30,
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_name: 'Push-up',
              volume: '4x12',
              notes: 'Focus on full range of motion'
            },
            {
              exercise_id: 'ex-2',
              exercise_name: 'Pull-up',
              volume: '4x8',
              notes: 'Strict form, no kipping'
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'pw-2',
      name: 'Morning Movement Flow',
      goal: 'Gentle full-body activation and mobility for starting the day with energy and focus.',
      type: 'mobility',
      primary_disciplines: ['mobility', 'calisthenics'],
      difficulty_level: 'beginner',
      duration_minutes: 30,
      estimated_duration: 30,
      description: 'Wake up your body with this energizing morning routine',
      blocks: [
        {
          name: 'Dynamic Stretching',
          duration_minutes: 10,
          exercises: [
            {
              exercise_id: 'ex-3',
              exercise_name: 'Bodyweight Squat',
              volume: '2x15',
              notes: 'Slow and controlled'
            }
          ]
        },
        {
          name: 'Core Activation',
          duration_minutes: 10,
          exercises: [
            {
              exercise_id: 'ex-4',
              exercise_name: 'Plank',
              volume: '3x45s',
              notes: 'Focus on breathing'
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'pw-3',
      name: 'Upper Body Strength',
      goal: 'Build upper body pushing and pulling strength with compound movements',
      type: 'strength',
      primary_disciplines: ['strength'],
      difficulty_level: 'intermediate',
      duration_minutes: 75,
      estimated_duration: 75,
      description: 'Comprehensive upper body workout for strength gains',
      blocks: [
        {
          name: 'Main Lifts',
          duration_minutes: 45,
          exercises: [
            {
              exercise_id: 'ex-1',
              exercise_name: 'Push-up Variations',
              volume: '5x10',
              notes: 'Diamond, wide-grip, regular'
            },
            {
              exercise_id: 'ex-2',
              exercise_name: 'Pull-up Variations',
              volume: '5x6',
              notes: 'Wide-grip, chin-ups, neutral grip'
            }
          ]
        },
        {
          name: 'Accessory Work',
          duration_minutes: 20,
          exercises: [
            {
              exercise_id: 'ex-4',
              exercise_name: 'Plank to Push-up',
              volume: '3x10',
              notes: 'Alternate starting arm each set'
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
  entities.PredefinedWorkout.saveData();
  console.log('Initialized PredefinedWorkout data:', entities.PredefinedWorkout.data.length, 'workouts');
}

// Main SDK client creation function
export function createClient(config) {
  console.log('Mock Base44 SDK initialized with config:', config);
  
  // Force refresh data - change version number to reset
  const DATA_VERSION = 'v6';  // Change this to force refresh
  if (localStorage.getItem('base44_data_version') !== DATA_VERSION) {
    // Clear all old data
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('base44_')) {
        localStorage.removeItem(key);
      }
    });
    localStorage.setItem('base44_data_version', DATA_VERSION);
    
    // Initialize sample data AFTER entities are created
    initializeSampleData(entities);
  }
  
  return {
    auth,
    entities,
    integrations,
    config
  };
}

// Create the base44 client instance for convenience
export const base44 = createClient();