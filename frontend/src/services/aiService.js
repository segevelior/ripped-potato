/**
 * AI Service Layer
 * Routes through the Node.js backend which proxies to the AI Coach Service
 */

// Use the backend API URL (same as chat - proxied through Node.js backend)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class AIService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getAuthToken() {
    // Get auth token from localStorage (same pattern as other API calls)
    return localStorage.getItem('authToken');
  }

  async request(endpoint, options = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const token = this.getAuthToken();

      if (import.meta.env.DEV) {
        console.log(`AI Service Request: ${options.method || 'GET'} ${url}`);
      }

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
        throw new Error(data.detail || data.message || `AI Service Error: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      console.error('AI Service Error:', error);
      throw error;
    }
  }

  /**
   * Get AI-powered suggestions for exercise form fields
   * @param {string} name - Exercise name to get suggestions for
   * @returns {Promise<{suggestions: Object, confidence: number}>}
   */
  async suggestExercise(name) {
    return this.request('/api/v1/ai/exercises/suggest', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  /**
   * Stream AI-powered suggestions for exercise form fields
   * Each field is delivered as it becomes available via SSE
   * @param {string} name - Exercise name to get suggestions for
   * @param {function} onField - Callback called with {field, value} for each field
   * @param {function} onComplete - Callback called when streaming is complete
   * @param {function} onError - Callback called on error
   * @returns {function} Abort function to cancel the stream
   */
  streamSuggestExercise(name, onField, onComplete, onError) {
    const controller = new AbortController();
    const url = `${this.baseURL}/api/v1/ai/exercises/suggest/stream`;
    const token = this.getAuthToken();

    if (import.meta.env.DEV) {
      console.log(`AI Service Stream Request: POST ${url}`);
    }

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ name }),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`AI Service Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  onError?.(new Error(data.error));
                  return;
                }

                if (data.complete) {
                  onComplete?.();
                  return;
                }

                if (data.field && data.value !== undefined) {
                  onField?.(data.field, data.value);
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }

        onComplete?.();
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('AI Service Stream Error:', error);
          onError?.(error);
        }
      });

    // Return abort function
    return () => controller.abort();
  }

  /**
   * Get AI-powered suggestion for a complete progression path
   * @param {string} goalExercise - The target exercise to create a progression for
   * @param {string} currentLevel - User's current level (beginner/intermediate/advanced)
   * @param {string[]} availableEquipment - Available equipment
   * @returns {Promise<{suggestion: Object, confidence: number}>}
   */
  async suggestProgression(goalExercise, currentLevel = 'beginner', availableEquipment = []) {
    return this.request('/api/v1/ai/progressions/suggest', {
      method: 'POST',
      body: JSON.stringify({ goalExercise, currentLevel, availableEquipment })
    });
  }

  /**
   * Stream AI-powered progression suggestion
   * Each field is delivered as it becomes available via SSE
   * @param {string} goalExercise - The target exercise
   * @param {string} currentLevel - User's current level
   * @param {string[]} availableEquipment - Available equipment
   * @param {function} onField - Callback called with {field, value} for each field
   * @param {function} onComplete - Callback called when streaming is complete
   * @param {function} onError - Callback called on error
   * @returns {function} Abort function to cancel the stream
   */
  streamSuggestProgression(goalExercise, currentLevel, availableEquipment, onField, onComplete, onError) {
    const controller = new AbortController();
    const url = `${this.baseURL}/api/v1/ai/progressions/suggest/stream`;
    const token = this.getAuthToken();

    if (import.meta.env.DEV) {
      console.log(`AI Service Stream Request: POST ${url}`);
    }

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify({ goalExercise, currentLevel, availableEquipment }),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`AI Service Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.error) {
                  onError?.(new Error(data.error));
                  return;
                }

                if (data.complete) {
                  onComplete?.();
                  return;
                }

                if (data.field && data.value !== undefined) {
                  onField?.(data.field, data.value);
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }

        onComplete?.();
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('AI Service Stream Error:', error);
          onError?.(error);
        }
      });

    return () => controller.abort();
  }

  /**
   * Pre-fetch personalized chat suggestions and cache them in localStorage
   * Should be called after login to have suggestions ready when user opens chat
   * @param {string} token - Auth token (optional, uses stored token if not provided)
   * @returns {Promise<string[]>} Array of 4 suggestions
   */
  async prefetchChatSuggestions(token = null) {
    const authToken = token || this.getAuthToken();
    if (!authToken) {
      console.warn('No auth token available for prefetching suggestions');
      return null;
    }

    try {
      console.log('🔄 Pre-fetching personalized chat suggestions...');

      const response = await fetch(`${this.baseURL}/api/v1/suggestions`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.suggestions?.length === 4) {
          // Cache suggestions with timestamp
          localStorage.setItem('chatSuggestions', JSON.stringify({
            suggestions: data.suggestions,
            timestamp: Date.now()
          }));
          console.log('✨ Pre-fetched and cached suggestions:', data.suggestions);
          return data.suggestions;
        }
      }
      return null;
    } catch (error) {
      console.error('Error pre-fetching suggestions:', error);
      return null;
    }
  }

  /**
   * Get cached chat suggestions from localStorage
   * Returns null if cache is stale (older than 1 hour) or missing
   * @returns {string[]|null} Cached suggestions or null
   */
  getCachedSuggestions() {
    try {
      const cached = localStorage.getItem('chatSuggestions');
      if (!cached) return null;

      const { suggestions, timestamp } = JSON.parse(cached);
      const ONE_HOUR = 60 * 60 * 1000;

      // Check if cache is still fresh (less than 1 hour old)
      if (Date.now() - timestamp < ONE_HOUR && suggestions?.length === 4) {
        return suggestions;
      }

      // Cache is stale, clear it
      localStorage.removeItem('chatSuggestions');
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clear cached suggestions (call on logout)
   */
  clearCachedSuggestions() {
    localStorage.removeItem('chatSuggestions');
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
