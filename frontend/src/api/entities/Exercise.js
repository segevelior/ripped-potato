/**
 * Exercise Entity Wrapper
 * Provides mock SDK-compatible interface for Exercise entity
 */

import { apiService } from '../../services/api';

export const Exercise = {
  async list() {
    try {
      const data = await apiService.exercises.list();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Exercise.list error:', error);
      return [];
    }
  },

  async find(query = {}) {
    try {
      const exercises = await this.list();

      // Apply query filters
      let results = [...exercises];
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
    } catch (error) {
      console.error('Exercise.find error:', error);
      return [];
    }
  },

  async findOne(query) {
    const results = await this.find(query);
    return results[0] || null;
  },

  async findById(id) {
    try {
      // Try to get from API directly if possible
      const exercise = await apiService.exercises.get(id);
      return exercise;
    } catch (error) {
      // Fallback to searching in list
      const exercises = await this.list();
      return exercises.find(e => e._id === id || e.id === id) || null;
    }
  },

  async create(data) {
    try {
      const exercise = await apiService.exercises.create(data);
      return exercise;
    } catch (error) {
      console.error('Exercise.create error:', error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      const exercise = await apiService.exercises.update(id, data);
      return exercise;
    } catch (error) {
      console.error('Exercise.update error:', error);
      throw error;
    }
  },

  async delete(id) {
    try {
      await apiService.exercises.delete(id);
      return true;
    } catch (error) {
      console.error('Exercise.delete error:', error);
      return false;
    }
  },

  async save(exercise) {
    if (exercise._id || exercise.id) {
      return this.update(exercise._id || exercise.id, exercise);
    } else {
      return this.create(exercise);
    }
  }
};

export default Exercise;