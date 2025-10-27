/**
 * MINIMAL POC - Chat with Streaming and Reasoning
 * Shows AI's thinking process as it works through requests
 */

import React, { useState, useEffect, useRef } from "react";
import { User } from "@/api/entities";
import { Bot, Send, Loader2, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useStreamingChat } from "@/hooks/useStreamingChat";

export default function ChatWithStreaming() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState(null);
  const [useStreaming, setUseStreaming] = useState(true);
  const [authToken, setAuthToken] = useState(null);
  const messagesEndRef = useRef(null);

  // Streaming hook
  const { isStreaming, streamingMessage, sendStreamingMessage } = useStreamingChat();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await User.me();
        setUser(userData);

        // Get auth token
        const token = localStorage.getItem('authToken');
        setAuthToken(token);
        console.log('[ChatWithStreaming] Auth token loaded:', token ? 'YES' : 'NO');

        // Load chat history
        const savedMessages = localStorage.getItem('chatHistory');
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages));
        } else {
          setMessages([{
            role: "assistant",
            content: `Hi ${userData.full_name}! I'm your AI fitness coach with reasoning capabilities. 
            
When you ask me to create workouts or analyze exercises, I'll show you my thinking process step by step. Try asking me something like:
- "Create a 15 minute core workout"
- "Help me build a workout plan for next week"
- "What exercises are good for beginners?"

I'll walk you through my reasoning as I work on your request!`
          }]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUser();
  }, []);

  useEffect(() => {
    // Save chat history
    if (messages.length > 0) {
      localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isThinking || isStreaming) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");

    console.log('[ChatWithStreaming] handleSendMessage called');
    console.log('[ChatWithStreaming] useStreaming:', useStreaming);
    console.log('[ChatWithStreaming] authToken exists:', !!authToken);
    console.log('[ChatWithStreaming] Condition check (useStreaming && authToken):', useStreaming && authToken);

    if (useStreaming && authToken) {
      // Streaming mode - show reasoning steps
      console.log('[ChatWithStreaming] ✅ Using STREAMING mode - calling /api/v1/ai/stream');
      setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

      try {
        await sendStreamingMessage(currentInput, authToken);
      } catch (error) {
        console.error("[ChatWithStreaming] Streaming error:", error);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Sorry, there was an error with streaming. Please try again."
        }]);
      }
    } else {
      // Non-streaming mode
      console.log('[ChatWithStreaming] ❌ Using NON-STREAMING fallback - calling InvokeLLM');
      console.log('[ChatWithStreaming] Reason: useStreaming=' + useStreaming + ', authToken=' + !!authToken);
      setIsThinking(true);

      try {
        const prompt = `User asks: ${currentInput}
        Provide a helpful, detailed response about fitness and training.`;

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
      content: "Chat cleared. How can I help you with your fitness journey today?"
    }]);
    localStorage.removeItem('chatHistory');
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Coach Chat</h1>
              <p className="text-sm text-gray-500">
                {useStreaming ? "Streaming mode with reasoning" : "Standard mode"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseStreaming(!useStreaming)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                useStreaming 
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title={useStreaming ? "Streaming enabled" : "Streaming disabled"}
            >
              <Zap className={`h-4 w-4 ${useStreaming ? 'fill-current' : ''}`} />
              <span className="text-sm font-medium">
                {useStreaming ? 'Streaming ON' : 'Streaming OFF'}
              </span>
            </button>
            <button
              onClick={clearChat}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="text-sm font-medium">Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="flex gap-3 max-w-[70%]">
              {message.role === "assistant" && (
                <div className="flex-shrink-0 mt-1">
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                </div>
              )}
              <div
                className={`px-4 py-2.5 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white border shadow-sm"
                }`}
              >
                {message.role === "assistant" && message.isStreaming ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{streamingMessage || "..."}</ReactMarkdown>
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-1" />
                    )}
                  </div>
                ) : (
                  <div className={`${message.role === "assistant" ? "prose prose-sm max-w-none" : ""}`}>
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0 mt-1">
                  <div className="bg-gray-200 p-2 rounded-lg">
                    <MessageCircle className="h-5 w-5 text-gray-600" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="bg-white border shadow-sm px-4 py-2.5 rounded-lg">
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t bg-white px-6 py-4">
        <form onSubmit={handleSendMessage}>
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                useStreaming 
                  ? "Ask me to create a workout and I'll show you my thinking process..."
                  : "Type your message..."
              }
              className="flex-1 px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              disabled={isThinking || isStreaming}
            />
            <button
              type="submit"
              disabled={isThinking || isStreaming || !input.trim()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isThinking || isStreaming ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{isStreaming ? "Streaming" : "Processing"}</span>
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
          {authToken ? (
            <p className="text-xs text-gray-500 mt-2">
              {useStreaming && <Sparkles className="inline h-3 w-3 mr-1" />}
              {useStreaming 
                ? "Streaming enabled - I'll show my reasoning as I work through your request"
                : "Standard mode - Quick responses without reasoning steps"}
            </p>
          ) : (
            <p className="text-xs text-orange-500 mt-2">
              Using fallback mode - streaming not available
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
