import { apiMethods } from './client';
import { setTokens, clearTokens } from './config';

export const auth = {
  // Register new user
  async register(userData) {
    const response = await apiMethods.post('/auth/register', userData);
    return response.data;
  },

  // Login user
  async login(email, password) {
    const response = await apiMethods.post('/auth/login', {
      username: email, // Backend expects username field
      password,
    });
    
    const { access_token, refresh_token, user } = response.data;
    setTokens(access_token, refresh_token);
    
    return { user, access_token, refresh_token };
  },

  // Logout user
  logout() {
    clearTokens();
    window.location.href = '/login';
  },

  // Get current user
  async getCurrentUser() {
    try {
      const response = await apiMethods.get('/auth/me');
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        clearTokens();
        return null;
      }
      throw error;
    }
  },

  // Refresh token
  async refreshToken(refreshToken) {
    const response = await apiMethods.post('/auth/refresh', {
      refresh_token: refreshToken,
    });
    
    const { access_token, refresh_token: newRefreshToken } = response.data;
    setTokens(access_token, newRefreshToken);
    
    return { access_token, refresh_token: newRefreshToken };
  },
};

export default auth; 