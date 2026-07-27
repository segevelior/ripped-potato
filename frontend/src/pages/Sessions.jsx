import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SessionTemplate, Exercise } from "@/api/entities";
import { Search, Plus, Filter, Play } from "lucide-react";
import SessionDetailModal from "@/components/predefined/SessionDetailModal";
import CreateSessionModal from "@/components/predefined/CreateSessionModal";
import SessionCard from "@/components/predefined/SessionCard";
import { createPageUrl } from "@/utils";
import { toast } from "@/components/ui/use-toast";
import {
  getActiveSession,
  startLiveSession,
  clearActiveSession,
  parseTemplateToSessionData
} from "@/utils/liveSession";

// Helper function to get available categories from workouts
const getAvailableCategories = (workouts) => {
  const disciplineSet = new Set();
  workouts.forEach(workout => {
    workout.primary_disciplines?.forEach(discipline => {
      disciplineSet.add(discipline.toLowerCase());
    });
  });

  // Map to readable labels (disciplines not listed here get a title-cased fallback)
  const categoryLabels = {
    strength: 'Strength',
    running: 'Running',
    cycling: 'Cycling',
    climbing: 'Climbing',
    hiit: 'HIIT',
    cardio: 'Cardio',
    mobility: 'Mobility',
    calisthenics: 'Calisthenics',
  };

  const toTitleCase = (str) =>
    str.replace(/\b\w/g, char => char.toUpperCase());

  const categories = [{ id: 'all', label: 'All' }];
  [...disciplineSet].sort().forEach(discipline => {
    categories.push({
      id: discipline,
      label: categoryLabels[discipline] || toTitleCase(discipline)
    });
  });

  return categories;
};

const BOOKMARKED_SESSIONS_KEY = 'bookmarkedSessions';
// Pre-rename key (workout → session). Read-and-migrate only: never written.
const LEGACY_BOOKMARKED_SESSIONS_KEY = 'bookmarkedWorkouts';

