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
  toggleFavorite: async (id, isFavorite) => apiService.exercises.toggleFavorite(id, isFavorite),
  customize: async (id, modifications) => apiService.exercises.customize(id, modifications),
  removeCustomization: async (id) => apiService.exercises.removeCustomization(id)
};

// Workout entity
export const Workout = {
  list: async () => normalizeArray(await apiService.workouts.list()),
  create: async (data) => normalizeId(await apiService.workouts.create(data)),
  update: async (id, data) => normalizeId(await apiService.workouts.update(id, data)),
  delete: async (id) => apiService.workouts.delete(id),
  get: async (id) => {
    try {
      return normalizeId(await apiService.workouts.get(id));
    } catch {
      const list = await Workout.list();
      return list.find(w => w.id === id || w._id === id);
    }
  },
  findById: async (id) => Workout.get(id)
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

// PredefinedWorkout entity
export const PredefinedWorkout = {
  list: async () => normalizeArray(await apiService.predefinedWorkouts.list()),
  create: async (data) => normalizeId(await apiService.predefinedWorkouts.create(data)),
  update: async (id, data) => normalizeId(await apiService.predefinedWorkouts.update(id, data)),
  delete: async (id) => apiService.predefinedWorkouts.delete(id)
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

// WorkoutType entity
export const WorkoutType = {
  list: async () => normalizeArray(await apiService.workoutTypes.list())
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
  startWorkout: async (id) => apiService.calendar.startWorkout(id),
  completeWorkout: async (id, data) => apiService.calendar.completeWorkout(id, data),
  skipWorkout: async (id, reason) => apiService.calendar.skipWorkout(id, reason)
};

// Aliases for compatibility
export const TrainingPlan = Plan;
export const WorkoutTemplate = PredefinedWorkout;
export const UserTrainingPattern = {
  list: async () => []
};

// Feedback entity
export const Feedback = {
  submit: async (data) => normalizeId(await apiService.feedback.submit(data)),
  list: async (params) => {
    const response = await apiService.feedback.list(params);
    return {
      feedbacks: normalizeArray(response.feedbacks || []),
      pagination: response.pagination
    };
  },
  stats: async () => apiService.feedback.stats(),
  update: async (id, data) => normalizeId(await apiService.feedback.update(id, data)),
  delete: async (id) => apiService.feedback.delete(id)
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