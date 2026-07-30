/**
 * MongoDB Entity Wrappers - Minimal POC
 * Direct connection to MongoDB backend
 */

import apiService from '../services/api';

// Helper to convert MongoDB _id to id
const normalizeId = (item) => {
  if (!item) return item;
  if (item._id) {
    item.id = item._id;
  }
  return item;
};

const normalizeArray = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeId);
};

// Exercise entity
export const Exercise = {
  list: async () => {
    const data = await apiService.exercises.list();
    return normalizeArray(data);
  },
  create: async (data) => normalizeId(await apiService.exercises.create(data)),
  update: async (id, data) => normalizeId(await apiService.exercises.update(id, data)),
  delete: async (id) => apiService.exercises.delete(id),
  get: async (id) => {
    try {
      return normalizeId(await apiService.exercises.get(id));
    } catch {
      const data = await apiService.exercises.list();
      const list = normalizeArray(data);
      return list.find(e => e.id === id || e._id === id);
    }
  },
  findById: async (id) => Exercise.get(id),
  // Semantically similar exercises (swap/alternative suggestions) via vector search.
  // Never throws — the callers use this on modal open and a failure must not crash the app.
  similar: async (id, limit) => {
    try {
      return normalizeArray(await apiService.exercises.similar(id, limit));
    } catch (error) {
      console.error('Exercise.similar error:', error);
      return [];
    }
  },
  toggleFavorite: async (id, isFavorite) => apiService.exercises.toggleFavorite(id, isFavorite),
  customize: async (id, modifications) => apiService.exercises.customize(id, modifications),
  removeCustomization: async (id) => apiService.exercises.removeCustomization(id)
};

// Goal entity
export const Goal = {
  list: async () => normalizeArray(await apiService.goals.list()),
  create: async (data) => normalizeId(await apiService.goals.create(data)),
  update: async (id, data) => normalizeId(await apiService.goals.update(id, data)),
  delete: async (id) => apiService.goals.delete(id),
  start: async (id) => apiService.goals.start(id),
  progress: async () => normalizeArray(await apiService.goals.progress())
};

// Plan entity
export const Plan = {
  list: async () => normalizeArray(await apiService.plans.list()),
  create: async (data) => normalizeId(await apiService.plans.create(data)),
  update: async (id, data) => normalizeId(await apiService.plans.update(id, data)),
  delete: async (id) => apiService.plans.delete(id),
  active: async () => normalizeArray(await apiService.plans.active())
};

// SessionTemplate entity
export const SessionTemplate = {
  list: async (params = {}) => normalizeArray(await apiService.sessionTemplates.list(params)),
  create: async (data) => normalizeId(await apiService.sessionTemplates.create(data)),
  update: async (id, data) => normalizeId(await apiService.sessionTemplates.update(id, data)),
  delete: async (id) => apiService.sessionTemplates.delete(id)
};

// UserGoalProgress entity
export const UserGoalProgress = {
  list: async () => normalizeArray(await apiService.userGoalProgress.list()),
  update: async (id, data) => normalizeId(await apiService.userGoalProgress.update(id, data))
};

// Discipline entity
export const Discipline = {
  list: async () => normalizeArray(await apiService.disciplines.list())
};

// SessionType entity
export const SessionType = {
  list: async () => normalizeArray(await apiService.sessionTypes.list())
};

// ExternalActivity entity
export const ExternalActivity = {
  list: async () => normalizeArray(await apiService.externalActivities.list()),
  get: async (id) => normalizeId(await apiService.externalActivities.get(id)),
  create: async (data) => normalizeId(await apiService.externalActivities.create(data)),
  byDateRange: async (startDate, endDate) => {
    const response = await apiService.externalActivities.byDateRange(startDate, endDate);
    return normalizeArray(response.data?.activities || response.activities || response);
  },
  stats: async (days = 30) => apiService.externalActivities.stats(days),
  recent: async (limit = 20) => normalizeArray(await apiService.externalActivities.recent(limit)),
  sportTypes: async () => apiService.externalActivities.sportTypes()
};

// Strava Integration entity
export const StravaIntegration = {
  getAuthUrl: async () => {
    const response = await apiService.strava.getAuthUrl();
    const data = response.data || response;
    // Normalize the response - backend returns authorizationUrl, frontend expects url
    return { url: data.authorizationUrl || data.url, state: data.state };
  },
  getStatus: async () => {
    const response = await apiService.strava.getStatus();
    // apiService already extracts data.data, so response is the status object directly
    return response;
  },
  sync: async (fullSync = false, days = 30) => {
    const response = await apiService.strava.sync(fullSync, days);
    // apiService already extracts data.data, so response is the sync result directly
    return response;
  },
  disconnect: async (deleteActivities = false) => apiService.strava.disconnect(deleteActivities)
};

// ProgressionPath - stub for now (not in backend yet)
export const ProgressionPath = {
  list: async () => [],
  create: async (data) => ({ ...data, id: Date.now().toString() })
};

// CalendarEvent entity
export const CalendarEvent = {
  list: async (startDate, endDate) => normalizeArray(await apiService.calendar.list(startDate, endDate)),
  get: async (id) => normalizeId(await apiService.calendar.get(id)),
  today: async () => normalizeArray(await apiService.calendar.today()),
  create: async (data) => normalizeId(await apiService.calendar.create(data)),
  update: async (id, data) => normalizeId(await apiService.calendar.update(id, data)),
  delete: async (id) => apiService.calendar.delete(id),
  move: async (id, newDate) => normalizeId(await apiService.calendar.move(id, newDate)),
  startSession: async (id) => apiService.calendar.startSession(id),
  completeSession: async (id, data) => apiService.calendar.completeSession(id, data),
  skipSession: async (id, reason) => apiService.calendar.skipSession(id, reason)
};

// SessionLog entity (completed sessions from TrainNow)
export const SessionLog = {
  list: async (params) => normalizeArray(await apiService.sessionLogs.list(params)),
  get: async (id) => normalizeId(await apiService.sessionLogs.get(id)),
  stats: async (days) => apiService.sessionLogs.stats(days),
  create: async (data) => normalizeId(await apiService.sessionLogs.create(data)),
  update: async (id, data) => normalizeId(await apiService.sessionLogs.update(id, data)),
  delete: async (id) => apiService.sessionLogs.delete(id)
};

// Aliases for compatibility
export const TrainingPlan = Plan;
export const UserTrainingPattern = {
  list: async () => []
};

// Feedback entity (submission opens a Linear issue server-side; no Mongo storage)
export const Feedback = {
  submit: async (data) => apiService.feedback.submit(data)
};

// User/Auth entity
export const User = {
  me: async () => {
    try {
      return await apiService.auth.me();
    } catch {
      return null;
    }
  },
  signIn: async (email, password) => apiService.auth.login(email, password),
  signOut: async () => apiService.auth.logout(),
  getCurrentUser: async () => User.me()
};