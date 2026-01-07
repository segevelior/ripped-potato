/**
 * Document Upload API Service
 * Handles file uploads for AI document processing (PDFs and images)
 */

const API_BASE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8001';
const UPLOAD_TIMEOUT_MS = 60000; // 60 seconds for large file uploads

/**
 * Upload a document for AI processing
 * @param {File} file - The file to upload (PDF or image)
 * @param {string} extractionPrompt - What to extract/analyze from the document
 * @returns {Promise<{success: boolean, file_content: object, prompt: string, metadata: object}>}
 */
export async function uploadDocument(file, extractionPrompt) {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('Authentication required');
  }

  const formData = new FormData();
  formData.append('file', file);

  const params = new URLSearchParams({ extraction_prompt: extractionPrompt });

  // Add timeout for large file uploads
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/documents/upload?${params}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Note: Don't set Content-Type for FormData - browser sets it with boundary
        },
        body: formData,
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail || `Upload failed: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Upload timed out. Please try a smaller file or check your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default { uploadDocument };
