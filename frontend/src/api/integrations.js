/**
 * Legacy API integration stubs for fallback when streaming is not available
 * These replace the old base44 SDK integrations with direct API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * InvokeLLM - Fallback non-streaming LLM invocation
 * @param {Object} params - Parameters object
 * @param {string} params.prompt - The prompt to send to the LLM
 * @returns {Promise<{response: string}>} The LLM response
 */
export async function InvokeLLM({ prompt }) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: prompt })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return { response: data.response || data.message || '' };
  } catch (error) {
    console.error('[InvokeLLM] Error:', error);
    return { response: 'Sorry, I encountered an error. Please try again.' };
  }
}

// Stub exports for other integrations (not used yet but kept for compatibility)
export const Core = {
  InvokeLLM
};

export const SendEmail = () => {
  throw new Error('SendEmail integration not implemented');
};

export const UploadFile = () => {
  throw new Error('UploadFile integration not implemented');
};

export const GenerateImage = () => {
  throw new Error('GenerateImage integration not implemented');
};

export const ExtractDataFromUploadedFile = () => {
  throw new Error('ExtractDataFromUploadedFile integration not implemented');
};
