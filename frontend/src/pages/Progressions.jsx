import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Search, Sparkles, Loader2, Target, ChevronRight, Trash2,
  Play, CheckCircle2, MessageCircle, Send, ArrowLeft, Star, TrendingUp,
  Clock, Trophy, Zap, X
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import apiService from "@/services/api";
import aiService from "@/services/aiService";
import ProgressionGraph from "@/components/progression/ProgressionGraph";

const difficultyColors = {
  beginner: "bg-green-100 text-green-700",
  intermediate: "bg-amber-100 text-amber-700",
  advanced: "bg-red-100 text-red-700"
};

const statusColors = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  paused: "bg-orange-100 text-orange-700"
};

export default function Progressions() {
  const { toast } = useToast();
  const [progressions, setProgressions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [selectedProgression, setSelectedProgression] = useState(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  const fetchProgressions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiService.progressions.list();
      setProgressions(data || []);
    } catch (error) {
      console.error("Error fetching progressions:", error);
      toast({
        title: "Error",
        description: "Failed to load progressions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProgressions();
  }, [fetchProgressions]);

  const filteredProgressions = progressions.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.goalExercise?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDifficulty = difficultyFilter === "all" || p.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  });

  const handleStartProgression = async (progressionId) => {
    try {
      await apiService.progressions.start(progressionId);
      toast({
        title: "Progression started",
        description: "Good luck on your journey!"
      });
      fetchProgressions();
    } catch (error) {
      console.error("Start error:", error);
      toast({
        title: "Error",
        description: "Failed to start progression",
        variant: "destructive"
      });
    }
  };

  const handleDeleteProgression = async (progressionId) => {
    if (!confirm("Are you sure you want to delete this progression?")) return;

    try {
      await apiService.progressions.delete(progressionId);
      toast({
        title: "Deleted",
        description: "Progression has been removed"
      });
      fetchProgressions();
      setSelectedProgression(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete progression",
        variant: "destructive"
      });
    }
  };

  // Stats
  const activeProgressions = progressions.filter(p => p.userProgress?.status === 'in_progress').length;
  const completedProgressions = progressions.filter(p => p.userProgress?.status === 'completed').length;
  const totalSteps = progressions.reduce((sum, p) => sum + (p.steps?.length || 0), 0);

  // If in create mode, show the conversational creator
  if (isCreateMode) {
    return (
      <ProgressionCreator
        onBack={() => setIsCreateMode(false)}
        onCreated={() => {
          setIsCreateMode(false);
          fetchProgressions();
        }}
      />
    );
  }

  // If viewing a specific progression (full-screen like LiveWorkout)
  if (selectedProgression) {
    return (
      <ProgressionDetail
        progression={selectedProgression}
        onBack={() => setSelectedProgression(null)}
        onStart={() => handleStartProgression(selectedProgression._id)}
        onDelete={() => handleDeleteProgression(selectedProgression._id)}
        onUpdate={fetchProgressions}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Mobile-first Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Progressions</h1>
                <p className="text-xs text-gray-500">Master exercises step by step</p>
              </div>
            </div>
            <button
              onClick={() => setIsCreateMode(true)}
              className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <Sparkles className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scrolling Stats */}
      <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 min-w-max">
          <StatCard icon={Target} value={progressions.length} label="Paths" color="orange" />
          <StatCard icon={Zap} value={activeProgressions} label="Active" color="blue" />
          <StatCard icon={Trophy} value={completedProgressions} label="Done" color="green" />
          <StatCard icon={TrendingUp} value={totalSteps} label="Steps" color="purple" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search progressions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1">
          {["all", "beginner", "intermediate", "advanced"].map((level) => (
            <button
              key={level}
              onClick={() => setDifficultyFilter(level)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                difficultyFilter === level
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
        </div>
      )}

      {/* Empty State */}
      {!loading && progressions.length === 0 && (
        <div className="px-4 py-8">
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <div className="w-14 h-14 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-gray-900">No Progressions Yet</h3>
            <p className="text-sm text-gray-500 mb-5">
              Talk to Sensei to create your first progression
            </p>
            <button
              onClick={() => setIsCreateMode(true)}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <MessageCircle className="w-5 h-5" />
              Chat with Sensei
            </button>
          </div>
        </div>
      )}

      {/* Progressions List (Mobile: Single Column) */}
      {!loading && filteredProgressions.length > 0 && (
        <div className="px-4 py-2 space-y-3">
          {filteredProgressions.map((progression) => (
            <ProgressionCard
              key={progression._id}
              progression={progression}
              onClick={() => setSelectedProgression(progression)}
            />
          ))}
        </div>
      )}

      {/* No results from filter */}
      {!loading && progressions.length > 0 && filteredProgressions.length === 0 && (
        <div className="px-4 py-8">
          <div className="bg-white rounded-2xl p-6 text-center border border-gray-100">
            <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <Search className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-gray-900">No Results</h3>
            <p className="text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        </div>
      )}

      {/* Floating Action Button for Create */}
      <button
        onClick={() => setIsCreateMode(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-r from-orange-500 to-red-600 rounded-full shadow-xl flex items-center justify-center z-30 active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}

// ============ Stat Card (Compact) ============
function StatCard({ icon: Icon, value, label, color }) {
  const colorStyles = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600"
  };

  return (
    <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 flex items-center gap-3 min-w-[100px]">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorStyles[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

// ============ Progression Card (Mobile Optimized) ============
function ProgressionCard({ progression, onClick }) {
  const stepsCount = progression.steps?.length || 0;
  const completedSteps = progression.userProgress?.stepProgress?.filter(s => s.status === "completed").length || 0;
  const progressPercent = stepsCount > 0 ? Math.round((completedSteps / stepsCount) * 100) : 0;
  const isStarted = !!progression.userProgress;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden active:scale-[0.98] transition-transform"
    >
      {/* Gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-orange-500 to-red-500" />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-orange-600" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate text-[15px]">
              {progression.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Goal: {progression.goalExercise?.name}
            </p>

            {/* Tags Row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${difficultyColors[progression.difficulty]}`}>
                {progression.difficulty}
              </span>
              {isStarted && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[progression.userProgress?.status || 'not_started']}`}>
                  {progression.userProgress?.status?.replace('_', ' ')}
                </span>
              )}
              {progression.estimatedWeeks && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {progression.estimatedWeeks}w
                </span>
              )}
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex flex-col items-center">
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90">
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="3"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="url(#progressGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${progressPercent} ${100 - progressPercent}`}
                  strokeDashoffset="0"
                  style={{ strokeDasharray: `${progressPercent * 1.005} 100` }}
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Progression Detail (Full-Screen Mobile) ============
function ProgressionDetail({ progression, onBack, onStart, onDelete, onUpdate }) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [localProgress, setLocalProgress] = useState(progression.userProgress);

  const hasStarted = !!localProgress;
  const stepsCount = progression.steps?.length || 0;
  const completedSteps = localProgress?.stepProgress?.filter(s => s.status === "completed").length || 0;
  const progressPercent = stepsCount > 0 ? Math.round((completedSteps / stepsCount) * 100) : 0;

  const handleSetCurrentStep = async (step) => {
    if (!hasStarted) {
      toast({
        title: "Start first",
        description: "Start the progression before adjusting",
        variant: "destructive"
      });
      return;
    }

    const stepIndex = progression.steps.findIndex(s =>
      (s._id || s.id) === (step._id || step.id)
    );

    if (stepIndex === -1) return;

    const newStepProgress = progression.steps.map((s, i) => {
      const existingProgress = localProgress?.stepProgress?.find(sp =>
        sp.stepId === (s._id || s.id)
      );
      return {
        stepId: s._id || s.id,
        status: i < stepIndex ? 'completed' : i === stepIndex ? 'in_progress' : 'locked',
        ...(existingProgress || {})
      };
    });

    setLocalProgress({
      ...localProgress,
      stepProgress: newStepProgress,
      currentStepIndex: stepIndex
    });

    try {
      await apiService.progressions.updateProgress(progression._id, {
        currentStepIndex: stepIndex,
        stepProgress: newStepProgress
      });
      toast({
        title: "Progress updated",
        description: `Now on "${step.exerciseName}"`
      });
      onUpdate?.();
    } catch (error) {
      console.error("Failed to update progress:", error);
      toast({
        title: "Error",
        description: "Failed to save progress",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:scale-95 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 truncate">{progression.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${difficultyColors[progression.difficulty]}`}>
                {progression.difficulty}
              </span>
              {progression.estimatedWeeks && (
                <span className="text-[10px] text-gray-400">~{progression.estimatedWeeks}w</span>
              )}
            </div>
          </div>
          <button
            onClick={onDelete}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-50 text-red-500 active:scale-95 transition"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Edit Mode Toggle & Instructions */}
        {hasStarted && (
          <div className={`rounded-xl p-3 flex items-center justify-between ${isEditMode ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
            <div className="flex-1">
              {isEditMode ? (
                <p className="text-xs text-orange-700">
                  Tap any step to set as current position
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Adjust where you are in the progression
                </p>
              )}
            </div>
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                isEditMode
                  ? 'bg-orange-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {isEditMode ? 'Done' : 'Adjust'}
            </button>
          </div>
        )}

        {/* Progress Ring Card */}
        {hasStarted && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="5"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="url(#detailProgressGradient)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    style={{ strokeDasharray: `${progressPercent * 1.76} 176` }}
                  />
                  <defs>
                    <linearGradient id="detailProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900">
                  {progressPercent}%
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Your Progress</h3>
                <p className="text-sm text-gray-500">
                  {completedSteps} of {stepsCount} steps completed
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        {progression.description && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">About</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{progression.description}</p>

            {(progression.muscles?.length > 0 || progression.discipline?.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {progression.muscles?.map((muscle, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">
                    {muscle}
                  </span>
                ))}
                {progression.discipline?.map((disc, i) => (
                  <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] rounded-full">
                    {disc}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progression Path */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-orange-600" />
            <h3 className="font-semibold text-gray-900 text-sm">Your Journey</h3>
          </div>
          <ProgressionGraph
            steps={progression.steps}
            goalExercise={progression.goalExercise?.name}
            userProgress={localProgress}
            editable={isEditMode}
            onSetCurrentStep={handleSetCurrentStep}
            compact
          />
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-20">
        {!hasStarted ? (
          <button
            onClick={onStart}
            className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
          >
            <Play className="w-5 h-5" />
            Start This Journey
          </button>
        ) : (
          <button
            className="w-full h-14 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg"
          >
            <ChevronRight className="w-5 h-5" />
            Continue Training
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Conversational Progression Creator (Mobile-First) ============
function ProgressionCreator({ onBack, onCreated }) {
  const { toast } = useToast();
  const [conversationState, setConversationState] = useState('initial');
  const [userLevel, setUserLevel] = useState('beginner');
  const [goalExercise, setGoalExercise] = useState('');
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey! What exercise do you want to master?",
      thinking: null
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingSteps]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);

    if (conversationState === 'initial') {
      setGoalExercise(userMessage);
      setConversationState('asked_level');
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `**${userMessage}** - nice goal! Where are you at currently?`,
        options: [
          { label: "Complete beginner", value: "beginner", description: "Never tried it" },
          { label: "Some experience", value: "intermediate", description: "Done some prerequisites" },
          { label: "Almost there", value: "advanced", description: "Can almost do it" }
        ]
      }]);
      return;
    }

    if (conversationState === 'asked_level') {
      const lowerMsg = userMessage.toLowerCase();
      let level = 'beginner';
      if (lowerMsg.includes('intermediate') || lowerMsg.includes('some') || lowerMsg.includes('little')) {
        level = 'intermediate';
      } else if (lowerMsg.includes('advanced') || lowerMsg.includes('almost') || lowerMsg.includes('close')) {
        level = 'advanced';
      }
      await generateProgression(goalExercise, level);
      return;
    }

    await generateProgression(userMessage, userLevel);
  };

  const handleOptionSelect = async (option) => {
    setUserLevel(option.value);
    setMessages(prev => [...prev, { role: "user", content: option.label }]);
    setConversationState('generating');
    await generateProgression(goalExercise, option.value);
  };

  const generateProgression = async (goal, level) => {
    setIsLoading(true);
    setThinkingSteps([]);
    setSuggestion(null);

    const thinkingMessages = [
      "Analyzing your goal...",
      "Finding prerequisites...",
      "Building your path..."
    ];

    let currentThinking = 0;
    const thinkingInterval = setInterval(() => {
      if (currentThinking < thinkingMessages.length) {
        setThinkingSteps(prev => [...prev, thinkingMessages[currentThinking]]);
        currentThinking++;
      }
    }, 600);

    try {
      const result = await aiService.suggestProgression(goal, level, []);

      clearInterval(thinkingInterval);
      setThinkingSteps([]);

      if (result.suggestion) {
        setSuggestion(result.suggestion);
        setConversationState('showing_result');

        const levels = {};
        result.suggestion.steps?.forEach(s => {
          const lvl = s.level ?? s.order;
          levels[lvl] = (levels[lvl] || 0) + 1;
        });
        const parallelGroups = Object.values(levels).filter(count => count > 1).length;

        let message = `Here's your **${result.suggestion.steps?.length || 0}-step** path to **${result.suggestion.goalExercise}**!`;

        if (parallelGroups > 0) {
          message += `\n\n${parallelGroups} exercise pairs to train together.`;
        }

        setMessages(prev => [...prev, {
          role: "assistant",
          content: message,
          suggestion: result.suggestion
        }]);
      }
    } catch (error) {
      clearInterval(thinkingInterval);
      setThinkingSteps([]);
      console.error("Sensei error:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, couldn't create that. Try again?"
      }]);
      setConversationState('initial');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!suggestion) return;

    setIsLoading(true);
    try {
      const progressionData = {
        name: suggestion.name,
        description: suggestion.description,
        goalExercise: { name: suggestion.goalExercise },
        difficulty: suggestion.difficulty,
        discipline: suggestion.discipline,
        muscles: suggestion.muscles,
        estimatedWeeks: suggestion.estimatedWeeks,
        steps: suggestion.steps.map((step, index) => ({
          order: step.order ?? index,
          level: step.level ?? index,
          exerciseName: step.exerciseName,
          exerciseDifficulty: step.exerciseDifficulty,
          notes: step.notes,
          targetMetrics: step.targetMetrics
        }))
      };

      await apiService.progressions.create(progressionData);
      toast({
        title: "Created!",
        description: `${progressionData.name} is ready`
      });
      onCreated();
    } catch (error) {
      console.error("Create error:", error);
      toast({
        title: "Error",
        description: "Failed to create",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:scale-95 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">Sensei</h1>
            <p className="text-[10px] text-gray-400">Progression Builder</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] ${msg.role === "user" ? "" : ""}`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-[10px] font-medium text-gray-400">Sensei</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-br-md"
                    : "bg-white border border-gray-100 rounded-bl-md"
                }`}
              >
                <p className={`text-sm leading-relaxed ${msg.role === "user" ? "text-white" : "text-gray-700"}`}>
                  {msg.content}
                </p>

                {/* Level Selection Options */}
                {msg.options && !isLoading && conversationState === 'asked_level' && (
                  <div className="mt-3 space-y-2">
                    {msg.options.map((option, i) => (
                      <button
                        key={i}
                        onClick={() => handleOptionSelect(option)}
                        className="w-full text-left p-3 rounded-xl border-2 border-gray-100 hover:border-orange-400 hover:bg-orange-50 active:scale-[0.98] transition-all"
                      >
                        <div className="font-medium text-gray-900 text-sm">
                          {option.label}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Show suggestion graph */}
                {msg.suggestion && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4 text-orange-500" />
                        <span className="font-semibold text-gray-900 text-sm">{msg.suggestion.name}</span>
                      </div>
                      <ProgressionGraph
                        steps={msg.suggestion.steps}
                        goalExercise={msg.suggestion.goalExercise}
                        compact
                      />
                    </div>

                    <button
                      onClick={handleCreate}
                      disabled={isLoading}
                      className="w-full mt-3 h-12 bg-gradient-to-r from-green-500 to-emerald-600 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Create Progression
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking Animation */}
        {thinkingSteps.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[88%]">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
                <span className="text-[10px] font-medium text-gray-400">Thinking...</span>
              </div>
              <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                <div className="space-y-1.5">
                  {thinkingSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span>{step}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Working...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Input */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={conversationState === 'asked_level' ? "Or type your level..." : "e.g. muscle up, front lever..."}
            disabled={isLoading}
            className="flex-1 h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 disabled:opacity-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
        {conversationState === 'initial' && (
          <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide">
            {["Muscle Up", "Front Lever", "Handstand", "Pistol Squat"].map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setInput(ex);
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-xs whitespace-nowrap active:bg-gray-200"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
