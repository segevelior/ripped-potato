import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Search, Sparkles, Loader2, Target, ChevronRight, Trash2,
  Play, CheckCircle2, MessageCircle, Send, ArrowLeft, Star, TrendingUp,
  Clock, Trophy, Zap, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import apiService from "@/services/api";
import aiService from "@/services/aiService";
import ProgressionGraph from "@/components/progression/ProgressionGraph";

const difficultyColors = {
  beginner: "bg-green-100 text-green-800 border-green-200",
  intermediate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  advanced: "bg-red-100 text-red-800 border-red-200"
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl text-white shadow-lg">
            <TrendingUp className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Progressions</h1>
            <p className="text-lg text-gray-500">Master exercises step by step</p>
          </div>
        </div>
        <button
          onClick={() => setIsCreateMode(true)}
          className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg"
        >
          <Sparkles className="w-5 h-5" />
          Create with Sensei
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{progressions.length}</p>
              <p className="text-sm text-gray-600">Total Paths</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeProgressions}</p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Trophy className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completedProgressions}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalSteps}</p>
              <p className="text-sm text-gray-600">Total Steps</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search progressions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Difficulties</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredProgressions.length} of {progressions.length} progressions
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
        </div>
      )}

      {/* Empty State */}
      {!loading && progressions.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-orange-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-900">No Progressions Yet</h3>
          <p className="text-gray-600 mb-6">
            Talk to Sensei to create your first progression path
          </p>
          <button
            onClick={() => setIsCreateMode(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 mx-auto transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            Chat with Sensei
          </button>
        </div>
      )}

      {/* Progressions Grid */}
      {!loading && filteredProgressions.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-900">No Results Found</h3>
          <p className="text-gray-600">
            Try adjusting your search or filters
          </p>
        </div>
      )}
    </div>
  );
}