export default function Sessions() {
  const navigate = useNavigate();
  const [sessionTemplates, setSessionTemplates] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);

  // New state for search and filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [bookmarkedSessions, setBookmarkedSessions] = useState(() => {
    // Load bookmarks from localStorage. Plain key shim for the workout→session
    // rename: read the pre-rename key when the new one is missing, then rewrite
    // under the new key and drop the old one. Keep for at least two releases.
    try {
      const saved = localStorage.getItem(BOOKMARKED_SESSIONS_KEY);
      if (saved) return JSON.parse(saved);

      const legacy = localStorage.getItem(LEGACY_BOOKMARKED_SESSIONS_KEY);
      if (!legacy) return [];

      const parsed = JSON.parse(legacy);
      localStorage.setItem(BOOKMARKED_SESSIONS_KEY, legacy);
      localStorage.removeItem(LEGACY_BOOKMARKED_SESSIONS_KEY);
      return parsed;
    } catch {
      return [];
    }
  });

  // Active workout state (for resume/conflict handling)
  const [activeSession, setActiveSession] = useState(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingNewWorkout, setPendingNewWorkout] = useState(null);

  useEffect(() => {
    // Check for active workout on mount
    setActiveSession(getActiveSession());
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workoutData, exerciseData] = await Promise.all([
        SessionTemplate.list(),
        Exercise.list()
      ]);
      setSessionTemplates(workoutData || []);
      setExercises(exerciseData || []);
    } catch (error) {
      console.error("Error loading data:", error);
      setSessionTemplates([]);
      setExercises([]);
    }
    setIsLoading(false);
  };

  const handleView = (workout) => {
    setSelectedWorkout(workout);
    setShowDetailModal(true);
  };

  const handleEdit = (workout) => {
    // Open the create modal in edit mode with workout data
    setEditingWorkout(workout);
    setShowCreateModal(true);
  };

  const handleDuplicate = async (workout) => {
    try {
      const duplicatedWorkout = {
        ...workout,
        name: `${workout.name} (Copy)`,
        id: undefined
      };
      await SessionTemplate.create(duplicatedWorkout);
      await loadData();
      alert("Session duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating workout:", error);
      alert("Error duplicating session. Please try again.");
    }
  };

  const handleDelete = async (workout) => {
    try {
      await SessionTemplate.delete(workout.id);
      await loadData();
    } catch (error) {
      console.error("Error deleting workout:", error);
    }
  };

  const handleCreate = async (newWorkout) => {
    try {
      await SessionTemplate.create(newWorkout);
      await loadData();
      setShowCreateModal(false);
      setEditingWorkout(null);
    } catch (error) {
      console.error("Error creating workout:", error);
    }
  };

  const handleUpdate = async (updatedWorkout) => {
    try {
      await SessionTemplate.update(updatedWorkout.id, updatedWorkout);
      await loadData();
      setShowCreateModal(false);
      setEditingWorkout(null);
    } catch (error) {
      console.error("Error updating workout:", error);
    }
  };

  const handleSaveWorkout = async (workoutData) => {
    if (editingWorkout) {
      await handleUpdate(workoutData);
    } else {
      await handleCreate(workoutData);
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setEditingWorkout(null);
  };

  const handleApplyToCalendar = (workout, date) => {
    console.log("Apply workout to calendar:", workout, date);
    toast({
      title: "Added to Calendar",
      description: `"${workout.name}" scheduled for ${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
    });
  };

  const handleBookmark = (workout, isBookmarked) => {
    let updatedBookmarks;
    if (isBookmarked) {
      updatedBookmarks = [...bookmarkedSessions, workout.id];
    } else {
      updatedBookmarks = bookmarkedSessions.filter(id => id !== workout.id);
    }
    setBookmarkedSessions(updatedBookmarks);
    localStorage.setItem(BOOKMARKED_SESSIONS_KEY, JSON.stringify(updatedBookmarks));
  };

  const startSession = (workout) => {
    // Check for existing active workout
    if (activeSession) {
      setPendingNewWorkout(workout);
      setShowConflictModal(true);
      return;
    }
    doStartWorkout(workout);
  };

  const doStartWorkout = (workout) => {
    try {
      const sessionData = parseTemplateToSessionData(workout, {
        sourceTemplateId: workout._id || workout.id,
        sourceTemplateIsCommon: workout.isCommon
      });
      startLiveSession(sessionData);
      navigate(createPageUrl('LiveSession')); // No ID param needed
    } catch (error) {
      console.error('[Sessions] Failed to start workout:', error);
      alert(`Failed to start session: ${error.message}`);
    }
  };

  const resumeWorkout = () => {
    setShowConflictModal(false);
    setPendingNewWorkout(null);
    navigate(createPageUrl('LiveSession'));
  };

  const discardAndStartNew = () => {
    clearActiveSession();
    setActiveSession(null);
    setShowConflictModal(false);

    if (pendingNewWorkout) {
      doStartWorkout(pendingNewWorkout);
      setPendingNewWorkout(null);
    }
  };

  const cancelConflictModal = () => {
    setShowConflictModal(false);
    setPendingNewWorkout(null);
  };

  // Filter workouts based on search and category
  const filteredWorkouts = sessionTemplates.filter(workout => {
    // Search filter
    const matchesSearch = searchQuery === "" ||
      workout.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workout.goal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workout.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    // Category filter
    const matchesCategory = selectedCategory === "all" ||
      workout.primary_disciplines?.some(d => d.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Sessions</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-accent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading sessions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Conflict Modal - shown when trying to start new workout with existing one */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Unfinished Session</h3>
            <p className="text-gray-600 mb-1">
              You have an unfinished session:
            </p>
            <p className="font-semibold text-gray-900 mb-4">
              {activeSession?.data?.title}
            </p>
            <p className="text-gray-600 mb-6">
              Would you like to resume it or start a new session?
            </p>
            <div className="space-y-3">
              <button
                onClick={resumeWorkout}
                className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
              >
                Resume Session
              </button>
              <button
                onClick={discardAndStartNew}
                className="w-full py-3 bg-red-50 text-red-700 font-semibold rounded-xl hover:bg-red-100 transition-colors"
              >
                Discard & Start New
              </button>
              <button
                onClick={cancelConflictModal}
                className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Workout Banner - shown when active workout exists */}
      {activeSession && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-900">Session in Progress</p>
              <p className="text-sm text-green-700 truncate">{activeSession.data?.title}</p>
              <p className="text-xs text-green-600">
                {Math.floor(activeSession.totalSessionTime / 60)} min elapsed
              </p>
            </div>
            <button
              onClick={resumeWorkout}
              className="px-4 py-2 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sessions</h1>
          <p className="text-base text-gray-600 mt-1">
            {filteredWorkouts.length} session{filteredWorkouts.length !== 1 ? 's' : ''} available
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="hidden md:flex bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold items-center gap-2 transition-colors shadow-lg shadow-gray-900/10"
        >
          <Plus className="w-5 h-5" />
          Create Session
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all text-base"
        />
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {getAvailableCategories(sessionTemplates).map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`px-5 py-2.5 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${selectedCategory === category.id
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Workouts Grid */}
      {filteredWorkouts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No sessions found</h3>
          <p className="text-gray-600 mb-6">
            {searchQuery || selectedCategory !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first session to get started'}
          </p>
          {!searchQuery && selectedCategory === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Session
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkouts.map((workout) => (
            <SessionCard
              key={workout.id}
              workout={workout}
              onView={handleView}
              onBookmark={handleBookmark}
              isBookmarked={bookmarkedSessions.includes(workout.id)}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onStart={startSession}
              onCalendar={handleApplyToCalendar}
            />
          ))}
        </div>
      )}

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Workout Detail Modal */}
      {showDetailModal && selectedWorkout && (
        <SessionDetailModal
          workout={selectedWorkout}
          exercises={exercises}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedWorkout(null);
          }}
          onApply={handleApplyToCalendar}
          onEdit={(workout) => {
            setShowDetailModal(false);
            handleEdit(workout);
          }}
          onDelete={handleDelete}
          onStart={startSession}
        />
      )}

      {/* Create/Edit Workout Modal */}
      {showCreateModal && (
        <CreateSessionModal
          exercises={exercises}
          onClose={handleCloseCreateModal}
          onSave={handleSaveWorkout}
          editWorkout={editingWorkout}
        />
      )}
    </div>
  );
}