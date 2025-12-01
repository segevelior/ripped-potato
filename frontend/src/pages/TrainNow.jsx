import React, { useState, useEffect } from "react";
import { PredefinedWorkout, Exercise } from "@/api/entities";
import { format } from "date-fns";
import {
  Play, Clock, ChevronRight, Dumbbell, Calendar,
  Search, Sparkles, X, Flame, Moon, Coffee
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getDisciplineClass } from "@/styles/designTokens";
import WorkoutDetailModal from "../components/predefined/WorkoutDetailModal";
import { aiService } from "@/services/aiService";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const getWorkoutImage = (workout) => {
  const discipline = workout?.primary_disciplines?.[0]?.toLowerCase() || 'strength';
  const imageMap = {
    running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&h=500&fit=crop',
    cycling: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&h=500&fit=crop',
    strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=500&fit=crop',
    climbing: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800&h=500&fit=crop',
    hiit: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=500&fit=crop',
    cardio: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=500&fit=crop',
    mobility: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&h=500&fit=crop',
    meditation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=500&fit=crop',
    calisthenics: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800&h=500&fit=crop',
  };
  return workout?.image || imageMap[discipline] || imageMap.strength;
};

// Quick start card - prominent CTA
function QuickStartCard({ workout, onStart, isFromCalendar, isLoading, reasoning }) {
  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-700 p-6 text-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 bg-white/20 rounded" />
            <div className="h-4 bg-white/20 rounded w-24" />
          </div>
          <div className="h-6 bg-white/20 rounded w-48 mb-2" />
          <div className="flex items-center gap-4 mb-4">
            <div className="h-4 bg-white/20 rounded w-16" />
            <div className="h-4 bg-white/20 rounded w-20" />
          </div>
          <div className="h-12 bg-white/30 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!workout) {
    // Show helpful message when no suggestion available
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-400 to-gray-600 p-6 text-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-gray-200" />
            <span className="text-sm font-medium text-gray-200">Nothing Scheduled</span>
          </div>
          <h3 className="text-xl font-bold mb-2">No Workout For Today</h3>
          <p className="text-sm text-gray-200 mb-4">
            If you feel like working out, talk to Sensei below or add a workout in the Calendar.
          </p>
          <Link
            to="/Calendar"
            className="w-full bg-white text-gray-600 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <Calendar className="w-5 h-5" />
            Open Calendar
          </Link>
        </div>
      </div>
    );
  }

  // Handle Rest Day suggestion
  if (workout.type === 'rest') {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-400 to-purple-600 p-6 text-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Moon className="w-5 h-5 text-indigo-100" />
            <span className="text-sm font-medium text-indigo-100">Sensei's Advice</span>
          </div>

          <h3 className="text-xl font-bold mb-2">{workout.name || 'Rest Day'}</h3>

          <p className="text-sm text-indigo-100/90 mb-4">
            {workout.reasoning || 'Your body needs time to recover. Rest is an essential part of training.'}
          </p>

          {workout.tips && workout.tips.length > 0 && (
            <div className="bg-white/10 rounded-xl p-3 mb-4">
              <p className="text-xs font-medium text-indigo-100 mb-2 flex items-center gap-1">
                <Coffee className="w-3 h-3" /> Recovery Tips
              </p>
              <ul className="text-sm text-indigo-100/80 space-y-1">
                {workout.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-indigo-200">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            to="/Chat"
            className="w-full bg-white/20 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            Talk to Sensei
          </Link>
        </div>
      </div>
    );
  }

  // Handle Workout suggestion
  const discipline = workout.primary_disciplines?.[0] || 'Workout';
  const label = isFromCalendar ? "Scheduled Today" : "Today's Pick";
  const LabelIcon = isFromCalendar ? Calendar : Flame;

  return (
    <div
      onClick={() => onStart(workout)}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-700 p-6 text-white cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <LabelIcon className="w-5 h-5 text-primary-100" />
          <span className="text-sm font-medium text-primary-100">{label}</span>
        </div>

        <h3 className="text-xl font-bold mb-2">{workout.name}</h3>

        {reasoning && (
          <p className="text-sm text-primary-100/80 mb-3 line-clamp-2">{reasoning}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-primary-100 mb-4">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {workout.estimated_duration || 45} min
          </span>
          <span className="capitalize">{discipline}</span>
        </div>

        <button className="w-full bg-white text-primary-600 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-50 transition-colors">
          <Play className="w-5 h-5" />
          Start Now
        </button>
      </div>
    </div>
  );
}

// Compact workout card for lists
function CompactWorkoutCard({ workout, onStart, onView }) {
  const discipline = workout.primary_disciplines?.[0] || 'workout';

  return (
    <div
      onClick={() => onView(workout)}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="relative h-32 overflow-hidden">
        <img
          src={getWorkoutImage(workout)}
          alt={workout.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${getDisciplineClass(discipline)}`}>
            {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h4 className="font-semibold text-gray-900 mb-2 line-clamp-1 group-hover:text-primary-500 transition-colors">
          {workout.name}
        </h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{workout.estimated_duration || 45} min</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onStart(workout); }}
            className="bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

// Horizontal scroll workout row
function WorkoutRow({ title, icon: Icon, workouts, onStart, onView, seeAllLink }) {
  if (!workouts || workouts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary-500" />}
          {title}
        </h2>
        {seeAllLink && (
          <Link to={seeAllLink} className="text-sm text-primary-500 font-medium flex items-center gap-1">
            See All <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {workouts.map((workout) => (
          <div key={workout.id} className="flex-shrink-0 w-56">
            <CompactWorkoutCard workout={workout} onStart={onStart} onView={onView} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrainNow() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [workoutToView, setWorkoutToView] = useState(null);
  const [coachPrompt, setCoachPrompt] = useState("");

  // Today's workout suggestion state (3-tier: calendar -> cache -> AI)
  const [todaySuggestion, setTodaySuggestion] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(true);
  const [isFromCalendar, setIsFromCalendar] = useState(false);
  const [suggestionReasoning, setSuggestionReasoning] = useState(null);

  useEffect(() => {
    loadData();
    loadTodaySuggestion();

    // Re-fetch when page becomes visible (user navigates back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 [TrainNow] Page visible, re-checking calendar...');
        loadTodaySuggestion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workoutData, exerciseData] = await Promise.all([
        PredefinedWorkout.list(),
        Exercise.list()
      ]);
      setWorkouts(workoutData || []);
      setExercises(exerciseData || []);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  /**
   * 3-tier loading for today's workout suggestion:
   * 1. Always check calendar first (source of truth)
   * 2. If no calendar event, check cache
   * 3. If no cache, fetch from AI
   */
  const loadTodaySuggestion = async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏋️ [TrainNow] Starting workout suggestion load...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    setSuggestionLoading(true);
    const token = localStorage.getItem('authToken');
    console.log('🔑 [TrainNow] Auth token:', token ? `${token.substring(0, 20)}...` : 'null');

    if (!token) {
      console.log('❌ [TrainNow] No auth token found, skipping suggestion load');
      setSuggestionLoading(false);
      return;
    }

    try {
      // Step 1: Always check calendar first (with cache-busting)
      console.log('\n📅 [TrainNow] STEP 1: Checking calendar...');
      const calendarResponse = await fetch(`${API_BASE_URL}/api/v1/calendar/today?_t=${Date.now()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      console.log('📅 [TrainNow] Calendar response status:', calendarResponse.status);

      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        console.log('📅 [TrainNow] Calendar data:', JSON.stringify(calendarData, null, 2));

        // Calendar returns { success: true, data: { events: [...] } }
        const events = calendarData.data?.events || calendarData.data || [];
        console.log('📅 [TrainNow] Events array:', events.length, 'items');

        if (calendarData.success && events.length > 0) {
          const todayWorkout = events.find(
            e => e.type === 'workout' && e.status === 'scheduled'
          );

          if (todayWorkout) {
            console.log('✅ [TrainNow] SELECTED: Calendar workout -', todayWorkout.title);
            const workoutFromCalendar = {
              id: todayWorkout._id,
              name: todayWorkout.title,
              estimated_duration: todayWorkout.workoutDetails?.estimatedDuration || 45,
              primary_disciplines: [todayWorkout.workoutDetails?.type || 'strength'],
              blocks: todayWorkout.workoutTemplateId?.blocks || [],
              calendarEventId: todayWorkout._id
            };
            setTodaySuggestion(workoutFromCalendar);
            setIsFromCalendar(true);
            setSuggestionLoading(false);
            console.log('🏁 [TrainNow] Done - using calendar workout');
            return;
          } else {
            console.log('📅 [TrainNow] No scheduled workout found in calendar events');
          }
        } else {
          console.log('📅 [TrainNow] Calendar returned empty or no data');
        }
      } else {
        console.log('⚠️ [TrainNow] Calendar API failed with status:', calendarResponse.status);
      }

      // Step 2: No calendar event, check cache
      console.log('\n📦 [TrainNow] STEP 2: Checking cache...');
      const cached = aiService.getCachedTodayWorkout();
      console.log('📦 [TrainNow] Cache result:', cached);

      if (cached?.suggestion) {
        console.log('✅ [TrainNow] SELECTED: Cached suggestion -', cached.suggestion.name);
        setTodaySuggestion(cached.suggestion);
        setSuggestionReasoning(cached.suggestion.reasoning);
        setIsFromCalendar(false);
        setSuggestionLoading(false);
        console.log('🏁 [TrainNow] Done - using cached suggestion');
        return;
      } else {
        console.log('📦 [TrainNow] No valid cache found, proceeding to AI...');
      }

      // Step 3: No cache, fetch from AI
      console.log('\n🤖 [TrainNow] STEP 3: Fetching from AI...');
      console.log('🤖 [TrainNow] Calling:', `${API_BASE_URL}/api/v1/train-now`);

      const aiResponse = await fetch(`${API_BASE_URL}/api/v1/train-now`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('🤖 [TrainNow] AI response status:', aiResponse.status);

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        console.log('🤖 [TrainNow] AI response:', JSON.stringify(aiData, null, 2));

        if (aiData.success && aiData.suggestion) {
          console.log('✅ [TrainNow] SELECTED: AI suggestion -', aiData.suggestion.name);
          localStorage.setItem('todayWorkoutSuggestion', JSON.stringify({
            suggestion: aiData.suggestion,
            source: aiData.source,
            timestamp: Date.now()
          }));
          setTodaySuggestion(aiData.suggestion);
          setSuggestionReasoning(aiData.suggestion.reasoning);
          setIsFromCalendar(false);
          console.log('🏁 [TrainNow] Done - using AI suggestion');
        } else {
          console.log('⚠️ [TrainNow] AI returned no suggestion:', aiData.error || 'Unknown error');
          console.log('🏁 [TrainNow] Done - NO WORKOUT TO SHOW');
        }
      } else {
        const errorText = await aiResponse.text();
        console.log('❌ [TrainNow] AI request failed:', aiResponse.status, errorText);
        console.log('🏁 [TrainNow] Done - AI FAILED');
      }
    } catch (error) {
      console.error('❌ [TrainNow] Exception:', error);
      console.log('🏁 [TrainNow] Done - EXCEPTION');
    }

    setSuggestionLoading(false);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  };

  // Get workouts by category
  const getWorkoutsByDiscipline = (discipline) => {
    return workouts.filter(w =>
      w.primary_disciplines?.some(d => d.toLowerCase() === discipline.toLowerCase())
    ).slice(0, 6);
  };

  // Get quick/short workouts
  const quickWorkouts = workouts.filter(w => (w.estimated_duration || 45) <= 30).slice(0, 6);

  // Featured workout - only use today's suggestion, no fallback
  const featuredWorkout = todaySuggestion;

  // Search results
  const searchResults = searchQuery.trim()
    ? workouts.filter(w =>
        w.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.goal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.primary_disciplines?.some(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const startWorkout = (workout) => {
    const sessionData = {
      title: workout.name,
      type: workout.primary_disciplines?.[0] || "strength",
      duration_minutes: workout.estimated_duration || 60,
      exercises: []
    };

    workout.blocks?.forEach(block => {
      block.exercises?.forEach(ex => {
        const newExercise = {
          exercise_id: ex.exercise_id || ex.exercise_name?.toLowerCase().replace(/\s/g, '_'),
          exercise_name: ex.exercise_name,
          notes: ex.notes || "",
          sets: []
        };

        const volume = ex.volume || "3x10";
        let numSets = 3;
        let numReps = 10;

        if (volume.includes('x')) {
          const [setsStr, repsStr] = volume.split('x');
          numSets = parseInt(setsStr) || 3;
          numReps = parseInt(repsStr) || 10;
        }

        let restSeconds = 90;
        if (ex.rest) {
          const restMatch = ex.rest.match(/\d+/);
          if (restMatch) restSeconds = parseInt(restMatch[0]);
        }

        for (let i = 0; i < numSets; i++) {
          newExercise.sets.push({
            target_reps: numReps,
            reps: 0,
            weight: 0,
            rest_seconds: restSeconds,
            is_completed: false
          });
        }

        sessionData.exercises.push(newExercise);
      });
    });

    const tempId = `temp_${Date.now()}`;
    sessionStorage.setItem(tempId, JSON.stringify(sessionData));
    navigate(createPageUrl(`LiveWorkout?id=${tempId}`));
  };

  const applyToCalendar = async (workout, selectedDate) => {
    console.log("Apply workout to calendar:", workout, selectedDate);
    alert(`Workout "${workout.name}" added to ${selectedDate}!`);
    setWorkoutToView(null);
  };

  const handleAskSensei = () => {
    // Build context message for Sensei - emphasizing immediate training
    // Use similar structure to WorkoutSelectionModal so Chat can extract display message
    const dateStr = format(new Date(), 'EEEE, MMMM d, yyyy');
    const isoDate = format(new Date(), 'yyyy-MM-dd');

    let prompt;
    if (coachPrompt.trim()) {
      prompt = `[WORKOUT REQUEST for ${dateStr} (${isoDate}) - TODAY - TRAIN NOW]

I want to start training RIGHT NOW. Here's what I'm looking for: ${coachPrompt}

Please suggest a workout that matches this request. After I approve, start the live workout session immediately so I can begin training.`;
    } else {
      prompt = `[WORKOUT REQUEST for ${dateStr} (${isoDate}) - TODAY - TRAIN NOW]

I want to start training RIGHT NOW but I'm not sure what to do. Help me decide what to train based on my goals and recent activity. Ask me a quick question about what I'm in the mood for, or suggest a few workout options. Once I pick one, start the live workout session immediately.`;
    }

    // Store prompt in localStorage for the Chat page to pick up
    localStorage.setItem('pendingChatPrompt', prompt);
    localStorage.setItem('pendingChatPromptTime', Date.now().toString());

    navigate("/Chat");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-24">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-32 mb-6" />
          <div className="h-48 bg-gray-200 rounded-3xl mb-6" />
          <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
          <div className="flex gap-4">
            <div className="h-48 w-56 bg-gray-200 rounded-2xl flex-shrink-0" />
            <div className="h-48 w-56 bg-gray-200 rounded-2xl flex-shrink-0" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Train Now</h1>
          <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, MMM d')}</p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
        </button>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workouts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Search Results */}
      {showSearch && searchQuery.trim() && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">
            Results for "{searchQuery}"
          </h2>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.slice(0, 6).map(workout => (
                <CompactWorkoutCard
                  key={workout.id}
                  workout={workout}
                  onStart={startWorkout}
                  onView={setWorkoutToView}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-2xl">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No workouts found</p>
              <Link
                to={createPageUrl("Chat")}
                className="text-primary-500 font-medium mt-2 inline-flex items-center gap-1"
              >
                <Sparkles className="w-4 h-4" /> Ask AI to create one
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Content (hidden during search) */}
      {!showSearch && (
        <>
          {/* Featured / Quick Start - 3-tier: calendar -> cache -> AI */}
          <QuickStartCard
            workout={featuredWorkout}
            onStart={startWorkout}
            isFromCalendar={isFromCalendar}
            isLoading={suggestionLoading}
            reasoning={suggestionReasoning}
          />

          {/* Ask Sensei Section - Compact */}
          <div className="bg-gradient-to-br from-primary-50 to-red-50 rounded-xl p-3 border border-primary-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-[#FE5334] rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 text-sm">Ask Sensei</h3>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Not sure what to train? Let Sensei help you decide.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., 'upper body' or 'quick HIIT'"
                value={coachPrompt}
                onChange={(e) => setCoachPrompt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAskSensei()}
                className="flex-1 min-w-0 px-3 py-2 bg-white border border-primary-100 rounded-lg text-sm focus:ring-2 focus:ring-[#FE5334] focus:border-transparent placeholder:text-gray-400"
              />
              <button
                onClick={handleAskSensei}
                className="px-3 py-2 bg-[#FE5334] text-white rounded-lg hover:bg-[#E84A2D] transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0"
              >
                Ask
              </button>
            </div>
          </div>

          {/* Quick Workouts */}
          <WorkoutRow
            title="Quick Workouts"
            icon={Clock}
            workouts={quickWorkouts}
            onStart={startWorkout}
            onView={setWorkoutToView}
          />

          {/* Strength */}
          <WorkoutRow
            title="Strength"
            icon={Dumbbell}
            workouts={getWorkoutsByDiscipline('strength')}
            onStart={startWorkout}
            onView={setWorkoutToView}
            seeAllLink={createPageUrl("PredefinedWorkouts")}
          />

          {/* HIIT */}
          <WorkoutRow
            title="HIIT & Cardio"
            icon={Flame}
            workouts={[...getWorkoutsByDiscipline('hiit'), ...getWorkoutsByDiscipline('cardio')].slice(0, 6)}
            onStart={startWorkout}
            onView={setWorkoutToView}
          />

          {/* Browse All CTA */}
          <Link
            to={createPageUrl("PredefinedWorkouts")}
            className="block bg-gray-100 rounded-2xl p-4 text-center hover:bg-gray-200 transition-colors"
          >
            <Dumbbell className="w-6 h-6 text-gray-400 mx-auto mb-1" />
            <p className="font-semibold text-gray-900 text-sm">Browse All Workouts</p>
            <p className="text-xs text-gray-500">{workouts.length} available</p>
          </Link>
        </>
      )}

      {/* Workout Detail Modal */}
      {workoutToView && (
        <WorkoutDetailModal
          workout={workoutToView}
          exercises={exercises}
          onClose={() => setWorkoutToView(null)}
          onApply={applyToCalendar}
          onDuplicate={() => {}}
        />
      )}
    </div>
  );
}
