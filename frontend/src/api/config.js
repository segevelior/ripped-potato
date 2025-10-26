/**
 * API Configuration
 * Controls whether to use mock SDK (localStorage) or real API (MongoDB)
 */

// Get API mode from environment variable or default to 'real' for MongoDB
export const API_MODE = import.meta.env.VITE_API_MODE || 'real';

export const shouldUseMockAPI = () => {
  return API_MODE === 'mock';
};

export const shouldUseRealAPI = () => {
  return API_MODE === 'real';
};

// Log current mode only in development
if (import.meta.env.DEV) {
  console.log(`🔄 API Mode: ${API_MODE.toUpperCase()} (${shouldUseMockAPI() ? 'Using localStorage' : 'Using MongoDB'})`);
}

export default {
  API_MODE,
  shouldUseMockAPI,
  shouldUseRealAPI
};