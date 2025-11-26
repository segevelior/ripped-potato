/**
 * Enhanced FloatingAIAssistant with streaming support
 * Minimal implementation - can switch between streaming and non-streaming
 */

import React, { useState, useEffect, useRef } from "react";
import { User } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";
import { Bot, X, Send, MessageCircle, Loader2, Minimize2, Maximize2, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { ToolExecutionMarker } from "@/components/ToolExecutionMarker";

export default function FloatingAIAssistantStreaming() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 620 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState(null);
  const [useStreaming, setUseStreaming] = useState(true); // Toggle for streaming mode
  const [authToken, setAuthToken] = useState(null);

  const dragRef = useRef({ startX: 0, startY: 0 });
  const chatEndRef = useRef(null);

  // Streaming hook
  const { isStreaming, streamingMessage, activeTools, completedTools, sendStreamingMessage } = useStreamingChat();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await User.me();
        setUser(userData);

        // Get auth token from localStorage
        const token = localStorage.getItem('authToken');
        setAuthToken(token);

        // Load floating chat history
        const savedMessages = localStorage.getItem('floatingChatHistory');
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages));
        } else {
          setMessages([{
            role: "assistant",
            content: `Hi ${userData.full_name}! I'm your Sensei with streaming support! Ask me anything!`
          }]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUser();

    // Listen for external prompts
    const handleOpenChat = (event) => {
      setIsOpen(true);
      if (event.detail?.prompt) {
        setInput(event.detail.prompt);
      }
    };

    document.addEventListener('open-ai-chat', handleOpenChat);

    return () => {
      document.removeEventListener('open-ai-chat', handleOpenChat);
    };
  }, []);

  useEffect(() => {
    // Save floating chat history
    if (messages.length > 0) {
      localStorage.setItem('floatingChatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll to bottom when messages change or streaming updates
  useEffect(() => {
    // Use instant scroll during streaming to avoid jumpy behavior
    // Use smooth scroll when not streaming for better UX
    const behavior = isStreaming ? "instant" : "smooth";
    chatEndRef.current?.scrollIntoView({ behavior });
  }, [messages, streamingMessage, isStreaming]);

  // Update messages when streaming completes
  useEffect(() => {
    if (!isStreaming && streamingMessage) {
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === "assistant" && lastMessage.isStreaming) {
          // Update the streaming message to final
          const updatedMessages = [...prev];
          updatedMessages[updatedMessages.length - 1] = {
            role: "assistant",
            content: streamingMessage,
            isStreaming: false
          };
          return updatedMessages;
        }
        return prev;
      });
    }
  }, [isStreaming, streamingMessage]);

  // Dragging functionality (keeping existing code)
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX - position.x,
      startY: e.clientY - position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;

      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 400, newX)),
        y: Math.max(0, Math.min(window.innerHeight - 600, newY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const getCurrentPageContext = () => {
    const currentPath = window.location.pathname;

    let context = {
      current_page: currentPath,
      page_description: "",
      available_actions: []
    };

    if (currentPath.includes('/Dashboard')) {
      context.page_description = "User is on the Dashboard viewing workout stats";
      context.available_actions = ["view active goals", "see recent workouts"];
    } else if (currentPath.includes('/Exercises')) {
      context.page_description = "User is browsing the exercise database";
      context.available_actions = ["create new exercises", "view exercise details"];
    }
    // Add more as needed...

    return context;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isThinking || isStreaming) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");

    if (useStreaming && authToken) {
      // Streaming mode
      setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

      try {
        const finalMessage = await sendStreamingMessage(currentInput, authToken);
        // Message will be updated via useEffect when streaming completes
      } catch (error) {
        console.error("[FloatingAIAssistantStreaming] Streaming error:", error);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Sorry, there was an error with streaming. Please try again."
        }]);
      }
    } else {
      // Non-streaming mode (fallback)
      setIsThinking(true);

      try {
        const pageContext = getCurrentPageContext();
        const userContext = user ? {
          name: user.full_name,
          current_page: pageContext.current_page,
          page_info: pageContext.page_description
        } : {};

        const prompt = `Context: ${JSON.stringify(userContext)}
User asks: ${currentInput}
Provide a helpful, concise response.`;

        const result = await InvokeLLM({ prompt });

        const assistantMessage = {
          role: "assistant",
          content: result.response || "I'm here to help! Could you please rephrase your question?"
        };

        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        console.error("Error sending message:", error);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again."
        }]);
      } finally {
        setIsThinking(false);
      }
    }
  };

  const clearChat = () => {
    setMessages([{
      role: "assistant",
      content: `Chat cleared. How can I help you today?`
    }]);
    localStorage.removeItem('floatingChatHistory');
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:block fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full p-4 shadow-lg hover:scale-110 transition-transform z-50"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      className={`hidden md:block fixed bg-white dark:bg-gray-900 rounded-lg shadow-2xl z-50 transition-all ${isMinimized ? 'h-14' : 'h-[600px]'
        } w-[400px]`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {/* Header */}
      <div
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 rounded-t-lg cursor-move flex items-center justify-between"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="Sensei" className="h-6 w-6 object-contain" />
          </div>
          <span className="font-semibold">Sensei</span>
          {useStreaming && (
            <div className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded">
              <Zap className="h-3 w-3" />
              <span>Streaming</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseStreaming(!useStreaming)}
            className="hover:bg-white/20 p-1 rounded"
            title={useStreaming ? "Switch to normal mode" : "Switch to streaming mode"}
          >
            <Zap className={`h-4 w-4 ${useStreaming ? 'fill-white' : ''}`} />
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="hover:bg-white/20 p-1 rounded"
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:bg-white/20 p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="h-[490px] overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`${msg.role === "user"
                    ? "text-right"
                    : "text-left"
                  }`}
              >
                <div
                  className={`inline-block p-3 rounded-lg max-w-[85%] ${msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}
                >
                  {msg.role === "assistant" && msg.isStreaming ? (
                    <div>
                      <ReactMarkdown
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          'tool-executing': ({ children }) => (
                            <ToolExecutionMarker isComplete={false}>{children}</ToolExecutionMarker>
                          ),
                          'tool-complete': ({ children }) => (
                            <ToolExecutionMarker isComplete={true}>{children}</ToolExecutionMarker>
                          ),
                        }}
                      >
                        {streamingMessage || "..."}
                      </ReactMarkdown>
                      {isStreaming && <span className="inline-block animate-pulse">▊</span>}
                    </div>
                  ) : (
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        'tool-executing': ({ children }) => (
                          <ToolExecutionMarker isComplete={false}>{children}</ToolExecutionMarker>
                        ),
                        'tool-complete': ({ children }) => (
                          <ToolExecutionMarker isComplete={true}>{children}</ToolExecutionMarker>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {/* Tool execution is now inline within the message using custom HTML tags */}
            {isThinking && (
              <div className="text-left">
                <div className="inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="border-t p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                disabled={isThinking || isStreaming}
              />
              <button
                type="submit"
                disabled={isThinking || isStreaming || !input.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isThinking || isStreaming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="flex justify-between mt-2">
              <button
                type="button"
                onClick={clearChat}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear Chat
              </button>
              {authToken ? (
                <span className="text-xs text-green-600">Connected</span>
              ) : (
                <span className="text-xs text-orange-500">Using fallback mode</span>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}