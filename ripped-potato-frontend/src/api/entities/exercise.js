import { apiMethods } from '../client';

export const Exercise = {
  // List all exercises (with optional sorting)
  async list(sort = null, limit = null) {
    const params = {};
    if (sort) {
      // Convert Base44 sort format to our API format
      // "-created_date" -> sort_by: "created_date", sort_order: "desc"
      const isDesc = sort.startsWith('-');
      params.sort_by = isDesc ? sort.slice(1) : sort;
      params.sort_order = isDesc ? 'desc' : 'asc';
    }
    if (limit) {
      params.limit = limit;
    }

    // Use the search endpoint for listing
    const response = await apiMethods.post('/exercises/search', params);
    return response.data.results || [];
  },

  // Get single exercise by ID
  async get(id) {
    const response = await apiMethods.get(`/exercises/${id}`);
    return response.data;
  },

  // Find exercises with query (GraphQL-style search)
  async find(query = {}) {
    const response = await apiMethods.post('/exercises/search', query);
    return response.data.results || [];
  },

  // Find one exercise
  async findOne(query = {}) {
    const response = await apiMethods.post('/exercises/search', {
      ...query,
      limit: 1,
    });
    const results = response.data.results || [];
    return results[0] || null;
  },

  // Create new exercise
  async create(exerciseData) {
    const response = await apiMethods.post('/exercises', exerciseData);
    return response.data;
  },

  // Update exercise
  async update(id, exerciseData) {
    const response = await apiMethods.put(`/exercises/${id}`, exerciseData);
    return response.data;
  },

  // Delete exercise
  async delete(id) {
    await apiMethods.delete(`/exercises/${id}`);
    return true;
  },

  // Search exercises with advanced filters
  async search(searchParams) {
    const response = await apiMethods.post('/exercises/search', searchParams);
    return response.data;
  },
};

export default Exercise; 