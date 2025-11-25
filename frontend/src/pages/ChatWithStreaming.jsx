import React, { useState, useEffect, useRef, useCallback } from "react";
import { User } from "@/api/entities";
import { Bot, Send, Loader2, Sparkles, User as UserIcon, Menu } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { ToolExecutionMarker } from "@/components/ToolExecutionMarker";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { FeedbackButtons } from "@/components/chat/FeedbackButtons";

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function ChatWithStreaming() {
  // State
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Closed by default

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Streaming hook
  const {
    isStreaming,
    streamingMessage,
    activeTools,
    completedTools,
    sendStreamingMessage
  } = useStreamingChat();

  // Initial Load
  useEffect(() => {
    const loadUserAndHistory = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        const token = localStorage.getItem('authToken');
        setAuthToken(token);

        if (token) {
          await fetchHistory(token);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadUserAndHistory();
  }, []);

  // Fetch Conversation History
  const fetchHistory = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/conversations/history?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  // Load Specific Conversation
  const loadConversation = async (conversationId) => {
    if (conversationId === currentConversationId) return;

    setIsLoadingConversation(true);
    setCurrentConversationId(conversationId);
    setMessages([]); // Clear current messages while loading

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/conversations/${conversationId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Transform backend messages to UI format
        const uiMessages = data.messages.map(msg => ({
          role: msg.role === 'human' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.timestamp
        }));
        setMessages(uiMessages);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    } finally {
      setIsLoadingConversation(false);
      // On mobile, close sidebar after selection
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    }
  };

  // Start New Chat
  const handleNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInput("");
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    // Focus input
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Delete Conversation
  const handleDeleteConversation = async (conversationId) => {
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      if (response.ok) {
        setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));
        if (currentConversationId === conversationId) {
          handleNewChat();
        }
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  // Send Message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");

    // Optimistic UI update for new conversation
    if (!currentConversationId) {
      // We'll let the streaming hook return the new ID
    }

    try {
      // Add placeholder for AI response
      setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

      const newConversationId = await sendStreamingMessage(
        currentInput,
        authToken,
        currentConversationId
      );

      // If we started a new conversation, refresh history and set ID
      if (newConversationId && newConversationId !== currentConversationId) {
        setCurrentConversationId(newConversationId);
        fetchHistory(authToken); // Refresh list to show new chat title
      }

    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, there was an error processing your request."
      }]);
    }
  };

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? "instant" : "smooth" });
  }, [messages, streamingMessage, isStreaming]);

  // Update streaming message in UI
  useEffect(() => {
    if (streamingMessage) {
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.content = streamingMessage;
        }
        return newMessages;
      });
    }
  }, [streamingMessage]);

  // Finalize streaming message
  useEffect(() => {
    if (!isStreaming && streamingMessage) {
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.isStreaming) {
          lastMsg.isStreaming = false;
          lastMsg.content = streamingMessage;
        }
        return newMessages;
      });
    }
  }, [isStreaming]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden">
      {/* Mobile Sidebar Toggle */}
      <button
        className="md:hidden fixed top-20 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-gray-200"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-40 h-full transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <ConversationSidebar
          conversations={conversations}
          currentId={currentConversationId}
          onSelect={loadConversation}
          onNewChat={handleNewChat}
          onDelete={handleDeleteConversation}
          isLoading={isLoadingHistory}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {messages.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                <div className="bg-primary-50 p-4 rounded-2xl">
                  <Sparkles className="h-12 w-12 text-primary-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    AI Fitness Coach
                  </h2>
                  <p className="text-gray-500 max-w-md">
                    I can help you create workouts, analyze your progress, and answer fitness questions.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                  {[
                    "Create a 30-min HIIT workout",
                    "How do I improve my squat form?",
                    "Plan a weekly schedule for me",
                    "Explain progressive overload"
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="p-3 text-sm text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Message List
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Assistant Avatar */}
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-8 w-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center shadow-sm">
                          <Bot className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    )}

                    {/* Message Bubble */}
                    <div className={`
                      max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3.5 shadow-sm
                      ${msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-none'
                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none shadow-sm'
                      }
                    `}>
                      {msg.role === 'assistant' ? (
                        <div>
                          <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200">
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
                              {msg.content || (msg.isStreaming ? "..." : "")}
                            </ReactMarkdown>
                            {msg.isStreaming && !msg.content && (
                              <span className="inline-block w-2 h-4 bg-primary-400 animate-pulse ml-1 align-middle" />
                            )}
                          </div>
                          {/* Feedback buttons - only show for completed AI messages */}
                          {!msg.isStreaming && msg.content && currentConversationId && (
                            <FeedbackButtons
                              conversationId={currentConversationId}
                              messageIndex={idx}
                              question={messages[idx - 1]?.content}
                              answer={msg.content}
                              authToken={authToken}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-gray-500" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-100 p-4 md:p-6">
          <div className="max-w-3xl mx-auto relative">
            <form onSubmit={handleSendMessage} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message your AI Coach..."
                className="w-full pl-5 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm text-gray-800 placeholder-gray-400"
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className={`
                  absolute right-2 top-2 bottom-2 p-2 rounded-xl flex items-center justify-center transition-all
                  ${!input.trim() || isStreaming
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow'
                  }
                `}
              >
                {isStreaming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </form>
            <div className="text-center mt-2">
              <p className="text-xs text-gray-400">
                AI can make mistakes. Check important info.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
