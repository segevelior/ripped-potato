import React from "react";
import { FileText, Code, Database, Bot, Zap, Target, Calendar, TrendingUp } from "lucide-react";

export default function Documentation() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Torii Documentation
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Comprehensive guide to the AI-powered personal training platform
          </p>
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <a href="#overview" className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-center">
            <Target className="w-8 h-8 mx-auto mb-2 text-primary-500" />
            <div className="font-medium">Features</div>
          </a>
          <a href="#architecture" className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-center">
            <Code className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            <div className="font-medium">Architecture</div>
          </a>
          <a href="#data-models" className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-center">
            <Database className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <div className="font-medium">Data Models</div>
          </a>
          <a href="#ai-coach" className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-center">
            <Bot className="w-8 h-8 mx-auto mb-2 text-primary-500" />
            <div className="font-medium">AI Coach</div>
          </a>
        </div>

        {/* Overview Section */}
        <section id="overview" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Target className="w-8 h-8 text-primary-500" />
            Features Overview
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Bot className="w-6 h-6 text-primary-500" />
                AI-Powered Personal Coach
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Conversational plan creation from natural language</li>
                <li>• Context-aware assistance on every screen</li>
                <li>• Adaptive learning from user behavior patterns</li>
                <li>• Floating chat interface + dedicated chat tab</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                Comprehensive Planning
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Smart plan creation with goal integration</li>
                <li>• Visual calendar with drag-and-drop scheduling</li>
                <li>• Goal-progress tracking with progression paths</li>
                <li>• Weekly reflection and automatic adjustments</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-6 h-6 text-green-600" />
                Workout Management
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Live workout sessions with real-time tracking</li>
                <li>• Predefined workout library and templates</li>
                <li>• Comprehensive exercise database</li>
                <li>• Smart workout suggestions based on goals</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-primary-500" />
                Progress Analytics
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Body region load tracking with visual charts</li>
                <li>• Weekly optimization reports</li>
                <li>• Goal progression visualization</li>
                <li>• Training pattern analysis and insights</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Technical Architecture */}
        <section id="architecture" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Code className="w-8 h-8 text-blue-600" />
            Technical Architecture
          </h2>

          <div className="bg-white p-8 rounded-xl shadow">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">Frontend Stack</h3>
                <ul className="space-y-2 text-gray-600">
                  <li><strong>React 18:</strong> Functional components with hooks</li>
                  <li><strong>Tailwind CSS:</strong> Responsive styling system</li>
                  <li><strong>Shadcn/UI:</strong> Consistent, accessible components</li>
                  <li><strong>React Router DOM:</strong> Client-side navigation</li>
                  <li><strong>Date-fns:</strong> Date manipulation utilities</li>
                  <li><strong>Recharts:</strong> Data visualization charts</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4">Backend Integration</h3>
                <ul className="space-y-2 text-gray-600">
                  <li><strong>Base44 Platform:</strong> Authentication & infrastructure</li>
                  <li><strong>Entity-based Architecture:</strong> JSON schema validation</li>
                  <li><strong>RESTful API:</strong> Standardized data operations</li>
                  <li><strong>Real-time Updates:</strong> Live workout sessions</li>
                  <li><strong>OpenAI Integration:</strong> Via InvokeLLM service</li>
                  <li><strong>Structured Responses:</strong> Schema-validated AI output</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 p-6 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Project Structure</h3>
              <pre className="text-sm text-gray-700 overflow-x-auto">
                {`components/
├── dashboard/          # Dashboard widgets and charts
├── calendar/           # Calendar and scheduling UI
├── exercise/           # Exercise-related components
├── goals/              # Goal tracking interface
├── predefined/         # Workout template components
└── FloatingAIAssistant.jsx

pages/
├── Dashboard.js        # Main overview dashboard
├── Calendar.js         # Training calendar
├── Goals.js            # Goal management
├── Plans.js            # Training plan management
├── Chat.js             # AI coach conversation
├── LiveWorkout.js      # Real-time workout tracking
├── Exercises.js        # Exercise database
└── PredefinedWorkouts.js

entities/               # Data models (JSON schemas)
Layout.js               # App navigation and layout`}
              </pre>
            </div>
          </div>
        </section>

        {/* Data Models */}
        <section id="data-models" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Database className="w-8 h-8 text-green-600" />
            Data Models
          </h2>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Core Entities</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-primary-500 mb-2">Workout</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Title, date, type, duration</li>
                    <li>• Exercise list with sets/reps/weight</li>
                    <li>• RPE (Rate of Perceived Exertion) tracking</li>
                    <li>• Total strain and muscle group distribution</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-600 mb-2">Goal</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Name, description, category</li>
                    <li>• Discipline tags and difficulty level</li>
                    <li>• Estimated timeline and prerequisites</li>
                    <li>• Progress tracking integration</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-green-600 mb-2">Plan</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Name, dates, status</li>
                    <li>• Linked goals and workouts</li>
                    <li>• Progress metrics and completion rates</li>
                    <li>• AI optimization insights</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-primary-500 mb-2">Exercise</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Name, discipline, muscle groups</li>
                    <li>• Equipment requirements</li>
                    <li>• Strain intensity and load characteristics</li>
                    <li>• Progression group and level</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AI Coach Implementation */}
        <section id="ai-coach" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Bot className="w-8 h-8 text-primary-500" />
            AI Coach Implementation
          </h2>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Context Awareness System</h3>
              <p className="text-gray-600 mb-4">
                The AI coach maintains comprehensive awareness of user context:
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Real-time Context</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Current page and user actions</li>
                    <li>• Active workouts, goals, and plans</li>
                    <li>• Recent training history</li>
                    <li>• Schedule and availability</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Learning Patterns</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Training preferences and habits</li>
                    <li>• Skip patterns and bottlenecks</li>
                    <li>• Goal progression rates</li>
                    <li>• Manual edit feedback</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Conversation Flow</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-primary-500 font-semibold">1</div>
                  <div>
                    <h4 className="font-semibold">Input Processing</h4>
                    <p className="text-sm text-gray-600">User input analyzed for intent and context</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">2</div>
                  <div>
                    <h4 className="font-semibold">Data Gathering</h4>
                    <p className="text-sm text-gray-600">Relevant user data collected and formatted</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold">3</div>
                  <div>
                    <h4 className="font-semibold">LLM Prompting</h4>
                    <p className="text-sm text-gray-600">Structured prompts with context and schema</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-primary-500 font-semibold">4</div>
                  <div>
                    <h4 className="font-semibold">Action Execution</h4>
                    <p className="text-sm text-gray-600">Creates/updates entities based on AI response</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-semibold">5</div>
                  <div>
                    <h4 className="font-semibold">Learning Loop</h4>
                    <p className="text-sm text-gray-600">Stores feedback and patterns for improvement</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Usage Guide */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Usage Guide</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Getting Started</h3>
              <ol className="space-y-3 text-gray-600">
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-primary-500 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">1</span>
                  <span>Set up your training preferences in the onboarding flow</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-primary-500 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">2</span>
                  <span>Define 1-3 primary fitness objectives in Goals</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-primary-500 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">3</span>
                  <span>Describe your goals to the AI coach in natural language</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-primary-500 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">4</span>
                  <span>Review and activate the generated training plan</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 bg-orange-100 text-primary-500 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">5</span>
                  <span>Follow scheduled workouts and track daily progress</span>
                </li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">AI Coach Interaction</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start gap-3">
                  <Bot className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Natural Language:</strong> Speak to the coach as you would a human trainer</span>
                </li>
                <li className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Floating Access:</strong> Click the floating button for quick questions</span>
                </li>
                <li className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Full Conversations:</strong> Use the Chat tab for detailed planning sessions</span>
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Context Help:</strong> The coach sees what you're working on and provides relevant advice</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Advanced Features */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Advanced Features</h2>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Pattern Learning Engine</h3>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-semibold text-primary-500 mb-2">Training Preferences</h4>
                  <p className="text-sm text-gray-600">Learns optimal workout times, durations, and intensity preferences</p>
                </div>
                <div>
                  <h4 className="font-semibold text-blue-600 mb-2">Skip Patterns</h4>
                  <p className="text-sm text-gray-600">Identifies common reasons for missed sessions and adapts accordingly</p>
                </div>
                <div>
                  <h4 className="font-semibold text-green-600 mb-2">Recovery Needs</h4>
                  <p className="text-sm text-gray-600">Adapts rest recommendations based on performance and feedback</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-4">Smart Workout Generation</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Dynamic Creation</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Generates workouts on-demand based on current needs</li>
                    <li>• Equipment adaptation for available resources</li>
                    <li>• Time constraints automatically considered</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Progression Integration</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Includes exercises that advance current goals</li>
                    <li>• Balances skill development with strength building</li>
                    <li>• Adapts difficulty based on recent performance</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-12 border-t border-gray-200">
          <p className="text-gray-600">
            <strong>Torii</strong> - Your AI-powered journey to better fitness starts here. 🚀
          </p>
        </div>
      </div>
    </div>
  );
}