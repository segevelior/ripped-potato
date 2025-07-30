// Mock Base44 SDK
// This provides a drop-in replacement for @base44/sdk with local storage

// Mock auth module
const auth = {
  user: null,
  
  async signIn(email, password) {
    // Mock authentication - accept any credentials for now
    this.user = {
      id: 'mock-user-123',
      email: email || 'user@example.com',
      name: 'Test User'
    };
    localStorage.setItem('mockAuth', JSON.stringify(this.user));
    return this.user;
  },
  
  async signOut() {
    this.user = null;
    localStorage.removeItem('mockAuth');
  },
  
  async getCurrentUser() {
    if (!this.user) {
      const stored = localStorage.getItem('mockAuth');
      if (stored) {
        this.user = JSON.parse(stored);
      }
    }
    return this.user;
  },
  
  onAuthStateChange(callback) {
    // Mock auth state listener
    callback(this.user);
    return () => {}; // Return unsubscribe function
  }
};

// Helper to load/save data
const dataStore = {
  load(entity) {
    const data = localStorage.getItem(`base44_${entity}`);
    return data ? JSON.parse(data) : [];
  },
  
  save(entity, data) {
    localStorage.setItem(`base44_${entity}`, JSON.stringify(data));
  },
  
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
};

// Base entity class with CRUD operations
class MockEntity {
  constructor(name) {
    this.name = name;
    this.data = dataStore.load(name);
  }
  
  async create(item) {
    const newItem = {
      ...item,
      id: item.id || dataStore.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.push(newItem);
    dataStore.save(this.name, this.data);
    return newItem;
  }
  
  async find(query = {}) {
    let results = [...this.data];
    
    // Simple query filtering
    Object.entries(query).forEach(([key, value]) => {
      if (key === 'orderBy') {
        const [field, direction = 'asc'] = value.split(' ');
        results.sort((a, b) => {
          if (direction === 'desc') {
            return b[field] > a[field] ? 1 : -1;
          }
          return a[field] > b[field] ? 1 : -1;
        });
      } else if (key === 'limit') {
        results = results.slice(0, value);
      } else {
        results = results.filter(item => item[key] === value);
      }
    });
    
    return results;
  }
  
  async findOne(query) {
    const results = await this.find(query);
    return results[0] || null;
  }
  
  async findById(id) {
    return this.data.find(item => item.id === id) || null;
  }
  
  async update(id, updates) {
    const index = this.data.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    this.data[index] = {
      ...this.data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    dataStore.save(this.name, this.data);
    return this.data[index];
  }
  
  async delete(id) {
    const index = this.data.findIndex(item => item.id === id);
    if (index === -1) return false;
    
    this.data.splice(index, 1);
    dataStore.save(this.name, this.data);
    return true;
  }
}

// Create entities
const entities = {
  Exercise: new MockEntity('Exercise'),
  Workout: new MockEntity('Workout'),
  ExternalActivity: new MockEntity('ExternalActivity'),
  WorkoutTemplate: new MockEntity('WorkoutTemplate'),
  Discipline: new MockEntity('Discipline'),
  WorkoutType: new MockEntity('WorkoutType'),
  TrainingPlan: new MockEntity('TrainingPlan'),
  PredefinedWorkout: new MockEntity('PredefinedWorkout'),
  Goal: new MockEntity('Goal'),
  ProgressionPath: new MockEntity('ProgressionPath'),
  UserGoalProgress: new MockEntity('UserGoalProgress'),
  Plan: new MockEntity('Plan'),
  UserTrainingPattern: new MockEntity('UserTrainingPattern')
};

// Mock integrations
const integrations = {
  Core: {
    async InvokeLLM(prompt) {
      // Mock AI response
      return {
        response: "This is a mock AI response. In production, this would connect to your LLM service.",
        tokens: 50
      };
    },
    
    async SendEmail(to, subject, body) {
      console.log('Mock email:', { to, subject, body });
      return { success: true, messageId: dataStore.generateId() };
    },
    
    async UploadFile(file) {
      // Mock file upload - just return a fake URL
      return {
        url: `https://mock-storage.example.com/${dataStore.generateId()}/${file.name}`,
        size: file.size,
        type: file.type
      };
    },
    
    async GenerateImage(prompt) {
      // Mock image generation
      return {
        url: `https://mock-images.example.com/${dataStore.generateId()}.png`,
        prompt
      };
    },
    
    async ExtractDataFromUploadedFile(fileUrl) {
      // Mock data extraction
      return {
        extractedData: {},
        success: true
      };
    }
  }
};

// Load seed data on first use
import { loadSeedData } from './data/seed-data.js';

// Main SDK client creation function
export function createClient(config) {
  console.log('Mock Base44 SDK initialized with config:', config);
  
  // Load seed data if this is first time
  if (typeof window !== 'undefined' && !localStorage.getItem('base44_seed_loaded')) {
    loadSeedData();
    localStorage.setItem('base44_seed_loaded', 'true');
  }
  
  return {
    auth,
    entities,
    integrations,
    config
  };
}

// Default export for convenience
export default { createClient };