
import React, { useState, useEffect, useRef } from "react";
import { User } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";
import { Bot, X, Send, MessageCircle, Loader2, Minimize2, Maximize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function FloatingAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 620 });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState(null);
  
  const dragRef = useRef({ startX: 0, startY: 0 });
  const chatEndRef = useRef(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        
        // Load floating chat history (separate from main chat)
        const savedMessages = localStorage.getItem('floatingChatHistory');
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages));
        } else {
          setMessages([{
            role: "assistant",
            content: `Hi ${userData.full_name}! I'm your floating AI Coach. I can help you quickly without leaving your current page. Ask me anything!`
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Dragging functionality
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
      context.page_description = "User is on the Dashboard viewing workout stats, active goals, and recent activities";
      context.available_actions = ["view active goals", "see recent workouts", "navigate to other pages"];
    } else if (currentPath.includes('/Calendar')) {
      context.page_description = "User is viewing the training Calendar with scheduled workouts";
      context.available_actions = ["add workouts to calendar", "move workouts", "view workout details"];
    } else if (currentPath.includes('/Goals')) {
      context.page_description = "User is browsing or managing their fitness Goals";
      context.available_actions = ["create new goals", "start tracking goals", "view goal progression"];
    } else if (currentPath.includes('/Plans')) {
      context.page_description = "User is viewing their training Plans";
      context.available_actions = ["create new plans", "edit existing plans", "activate plans"];
    } else if (currentPath.includes('/PredefinedWorkouts')) {
      context.page_description = "User is browsing predefined workout templates";
      context.available_actions = ["create workout templates", "apply workouts to calendar"];
    } else if (currentPath.includes('/Exercises')) {
      context.page_description = "User is browsing the exercise database";
      context.available_actions = ["create new exercises", "view exercise details"];
    }

    return context;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;

    const userMessage = { role: "user", content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    const currentInput = input;
    setInput("");
    setIsThinking(true);

    try {
      const pageContext = getCurrentPageContext();
      
      const contextSummary = `
        WEBSITE CONTEXT:
        Current page: ${pageContext.page_description}
        Available actions on this page: ${pageContext.available_actions.join(', ')}
        
        APP NAVIGATION:
        - Dashboard: /Dashboard (overview, stats, active goals)
        - Calendar: /Calendar (schedule workouts, view training plan)
        - Goals: /Goals (create/manage fitness goals) 
        - Plans: /Plans (create/manage training plans)
        - Train Now: /TrainNow (quick workout generation)
        - Predefined Workouts: /PredefinedWorkouts (workout templates)
        - Exercises: /Exercises (exercise database)
        - AI Coach: /Chat (full chat interface with history)
      `;

      const prompt = `You are an expert AI fitness coach floating assistant. You're helping the user while they're on a specific page of the app.

      CAPABILITIES:
      1. CREATE GOALS: When user wants to learn a skill, use "create_goal" action
      2. CREATE PLANS: When user wants a structured training program, use "create_plan" action  
      3. CREATE WORKOUTS: When user wants workout templates, use "create_predefined_workout" action
      4. NAVIGATION HELP: Guide users to the right pages
      5. CONTEXTUAL HELP: Provide help based on what page they're viewing

      Context: ${contextSummary}
      User's message: "${currentInput}"

      Provide helpful, concise responses since this is a floating window.`;
      
      const result = await InvokeLLM({
        prompt
        // Remove schema - let backend handle all logic
      });

      // Just display the message from the backend
      let assistantResponse = result.response || "I understand, but I'm not sure how to help with that specific request.";

      // All action handling is done in the backend
      // Frontend just displays the response

      setMessages(prev => [...prev, { role: "assistant", content: assistantResponse }]);

    } catch (error) {
      console.error("Error with floating AI:", error);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Sorry, I encountered an error. For complex requests, try the main AI Coach tab." 
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Don't show on the Chat page
  if (window.location.pathname.includes('/Chat')) {
    return null;
  }

  // Floating Button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group"
        aria-label="Open Floating AI Coach"
      >
        <Bot className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
        <div className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-20"></div>
      </button>
    );
  }

  // Floating Chat Window
  return (
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
      style={{
        left: position.x,
        top: position.y,
        width: '400px',
        height: isMinimized ? '60px' : '600px'
      }}
    >
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 cursor-move flex items-center justify-between flex-shrink-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <span className="font-medium">AI Coach (Floating)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.location.href = createPageUrl("Chat")}
            className="p-1 hover:bg-white/20 rounded transition-colors text-xs"
            title="Open full Chat tab"
          >
            📋
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <>
          {/* Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <ReactMarkdown className="prose prose-sm max-w-none">
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef}></div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 border-t bg-white flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Quick question... (Shift+Enter for new line)"
                disabled={isThinking}
                rows={1}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 resize-none min-h-[40px] max-h-[120px]"
                style={{
                  height: 'auto',
                  overflowY: input.includes('\n') || input.length > 60 ? 'auto' : 'hidden'
                }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
              <button 
                type="submit" 
                disabled={isThinking || !input.trim()} 
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
              >
                {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
