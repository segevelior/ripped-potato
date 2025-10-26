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
  findById: async (id) => {
    try {
      return normalizeId(await apiService.exercises.get(id));
    } catch {
      const list = await Exercise.list();
      return list.find(e => e.id === id || e._id === id);
    }
  }
};

// Workout entity
export const Workout = {
  list: async () => normalizeArray(await apiService.workouts.list()),
  create: async (data) => normalizeId(await apiService.workouts.create(data)),
  update: async (id, data) => normalizeId(await apiService.workouts.update(id, data)),
  delete: async (id) => apiService.workouts.delete(id),
  findById: async (id) => {
    try {
      return normalizeId(await apiService.workouts.get(id));
    } catch {
      const list = await Workout.list();
      return list.find(w => w.id === id || w._id === id);
    }
  }
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
  create: async (data) => normalizeId(await apiService.externalActivities.create(data))
};

// ProgressionPath - stub for now (not in backend yet)
export const ProgressionPath = {
  list: async () => [],
  create: async (data) => ({ ...data, id: Date.now().toString() })
};

// Aliases for compatibility
export const TrainingPlan = Plan;
export const WorkoutTemplate = PredefinedWorkout;
export const UserTrainingPattern = {
  list: async () => []
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