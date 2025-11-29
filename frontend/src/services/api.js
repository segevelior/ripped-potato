/**
 * API Service Layer
 * This is our bridge between frontend and backend
 * Handles all HTTP requests to the MongoDB-backed API
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class APIService {
  constructor() {
    this.token = localStorage.getItem('authToken');
    this.baseURL = API_BASE_URL;
  }

  updateToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  async request(endpoint, options = {}) {
    try {
      const url = `${this.baseURL}/api/v1${endpoint}`;
      if (import.meta.env.DEV) {
        console.log(`API Request: ${options.method || 'GET'} ${url}`);
      }

      // Always read fresh token from localStorage to handle OAuth callbacks
      const token = localStorage.getItem('authToken') || this.token;

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...options.headers
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `API Error: ${response.statusText}`);
      }

      // Handle both { success: true, data: [...] } and direct array responses
      return data.data !== undefined ? data.data : data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // Authentication endpoints
  auth = {
    login: async (email, password) => {
      const response = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (response.token) {
        this.updateToken(response.token);
      }
      return response;
    },
    register: async (userData) => {
      const response = await this.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      if (response.token) {
        this.updateToken(response.token);
      }
      return response;
    },
    logout: () => {
      this.updateToken(null);
      return Promise.resolve();
    },
    me: () => this.request('/auth/profile')
  };

  // Exercise endpoints
  exercises = {
    list: async () => {
      const response = await this.request('/exercises');
      // Backend returns { exercises: [...], pagination: {...} }
      // Extract just the exercises array
      return response.exercises || response;
    },
    get: (id) => this.request(`/exercises/${id}`),
    create: (data) => this.request('/exercises', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/exercises/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/exercises/${id}`, {
      method: 'DELETE'
    }),
    toggleFavorite: (id, isFavorite) => this.request(`/exercises/${id}/favorite`, {
      method: 'PUT',
      body: JSON.stringify({ isFavorite })
    }),
    customize: (id, modifications) => this.request(`/exercises/${id}/modifications`, {
      method: 'PUT',
      body: JSON.stringify(modifications)
    }),
    removeCustomization: (id) => this.request(`/exercises/${id}/modifications`, {
      method: 'DELETE'
    })
  };

  // Workout endpoints
  workouts = {
    list: async () => {
      const response = await this.request('/workouts');
      // Backend returns { workouts: [...], pagination: {...} }
      return response.workouts || response;
    },
    get: (id) => this.request(`/workouts/${id}`),
    create: (data) => this.request('/workouts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/workouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/workouts/${id}`, {
      method: 'DELETE'
    }),
    stats: () => this.request('/workouts/stats')
  };

  // Goal endpoints
  goals = {
    list: async () => {
      const response = await this.request('/goals');
      // Backend returns { goals: [...], pagination: {...} }
      return response.goals || response;
    },
    get: (id) => this.request(`/goals/${id}`),
    create: (data) => this.request('/goals', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/goals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/goals/${id}`, {
      method: 'DELETE'
    }),
    start: (id) => this.request(`/goals/${id}/start`, {
      method: 'POST'
    }),
    progress: () => this.request('/goals/user/progress'),
    stats: () => this.request('/goals/user/stats'),
    updateProgress: (progressId, data) => this.request(`/goals/progress/${progressId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    completeMilestone: (goalId, milestoneId) => this.request(`/goals/${goalId}/milestone/${milestoneId}/complete`, {
      method: 'PUT'
    }),
    favorite: (id) => this.request(`/goals/${id}/favorite`, {
      method: 'PUT'
    })
  };

  // Plan endpoints
  plans = {
    list: () => this.request('/plans'),
    get: (id) => this.request(`/plans/${id}`),
    create: (data) => this.request('/plans', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/plans/${id}`, {
      method: 'DELETE'
    }),
    active: () => this.request('/plans/active'),
    templates: () => this.request('/plans/templates'),
    createFromTemplate: (templateId, data) => this.request(`/plans/from-template/${templateId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    start: (id) => this.request(`/plans/${id}/start`, {
      method: 'POST'
    }),
    completeWorkout: (id, workoutData) => this.request(`/plans/${id}/complete-workout`, {
      method: 'POST',
      body: JSON.stringify(workoutData)
    }),
    skipWorkout: (id, workoutData) => this.request(`/plans/${id}/skip-workout`, {
      method: 'POST',
      body: JSON.stringify(workoutData)
    }),
    pause: (id) => this.request(`/plans/${id}/pause`, {
      method: 'POST'
    }),
    resume: (id) => this.request(`/plans/${id}/resume`, {
      method: 'POST'
    })
  };

  // PredefinedWorkout endpoints
  predefinedWorkouts = {
    list: () => this.request('/predefined-workouts'),
    get: (id) => this.request(`/predefined-workouts/${id}`),
    create: (data) => this.request('/predefined-workouts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/predefined-workouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/predefined-workouts/${id}`, {
      method: 'DELETE'
    }),
    rate: (id, rating) => this.request(`/predefined-workouts/${id}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating })
    }),
    complete: (id, data) => this.request(`/predefined-workouts/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    favorite: (id) => this.request(`/predefined-workouts/${id}/favorite`, {
      method: 'PUT'
    })
  };

  // Discipline endpoints
  disciplines = {
    list: () => this.request('/disciplines'),
    get: (id) => this.request(`/disciplines/${id}`),
    create: (data) => this.request('/disciplines', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/disciplines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/disciplines/${id}`, {
      method: 'DELETE'
    }),
    byCategory: (category) => this.request(`/disciplines/category/${category}`),
    search: (term) => this.request(`/disciplines/search/${term}`),
    exercises: async (id) => {
      const response = await this.request(`/disciplines/${id}/exercises`);
      // Backend returns { exercises: [...], pagination: {...} }
      return response.exercises || response;
    }
  };

  // WorkoutType endpoints
  workoutTypes = {
    list: () => this.request('/workout-types'),
    get: (id) => this.request(`/workout-types/${id}`),
    create: (data) => this.request('/workout-types', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/workout-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/workout-types/${id}`, {
      method: 'DELETE'
    }),
    recommendations: (userLevel) => this.request(`/workout-types/recommendations/${userLevel}`),
    byFitnessLevel: (level) => this.request(`/workout-types/fitness-level/${level}`),
    byGoal: (goal) => this.request(`/workout-types/goal/${goal}`)
  };

  // ExternalActivity endpoints
  externalActivities = {
    list: async () => {
      const response = await this.request('/external-activities');
      // Backend returns { activities: [...], pagination: {...} }
      return response.activities || response;
    },
    get: (id) => this.request(`/external-activities/${id}`),
    create: (data) => this.request('/external-activities', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/external-activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/external-activities/${id}`, {
      method: 'DELETE'
    }),
    stats: (days = 30) => this.request(`/external-activities/stats?days=${days}`),
    byDateRange: (startDate, endDate) => this.request(`/external-activities?startDate=${startDate}&endDate=${endDate}`),
    recent: (limit = 20) => this.request(`/external-activities/recent?limit=${limit}`),
    sportTypes: () => this.request('/external-activities/sport-types')
  };

  // Strava Integration endpoints
  strava = {
    getAuthUrl: () => this.request('/integrations/strava/authorize'),
    getStatus: () => this.request('/integrations/strava/status'),
    sync: (fullSync = false, days = 30) => this.request('/integrations/strava/sync', {
      method: 'POST',
      body: JSON.stringify({ fullSync, days })
    }),
    disconnect: (deleteActivities = false) => this.request(`/integrations/strava/disconnect?deleteActivities=${deleteActivities}`, {
      method: 'DELETE'
    })
  };

  // UserGoalProgress endpoints
  userGoalProgress = {
    list: () => this.request('/goals/user/progress'),
    get: (id) => this.request(`/goals/progress/${id}`),
    update: (id, data) => this.request(`/goals/progress/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  };

  // Progression endpoints
  progressions = {
    list: async () => {
      const response = await this.request('/progressions');
      return response.progressions || response;
    },
    get: (id) => this.request(`/progressions/${id}`),
    create: (data) => this.request('/progressions', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/progressions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/progressions/${id}`, {
      method: 'DELETE'
    }),
    // User progress actions
    start: (id) => this.request(`/progressions/${id}/start`, {
      method: 'POST'
    }),
    completeStep: (id, stepIndex, performance) => this.request(`/progressions/${id}/steps/${stepIndex}/complete`, {
      method: 'POST',
      body: JSON.stringify({ performance })
    }),
    updateProgress: (id, data) => this.request(`/progressions/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    getActive: () => this.request('/progressions/user/active')
  };

  // Calendar endpoints
  calendar = {
    list: async (startDate, endDate) => {
      const response = await this.request(`/calendar?startDate=${startDate}&endDate=${endDate}`);
      return response.events || response;
    },
    get: (id) => this.request(`/calendar/${id}`),
    today: async () => {
      const response = await this.request('/calendar/today');
      return response.events || response;
    },
    create: (data) => this.request('/calendar', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/calendar/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/calendar/${id}`, {
      method: 'DELETE'
    }),
    move: (id, newDate) => this.request(`/calendar/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ newDate })
    }),
    startWorkout: (id) => this.request(`/calendar/${id}/start`, {
      method: 'POST'
    }),
    completeWorkout: (id, data) => this.request(`/calendar/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),
    skipWorkout: (id, reason) => this.request(`/calendar/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
  };

  // Feedback endpoints
  feedback = {
    submit: (data) => this.request('/feedback', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    list: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return this.request(`/feedback${queryString ? `?${queryString}` : ''}`);
    },
    stats: () => this.request('/feedback/stats'),
    update: (id, data) => this.request(`/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/feedback/${id}`, {
      method: 'DELETE'
    }),
    bulkUpdate: (ids, status, adminNotes) => this.request('/feedback/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status, adminNotes })
    }),
    // Conversation feedback endpoints
    listConversations: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return this.request(`/feedback/conversations${queryString ? `?${queryString}` : ''}`);
    },
    updateConversationStatus: (conversationId, messageIndex, status) => this.request('/feedback/conversations/status', {
      method: 'PATCH',
      body: JSON.stringify({ conversationId, messageIndex, status })
    }),
    bulkUpdateConversations: (items, status) => this.request('/feedback/conversations/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ items, status })
    }),
    // Report generation
    generateReport: (siteFeedbackIds, conversationFeedbacks) => this.request('/feedback/report', {
      method: 'POST',
      body: JSON.stringify({ siteFeedbackIds, conversationFeedbacks })
    }),
    // LLM Analysis
    analyze: (siteFeedbacks, conversationFeedbacks) => this.request('/feedback/analyze', {
      method: 'POST',
      body: JSON.stringify({ siteFeedbacks, conversationFeedbacks })
    }),
    // Get full conversation
    getConversation: (conversationId) => this.request(`/feedback/conversation/${conversationId}`)
  };

  // Memories endpoints (Sensei memory system)
  memories = {
    list: async (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.request(`/memories${queryString ? `?${queryString}` : ''}`);
      return response.memories || response;
    },
    getActive: async () => {
      const response = await this.request('/memories/active');
      return response.memories || response;
    },
    create: (data) => this.request('/memories', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    toggle: (id) => this.request(`/memories/${id}/toggle`, {
      method: 'PATCH'
    }),
    delete: (id) => this.request(`/memories/${id}`, {
      method: 'DELETE'
    })
  };

  // Workout Logs endpoints (completed workouts from TrainNow)
  workoutLogs = {
    list: async (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.request(`/workout-logs${queryString ? `?${queryString}` : ''}`);
      return response.logs || response;
    },
    get: async (id) => {
      const response = await this.request(`/workout-logs/${id}`);
      return response.log || response;
    },
    stats: async (days = 30) => {
      const response = await this.request(`/workout-logs/stats?days=${days}`);
      return response.stats || response;
    },
    create: (data) => this.request('/workout-logs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => this.request(`/workout-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id) => this.request(`/workout-logs/${id}`, {
      method: 'DELETE'
    })
  };

  // Admin Jobs endpoints
  adminJobs = {
    runCalendarConsistency: () => this.request('/admin/jobs/calendar-consistency', {
      method: 'POST'
    }),
    runCalendarConsistencyForUser: (userId) => this.request(`/admin/jobs/calendar-consistency/user/${userId}`, {
      method: 'POST'
    })
  };

  // Alias endpoints for naming compatibility
  trainingPlans = this.plans;  // TrainingPlan -> Plan
  workoutTemplates = this.predefinedWorkouts;  // WorkoutTemplate -> PredefinedWorkout
}

// Export singleton instance
export const apiService = new APIService();
export default apiService;