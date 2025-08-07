import React, { useState, useEffect, useRef } from "react";
import { User, Workout, PredefinedWorkout, Goal, ProgressionPath, UserGoalProgress, Plan, TrainingPlan, UserTrainingPattern } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";
import { Bot, Send, RotateCcw, MessageCircle, Sparkles, Loader2, Calendar, TrendingUp, AlertCircle, FileText, Target, Dumbbell, Upload, Paperclip, Image, File, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format, startOfWeek, endOfWeek, isAfter, isBefore, parseISO, differenceInDays } from "date-fns";

// Enhanced schema that actually works for creating goals and plans
const planningSchema = {
  type: "object",  
  properties: {
    action: {
      type: "string",
      enum: ["clarify", "create_goal", "create_plan", "create_predefined_workout", "add_workout", "general_advice", "website_navigation"],
      description: "The primary action to take"
    },
    clarification_question: {
      type: "string",
      description: "Question to ask if more info is needed"
    },
    goal_to_create: {
      type: "object",
      properties: {
        name: { type: "string" },
        discipline: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        category: { type: "string", enum: ["skill", "performance", "endurance", "strength"] },
        icon: { type: "string" },
        difficulty_level: { type: "string", enum: ["beginner", "intermediate", "advanced", "elite"] },
        estimated_weeks: { type: "number" },
        prerequisites: { type: "array", items: { type: "string" } }
      }
    },
    plan_to_create: {
      type: "object", 
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        status: { type: "string", enum: ["draft", "active"] },
        linked_goals: { type: "array", items: { type: "string" } },
        linked_workouts: { type: "array", items: { type: "object" } }
      }
    },
    predefined_workout_to_create: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal: { type: "string" },
        primary_disciplines: { type: "array", items: { type: "string" } },
        estimated_duration: { type: "number" },
        difficulty_level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        blocks: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              name: { type: "string" },
              exercises: { 
                type: "array",
                items: {
                  type: "object", 
                  properties: {
                    exercise_id: { type: "string" },
                    exercise_name: { type: "string" },
                    volume: { type: "string" },
                    rest: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    workout_to_add: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string" },
        type: { type: "string" },
        duration_minutes: { type: "number" },
        exercises: { type: "array" }
      }
    },
    navigation_help: {
      type: "object",
      properties: {
        page_to_visit: { type: "string" },
        instructions: { type: "string" },
        specific_feature: { type: "string" }
      }
    },
    response: {
      type: "string",
      description: "Conversational response to the user"
    }
  },
  required: ["action", "response"]
};

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [debugInfo, setDebugInfo] = useState(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);
  const [userMemory, setUserMemory] = useState({
    primary_goals: [],
    training_days_per_week: null,
    preferred_disciplines: [],
    limitations_or_preferences: ""
  });
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        
        const [plansData, goalData, workoutData] = await Promise.all([
          TrainingPlan.filter({ is_active: true }),
          Goal.list(),
          PredefinedWorkout.list()
        ]);
        
        if (plansData.length > 0) setCurrentPlan(plansData[0]);
        setGoals(goalData);
        setPredefinedWorkouts(workoutData);
        
        // Load user memory from localStorage
        const savedMemory = localStorage.getItem('aiCoachMemory');
        if (savedMemory) {
          setUserMemory(JSON.parse(savedMemory));
        }
        
        // Load conversation history
        const savedMessages = localStorage.getItem('aiCoachHistory');
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages));
        } else {
          setMessages([{
            role: "assistant",
            content: `Hi ${userData.full_name}! I'm your AI Coach. I can help you create goals, build training plans, suggest workouts, and navigate the app. Try saying something like "I want to learn a handstand" or "Show me how to create a plan."`
          }]);
        }
        
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    
    loadData();
    
    // Listen for external prompts
    const handleOpenChat = (event) => {
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
    // Save conversation history
    if (messages.length > 0) {
      localStorage.setItem('aiCoachHistory', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    // Save user memory
    localStorage.setItem('aiCoachMemory', JSON.stringify(userMemory));
  }, [userMemory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getCurrentPageContext = () => {
    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    
    let context = {
      current_page: currentPath,
      page_description: "",
      available_actions: [],
      visible_data: {}
    };

    // Analyze current page and provide context
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
    if (!input.trim() || isThinking || isRateLimited) return;

    const userMessage = { role: "user", content: input };
    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    const currentInput = input;
    setInput("");
    setIsThinking(true);
    setDebugInfo(null);

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
        
        USER DATA:
        Current active plan: ${currentPlan ? `${currentPlan.name} (${currentPlan.goal})` : 'None'}
        Available Goals: ${goals.map(g => `"${g.name}"`).slice(0, 10).join(', ')}
        Available Predefined Workouts: ${predefinedWorkouts.map(p => `"${p.name}"`).slice(0, 10).join(', ')}

        User Memory:
        - Primary goals: ${userMemory.primary_goals.join(', ') || 'Not set'}
        - Training days per week: ${userMemory.training_days_per_week || 'Not specified'}
        - Preferred disciplines: ${userMemory.preferred_disciplines.join(', ') || 'Not specified'}
        - Limitations/preferences: ${userMemory.limitations_or_preferences || 'None noted'}

        Recent Conversation:
        ${currentMessages.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}
      `;

      const prompt = `You are an expert AI fitness coach with full access to this fitness app. You can see what page the user is on and help them navigate and use all features.

      CRITICAL CAPABILITIES:
      1. CREATE GOALS: When user wants to learn a skill (handstand, pull-up, etc), use "create_goal" action
      2. CREATE PLANS: When user wants a structured training program, use "create_plan" action  
      3. CREATE WORKOUTS: When user wants specific workout templates, use "create_predefined_workout" action
      4. NAVIGATION HELP: Guide users to the right pages and explain how to use features
      5. WEBSITE AWARENESS: You can see the current page and provide contextual help

      Context: ${contextSummary}
      User's message: "${currentInput}"

      Analyze what the user wants and take the appropriate action. If they want to build skills over time, create goals. If they want structured training, create plans. If they need navigation help, provide specific instructions.`;
      
      const result = await InvokeLLM({
        prompt,
        response_json_schema: planningSchema
      });

      setDebugInfo(result);
      let assistantResponse = result.response || "I understand, but I'm not sure how to help with that specific request.";

      // Handle different actions
      if (result.action === "create_goal" && result.goal_to_create) {
        try {
          const newGoal = await Goal.create(result.goal_to_create);
          assistantResponse += `\n\n✅ **Goal Created!** I've created "${result.goal_to_create.name}" for you. You can view it on the [Goals page](/Goals) and start tracking your progress.`;
          
          // Update user memory
          setUserMemory(prev => ({
            ...prev,
            primary_goals: [...prev.primary_goals, result.goal_to_create.name].slice(0, 5)
          }));
        } catch (error) {
          console.error("Error creating goal:", error);
          assistantResponse += "\n\n❌ I had trouble creating that goal. Please try again or create it manually on the Goals page.";
        }
      }

      if (result.action === "create_plan" && result.plan_to_create) {
        try {
          const newPlan = await Plan.create({
            ...result.plan_to_create,
            progress_metrics: {
              total_workouts: result.plan_to_create.linked_workouts?.length || 0,
              completed_workouts: 0,
              completion_percentage: 0,
              current_week: 1,
              streak_days: 0
            }
          });
          assistantResponse += `\n\n✅ **Plan Created!** I've created "${result.plan_to_create.name}" for you. You can view and activate it on the [Plans page](/Plans).`;
        } catch (error) {
          console.error("Error creating plan:", error);
          assistantResponse += "\n\n❌ I had trouble creating that plan. Please try again or create it manually on the Plans page.";
        }
      }

      if (result.action === "create_predefined_workout" && result.predefined_workout_to_create) {
        try {
          const newWorkout = await PredefinedWorkout.create(result.predefined_workout_to_create);
          assistantResponse += `\n\n✅ **Workout Template Created!** I've created "${result.predefined_workout_to_create.name}" for you. You can find it on the [Predefined Workouts page](/PredefinedWorkouts).`;
        } catch (error) {
          console.error("Error creating predefined workout:", error);
          assistantResponse += "\n\n❌ I had trouble creating that workout template. Please try again or create it manually.";
        }
      }

      if (result.navigation_help) {
        assistantResponse += `\n\n🧭 **Navigation Help**: ${result.navigation_help.instructions}`;
        if (result.navigation_help.page_to_visit) {
          assistantResponse += ` Visit the [${result.navigation_help.page_to_visit}](/${result.navigation_help.page_to_visit}) page.`;
        }
      }

      setMessages(prev => [...prev, { role: "assistant", content: assistantResponse }]);

    } catch (error) {
      console.error("❌ Error with AI Coach:", error);
      setDebugInfo({ error: error.message });
      
      let errorMessage = "Sorry, I encountered an error. Please try again.";
      
      if (error.response?.status === 429 || error.message?.includes('429')) {
        errorMessage = "I'm receiving too many requests right now. Please wait a moment and try again.";
        setIsRateLimited(true);
        setRateLimitCooldown(30);
        
        const timer = setInterval(() => {
          setRateLimitCooldown(prev => {
            if (prev <= 1) {
              setIsRateLimited(false);
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      
      setMessages(prev => [...prev, { role: "assistant", content: errorMessage }]);
    } finally {
      setIsThinking(false);
    }
  };

  const clearHistory = () => {
    setMessages([{
      role: "assistant", 
      content: "History cleared! How can I help you with your training today?"
    }]);
    localStorage.removeItem('aiCoachHistory');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bot className="w-8 h-8 text-purple-600" />
            AI Coach
          </h1>
          <p className="text-lg text-gray-600 mt-1">
            Your intelligent fitness assistant - I can create goals, build plans, and guide you through the app.
          </p>
        </div>
        <button 
          onClick={clearHistory}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Clear History
        </button>
      </div>

      {/* Current Context Display */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">🧠 What I Can See & Do</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <p><strong>Current Page:</strong> {getCurrentPageContext().page_description}</p>
            <p><strong>Available Actions:</strong> {getCurrentPageContext().available_actions.join(', ')}</p>
          </div>
          <div>
            <p><strong>Your Goals:</strong> {userMemory.primary_goals.join(', ') || 'Learning...'}</p>
            <p><strong>Active Plan:</strong> {currentPlan?.name || 'None'}</p>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && <Bot className="w-6 h-6 text-purple-500 flex-shrink-0 mt-1" />}
              <div className={`max-w-2xl p-4 rounded-xl ${
                msg.role === 'user' 
                  ? 'bg-blue-500 text-white ml-12' 
                  : 'bg-gray-100 mr-12'
              }`}>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      a: ({href, children}) => (
                        <a href={href} className="text-blue-600 hover:underline font-medium">
                          {children}
                        </a>
                      )
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          
          {isThinking && (
            <div className="flex items-center gap-3">
              <Bot className="w-6 h-6 text-purple-500" />
              <div className="bg-gray-100 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <span className="text-gray-600">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={chatEndRef}></div>
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-6 border-t bg-gray-50">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={isRateLimited ? `Rate limited - wait ${rateLimitCooldown}s` : "Ask me anything about training... (Shift+Enter for new line)"}
              disabled={isThinking || isRateLimited}
              rows={1}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none min-h-[48px] max-h-[200px]"
              style={{
                height: 'auto',
                overflowY: input.includes('\n') || input.length > 80 ? 'auto' : 'hidden'
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
            />
            <button 
              type="submit" 
              disabled={isThinking || isRateLimited || !input.trim()} 
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              Send
            </button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button 
              type="button" 
              onClick={() => setInput("I want to learn a handstand")}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              🤸 Learn a skill
            </button>
            <button 
              type="button" 
              onClick={() => setInput("Create a 8-week strength plan")}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              📋 Build a plan
            </button>
            <button 
              type="button" 
              onClick={() => setInput("How do I use the calendar?")}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              🧭 Navigate the app
            </button>
            <button 
              type="button" 
              onClick={() => setInput("What should I train today?")}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
            >
              💪 Get workout advice
            </button>
          </div>
        </form>
      </div>

      {/* Debug Panel */}
      {debugInfo && (
        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-gray-700">Debug Info</summary>
          <pre className="mt-2 text-xs text-gray-600 overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}