// ============ Progression Card ============
function ProgressionCard({ progression, onClick }) {
  const stepsCount = progression.steps?.length || 0;
  const completedSteps = progression.userProgress?.stepProgress?.filter(s => s.status === "completed").length || 0;
  const progressPercent = stepsCount > 0 ? Math.round((completedSteps / stepsCount) * 100) : 0;
  const isStarted = !!progression.userProgress;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-all cursor-pointer border border-gray-200 overflow-hidden group"
    >
      {/* Card Header with gradient */}
      <div className="h-2 bg-gradient-to-r from-orange-500 to-red-500" />

      <div className="p-6">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
            <Target className="w-6 h-6 text-orange-600" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-bold text-gray-900 truncate group-hover:text-orange-600 transition-colors">
                {progression.name}
              </h3>
            </div>

            <p className="text-sm text-gray-500 mb-3 line-clamp-1">
              Goal: {progression.goalExercise?.name}
            </p>

            {/* Tags */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColors[progression.difficulty]}`}>
                {progression.difficulty}
              </span>
              {isStarted && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[progression.userProgress?.status || 'not_started']}`}>
                  {progression.userProgress?.status?.replace('_', ' ')}
                </span>
              )}
              {progression.estimatedWeeks && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  ~{progression.estimatedWeeks}w
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0 font-medium">
                {completedSteps}/{stepsCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Progression Detail (Full-Screen like LiveWorkout) ============
function ProgressionDetail({ progression, onBack, onStart, onDelete, onUpdate }) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [localProgress, setLocalProgress] = useState(progression.userProgress);

  const hasStarted = !!localProgress;
  const stepsCount = progression.steps?.length || 0;
  const completedSteps = localProgress?.stepProgress?.filter(s => s.status === "completed").length || 0;
  const progressPercent = stepsCount > 0 ? Math.round((completedSteps / stepsCount) * 100) : 0;

  // Handle clicking on a step to mark it as current position
  const handleSetCurrentStep = async (step) => {
    if (!hasStarted) {
      toast({
        title: "Start first",
        description: "Start the progression before adjusting your position",
        variant: "destructive"
      });
      return;
    }

    const stepIndex = progression.steps.findIndex(s =>
      (s._id || s.id) === (step._id || step.id)
    );

    if (stepIndex === -1) return;

    // Update local state immediately for responsive UI
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

    // Save to backend
    try {
      await apiService.progressions.updateProgress(progression._id, {
        currentStepIndex: stepIndex,
        stepProgress: newStepProgress
      });
      toast({
        title: "Progress updated",
        description: `Set current step to "${step.exerciseName}"`
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{progression.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${difficultyColors[progression.difficulty]}`}>
                  {progression.difficulty}
                </span>
                {progression.estimatedWeeks && (
                  <span className="text-xs text-gray-500">~{progression.estimatedWeeks} weeks</span>
                )}
              </div>
            </div>
            {hasStarted && (
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isEditMode
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isEditMode ? 'Done' : 'Adjust Position'}
              </button>
            )}
            <button
              onClick={onDelete}
              className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Edit Mode Instructions */}
        {isEditMode && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-sm text-orange-700">
              <strong>Adjust your position:</strong> Click on any step to set it as your current progress.
              Steps before it will be marked as completed.
            </p>
          </div>
        )}

        {/* Progress Overview */}
        {hasStarted && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Your Progress</h2>
              <span className="text-2xl font-bold text-orange-600">{progressPercent}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-gray-500">
              {completedSteps} of {stepsCount} steps completed
            </p>
          </div>
        )}

        {/* Description */}
        {progression.description && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="font-bold text-gray-900 mb-2">About</h2>
            <p className="text-gray-600">{progression.description}</p>

            {/* Muscles & Disciplines */}
            {(progression.muscles?.length > 0 || progression.discipline?.length > 0) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {progression.muscles?.map((muscle, i) => (
                  <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {muscle}
                  </span>
                ))}
                {progression.discipline?.map((disc, i) => (
                  <span key={i} className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">
                    {disc}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progression Path */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            Your Journey
          </h2>
          <ProgressionGraph
            steps={progression.steps}
            goalExercise={progression.goalExercise?.name}
            userProgress={localProgress}
            editable={isEditMode}
            onSetCurrentStep={handleSetCurrentStep}
          />
        </div>

        {/* Action Button */}
        <div className="flex justify-center pb-8">
          {!hasStarted ? (
            <button
              onClick={onStart}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg transform hover:scale-105"
            >
              <Play className="w-5 h-5" />
              Start This Journey
            </button>
          ) : (
            <button
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg"
            >
              <ChevronRight className="w-5 h-5" />
              Continue Training
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Conversational Progression Creator ============
function ProgressionCreator({ onBack, onCreated }) {
  const { toast } = useToast();
  const [conversationState, setConversationState] = useState('initial'); // initial, asked_level, showing_result
  const [userLevel, setUserLevel] = useState('beginner');
  const [goalExercise, setGoalExercise] = useState('');
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey! I'm Sensei. What exercise would you like to master?\n\nExamples: muscle up, handstand, front lever, pistol squat, planche...",
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

    // Handle conversation flow based on state
    if (conversationState === 'initial') {
      // User just told us their goal - ask about their current level
      setGoalExercise(userMessage);
      setConversationState('asked_level');
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Great choice! **${userMessage}** is an awesome goal.\n\nWhere are you currently at with this? This helps me create the right starting point.`,
        options: [
          { label: "Complete beginner", value: "beginner", description: "Never tried it or related exercises" },
          { label: "Some experience", value: "intermediate", description: "Can do some prerequisite exercises" },
          { label: "Almost there", value: "advanced", description: "Can almost do it or do assisted versions" }
        ]
      }]);
      return;
    }

    // If user types instead of clicking option, try to interpret
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

    // Default: generate with what we have
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

    // Show thinking animation
    const thinkingMessages = [
      "Analyzing your goal...",
      "Checking your current level...",
      "Identifying prerequisite exercises...",
      "Finding parallel training paths...",
      "Building your progression..."
    ];

    let currentThinking = 0;
    const thinkingInterval = setInterval(() => {
      if (currentThinking < thinkingMessages.length) {
        setThinkingSteps(prev => [...prev, thinkingMessages[currentThinking]]);
        currentThinking++;
      }
    }, 700);

    try {
      const result = await aiService.suggestProgression(goal, level, []);

      clearInterval(thinkingInterval);
      setThinkingSteps([]);

      if (result.suggestion) {
        setSuggestion(result.suggestion);
        setConversationState('showing_result');

        // Count parallel groups
        const levels = {};
        result.suggestion.steps?.forEach(s => {
          const lvl = s.level ?? s.order;
          levels[lvl] = (levels[lvl] || 0) + 1;
        });
        const parallelGroups = Object.values(levels).filter(count => count > 1).length;

        let message = `I've created a **${result.suggestion.steps?.length || 0}-step progression** for **${result.suggestion.goalExercise}**!\n\n${result.suggestion.description}`;

        if (parallelGroups > 0) {
          message += `\n\n📊 **${parallelGroups} parallel training groups** - exercises marked "Train Together" should be done in the same session.`;
        }

        message += `\n\nAfter creating, you can adjust your starting position by clicking "Adjust Position" in the detail view.`;

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
        content: "Sorry, I had trouble creating that progression. Could you try rephrasing your goal?"
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
        title: "Progression created!",
        description: `${progressionData.name} is ready to start`
      });
      onCreated();
    } catch (error) {
      console.error("Create error:", error);
      toast({
        title: "Error",
        description: "Failed to create progression",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Sensei</h1>
              <p className="text-xs text-gray-500">Progression Builder</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${msg.role === "user" ? "order-2" : ""}`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-500">Sensei</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                    : "bg-white shadow-sm border border-gray-100"
                }`}
              >
                <p className={`text-sm whitespace-pre-wrap ${msg.role === "user" ? "text-white" : "text-gray-700"}`}>
                  {msg.content}
                </p>

                {/* Level Selection Options */}
                {msg.options && !isLoading && conversationState === 'asked_level' && (
                  <div className="mt-4 space-y-2">
                    {msg.options.map((option, i) => (
                      <button
                        key={i}
                        onClick={() => handleOptionSelect(option)}
                        className="w-full text-left p-3 rounded-xl border-2 border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all group"
                      >
                        <div className="font-medium text-gray-900 group-hover:text-orange-600">
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {option.description}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Show suggestion graph */}
                {msg.suggestion && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="w-4 h-4 text-orange-500" />
                        <span className="font-bold text-gray-900">{msg.suggestion.name}</span>
                      </div>
                      <ProgressionGraph
                        steps={msg.suggestion.steps}
                        goalExercise={msg.suggestion.goalExercise}
                        compact
                      />
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleCreate}
                        disabled={isLoading}
                        className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Create This Progression
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking Animation */}
        {thinkingSteps.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%]">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-medium text-gray-500">Sensei is thinking...</span>
              </div>
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
                <div className="space-y-2">
                  {thinkingSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>{step}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Working...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={conversationState === 'asked_level' ? "Or type your current level..." : "Tell me what exercise you want to master..."}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        {conversationState === 'initial' && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Try: "muscle up", "human flag", "front lever", "handstand push-up"
          </p>
        )}
      </div>
    </div>
  );
}
