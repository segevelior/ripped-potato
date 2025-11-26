import React, { useState, useEffect, useRef, useCallback } from "react";
import { User } from "@/api/entities";
import { Send, Loader2, Sparkles, Menu, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { ToolExecutionMarker } from "@/components/ToolExecutionMarker";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { FeedbackButtons } from "@/components/chat/FeedbackButtons";

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function ChatWithStreaming() {
  // Log for debugging auto-send feature
  console.log('🤖 ChatWithStreaming mounted!');
  console.log('🔍 Checking localStorage for pendingChatPrompt:', localStorage.getItem('pendingChatPrompt')?.substring(0, 50));

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
  const [pendingAutoSend, setPendingAutoSend] = useState(null); // For auto-sending messages from external sources

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const hasProcessedPendingRef = useRef(false); // To prevent double-processing

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

        // Check for pending prompt from localStorage (e.g., from WorkoutSelectionModal)
        // Do this after data is loaded and only once
        if (!hasProcessedPendingRef.current) {
          const storedPrompt = localStorage.getItem('pendingChatPrompt');
          const storedTime = localStorage.getItem('pendingChatPromptTime');

          console.log('📋 Checking localStorage for pending prompt:', {
            hasPrompt: !!storedPrompt,
            hasTime: !!storedTime,
            promptPreview: storedPrompt?.substring(0, 50)
          });

          if (storedPrompt && storedTime) {
            const promptAge = Date.now() - parseInt(storedTime, 10);
            console.log('⏱️ Prompt age:', promptAge, 'ms');

            // Only process if the prompt was set within the last 30 seconds
            if (promptAge < 30000) {
              console.log('✅ Found valid pending prompt, setting pendingAutoSend');
              hasProcessedPendingRef.current = true;
              // Clear localStorage immediately to prevent re-processing
              localStorage.removeItem('pendingChatPrompt');
              localStorage.removeItem('pendingChatPromptTime');
              setPendingAutoSend(storedPrompt);
            } else {
              console.log('⚠️ Prompt too old, cleaning up');
              localStorage.removeItem('pendingChatPrompt');
              localStorage.removeItem('pendingChatPromptTime');
            }
          }
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadUserAndHistory();
  }, []);

  // Process pending auto-send message (from WorkoutSelectionModal or other sources)
  useEffect(() => {
    const processPendingMessage = async () => {
      if (pendingAutoSend && authToken && !isStreaming && !isLoadingHistory) {
        console.log('🚀 Processing pending auto-send message:', pendingAutoSend.substring(0, 50) + '...');

        // Extract clean display message from the full prompt
        // The full prompt has context for AI, but we show a cleaner version to user
        let displayMessage = pendingAutoSend;
        const userInputMatch = pendingAutoSend.match(/Here's what I'm looking for: (.+?)(?:\n|Please)/s);
        if (userInputMatch) {
          displayMessage = userInputMatch[1].trim();
        } else if (pendingAutoSend.includes('[WORKOUT REQUEST')) {
          // If no specific input, show a generic message
          displayMessage = "Help me plan a workout for today";
        }

        // Add clean user message to UI
        const userMessage = { role: "user", content: displayMessage };
        setMessages(prev => [...prev, userMessage]);

        // Clear the pending message
        const messageToSend = pendingAutoSend;
        setPendingAutoSend(null);

        // Add placeholder for AI response
        setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

        try {
          const newConversationId = await sendStreamingMessage(
            messageToSend,
            authToken,
            currentConversationId
          );

          // If we started a new conversation, refresh history and set ID
          if (newConversationId && newConversationId !== currentConversationId) {
            setCurrentConversationId(newConversationId);
            fetchHistory(authToken);
          }
        } catch (error) {
          console.error("Error sending auto-message:", error);
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "Sorry, there was an error processing your request."
          }]);
        }
      }
    };

    processPendingMessage();
  }, [pendingAutoSend, authToken, isStreaming, isLoadingHistory, currentConversationId]);

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
    <div className="flex h-screen md:h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>
          <span className="font-semibold text-gray-900">Sensei</span>
        </div>
        <Link
          to="/"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5 text-sm text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
      </div>

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

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/20 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative w-full pt-14 md:pt-0">
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
                    Sensei
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
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Message Content */}
                    <div className={`
                      ${msg.role === 'user'
                        ? 'max-w-[85%] md:max-w-[70%] bg-gray-200 text-gray-900 rounded-2xl px-4 py-3'
                        : 'w-full'
                      }
                    `}>
                      {msg.role === 'assistant' ? (
                        <div>
                          <div className="prose prose-sm max-w-none
                              prose-p:my-2 prose-p:leading-relaxed
                              prose-headings:font-semibold prose-headings:text-gray-900
                              prose-h1:text-lg prose-h1:mt-4 prose-h1:mb-2
                              prose-h2:text-base prose-h2:mt-3 prose-h2:mb-2
                              prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
                              prose-strong:text-gray-900 prose-strong:font-semibold
                              prose-ul:my-2 prose-ul:pl-4
                              prose-ol:my-2 prose-ol:pl-4
                              prose-li:my-0.5 prose-li:leading-relaxed
                              prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 prose-pre:rounded-lg
                              prose-code:text-primary-600 prose-code:bg-primary-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
                              prose-a:text-primary-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                            ">
                            <ReactMarkdown
                              rehypePlugins={[rehypeRaw]}
                              components={{
                                'tool-executing': ({ children }) => (
                                  <ToolExecutionMarker isComplete={false}>{children}</ToolExecutionMarker>
                                ),
                                'tool-complete': ({ children }) => (
                                  <ToolExecutionMarker isComplete={true}>{children}</ToolExecutionMarker>
                                ),
                                h1: ({ children }) => (
                                  <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-100">
                                    {children}
                                  </h1>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mt-4 mb-2">
                                    <span className="w-1 h-4 bg-primary-500 rounded-full"></span>
                                    {children}
                                  </h2>
                                ),
                                h3: ({ children }) => (
                                  <h3 className="text-sm font-semibold text-gray-700 mt-3 mb-1.5">
                                    {children}
                                  </h3>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold text-gray-900">{children}</strong>
                                ),
                                ul: ({ children }) => (
                                  <ul className="my-2 ml-5 space-y-1.5 list-disc">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="my-2 ml-5 space-y-1.5 list-decimal">{children}</ol>
                                ),
                                li: ({ children }) => (
                                  <li className="text-gray-700 leading-relaxed">{children}</li>
                                ),
                                p: ({ children }) => (
                                  <p className="my-2 text-gray-700 leading-relaxed">{children}</p>
                                ),
                                a: ({ href, children }) => (
                                  <a href={href} className="text-primary-600 font-medium hover:underline" target="_blank" rel="noopener noreferrer">
                                    {children}
                                  </a>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-3 border-primary-300 pl-4 my-3 italic text-gray-600 bg-gray-50 py-2 rounded-r-lg">
                                    {children}
                                  </blockquote>
                                ),
                                hr: () => (
                                  <hr className="my-4 border-gray-200" />
                                ),
                                code: ({ inline, className, children }) => {
                                  if (inline) {
                                    return (
                                      <code className="px-1.5 py-0.5 bg-primary-50 text-primary-700 text-xs font-medium rounded">
                                        {children}
                                      </code>
                                    );
                                  }
                                  return (
                                    <code className={className}>
                                      {children}
                                    </code>
                                  );
                                },
                                pre: ({ children }) => (
                                  <pre className="my-3 p-4 bg-gray-50 border border-gray-200 rounded-xl overflow-x-auto text-sm">
                                    {children}
                                  </pre>
                                ),
                              }}
                            >
                              {msg.content || ""}
                            </ReactMarkdown>
                            {msg.isStreaming && !msg.content && (
                              <div className="flex items-center gap-1.5 py-1">
                                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
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
                placeholder="Message your Sensei..."
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
