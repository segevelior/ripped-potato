/**
 * AI Service Layer
 * Direct connection to AI Coach Service for AI-powered features
 */

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8001';

class AIService {
  constructor() {
    this.baseURL = AI_SERVICE_URL;
  }

  async request(endpoint, options = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      if (import.meta.env.DEV) {
        console.log(`AI Service Request: ${options.method || 'GET'} ${url}`);
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
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
    return this.request('/api/v1/exercises/suggest', {
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
    const url = `${this.baseURL}/api/v1/exercises/suggest/stream`;

    if (import.meta.env.DEV) {
      console.log(`AI Service Stream Request: POST ${url}`);
    }

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    return this.request('/api/v1/progressions/suggest', {
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
    const url = `${this.baseURL}/api/v1/progressions/suggest/stream`;

    if (import.meta.env.DEV) {
      console.log(`AI Service Stream Request: POST ${url}`);
    }

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
