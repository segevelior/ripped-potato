/**
 * Minimal hook for streaming chat with AI coach service
 * Supports token streaming via Server-Sent Events (SSE)
 * Shows AI reasoning steps naturally through the response
 */

import { useState, useCallback } from 'react';

// Use the backend API URL (Node.js backend which proxies to AI Coach service)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [reasoningSteps, setReasoningSteps] = useState([]);
  const [activeTools, setActiveTools] = useState([]); // Track currently executing tools
  const [completedTools, setCompletedTools] = useState([]); // Track completed tools with their messages

  const sendStreamingMessage = useCallback(async (message, authToken) => {
    setIsStreaming(true);
    setStreamingMessage('');
    setReasoningSteps([]);
    setActiveTools([]);
    setCompletedTools([]);

    try {
      // Call the Node.js backend which will proxy to Python AI Coach service
      const response = await fetch(`${API_BASE_URL}/api/v1/ai/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'x-stream': 'true'
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useStreamingChat] Response not ok:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedMessage = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6).trim();
            if (eventData) {
              try {
                const event = JSON.parse(eventData);

                if (event.type === 'token') {
                  accumulatedMessage += event.content || '';
                  setStreamingMessage(accumulatedMessage);
                } else if (event.type === 'tool_start') {
                  // Inject tool marker into the message stream
                  accumulatedMessage += `\n\n<tool-executing>${event.description}</tool-executing>\n\n`;
                  setStreamingMessage(accumulatedMessage);

                  // Also track in activeTools for the UI component
                  setActiveTools(prev => [...prev, {
                    tool: event.tool,
                    description: event.description,
                    status: 'running'
                  }]);
                } else if (event.type === 'tool_complete') {
                  // Update the tool marker in the message to show completion
                  accumulatedMessage = accumulatedMessage.replace(
                    `<tool-executing>${activeTools.find(t => t.tool === event.tool)?.description}</tool-executing>`,
                    `<tool-complete>${activeTools.find(t => t.tool === event.tool)?.description}</tool-complete>`
                  );
                  setStreamingMessage(accumulatedMessage);

                  // Mark tool as complete
                  setActiveTools(prev => prev.map(t =>
                    t.tool === event.tool
                      ? { ...t, status: event.success ? 'complete' : 'error' }
                      : t
                  ));
                } else if (event.type === 'reasoning') {
                  // Track reasoning steps separately if needed
                  setReasoningSteps(prev => [...prev, event.content]);
                } else if (event.type === 'complete') {
                  setIsStreaming(false);
                  // Don't clear tools - they stay visible as part of the conversation history
                } else if (event.type === 'error') {
                  console.error('[useStreamingChat] Stream error:', event.message);
                  setIsStreaming(false);
                }
              } catch (e) {
                console.error('[useStreamingChat] Error parsing SSE event:', e, 'Raw data:', eventData);
              }
            }
          }
        }
      }

      return accumulatedMessage;
    } catch (error) {
      console.error('Streaming error:', error);
      setIsStreaming(false);
      throw error;
    }
  }, []);

  return {
    isStreaming,
    streamingMessage,
    reasoningSteps,
    activeTools,
    completedTools,
    sendStreamingMessage
  };
}