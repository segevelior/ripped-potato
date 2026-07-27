import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Calendar, Plus } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { CalendarEvent } from '@/api/entities';
import {
  getActiveSession,
  startLiveSession,
  clearActiveSession,
  parseTemplateToSessionData
} from '@/utils/liveSession';
import { disciplineToType } from '@/utils/disciplineToType';

/**
 * ActionButtons component displays special action buttons in chat messages.
 * These are different from quick replies - they perform specific actions
 * like starting a workout or adding to calendar.
 *
 * Format in AI messages:
 * <action-button action="train-now" session='{"title":"...","exercises":[...]}' date="2025-01-15">Start Training Now</action-button>
 * <action-button action="add-to-calendar" date="2025-01-15" session='{"title":"..."}'>Add to Calendar</action-button>
 *
 * The pre-rename `workout='...'` attribute is still accepted on parse — it is
 * what conversations persisted before the workout→session rename contain.
 */
export function ActionButtons({ actions, disabled }) {
  const navigate = useNavigate();
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  if (!actions || actions.length === 0) return null;

  const handleAction = async (action) => {
    if (disabled) return;

    switch (action.type) {
      case 'train-now':
        // Check for existing active workout
        const existing = getActiveSession();
        if (existing) {
          setActiveSession(existing);
          setPendingAction(action);
          setShowConflictModal(true);
          return;
        }
        // First save to calendar, then start the workout
        await saveWorkoutToCalendarAndStart(action.session, action.date);
        break;
      case 'add-to-calendar':
        addToCalendar();
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  };

  const resumeWorkout = () => {
    setShowConflictModal(false);
    setPendingAction(null);
    navigate(createPageUrl('LiveSession'));
  };

  const discardAndStartNew = async () => {
    clearActiveSession();
    setShowConflictModal(false);
    if (pendingAction) {
      await saveWorkoutToCalendarAndStart(pendingAction.session, pendingAction.date);
      setPendingAction(null);
    }
  };

  const cancelConflictModal = () => {
    setShowConflictModal(false);
    setPendingAction(null);
  };

  // Save workout to calendar AND start live workout
  const saveWorkoutToCalendarAndStart = async (workoutData, dateStr) => {
    try {
      if (!workoutData) {
        console.error('No workout data provided');
        alert('Workout data is missing. Please try again or ask Sensei to create a new workout.');
        return;
      }

      let workout;
      if (typeof workoutData === 'string') {
        try {
          workout = JSON.parse(workoutData);
        } catch (parseError) {
          console.error('Failed to parse workout string:', parseError, workoutData);
          alert('There was an issue with the workout data format. Please ask Sensei to create the workout again.');
          return;
        }
      } else {
        workout = workoutData;
      }

      if (!workout || (!workout.title && !workout.name)) {
        console.error('Invalid workout object:', workout);
        alert('The workout data appears to be incomplete. Please ask Sensei to create the workout again.');
        return;
      }

      let sessionData;
      try {
        sessionData = parseTemplateToSessionData(workout);
      } catch (parseError) {
        console.error('Failed to parse workout data:', parseError);
        alert(parseError.message || 'The workout data is invalid. Please ask Sensei to create the workout again.');
        return;
      }

      // Use provided date or default to today
      const workoutDate = dateStr || format(new Date(), 'yyyy-MM-dd');

      const rawType = workout.type || workout.primary_disciplines?.[0];
      const discipline = rawType ? (disciplineToType[rawType.toLowerCase()] || rawType.toLowerCase()) : null;

      // Build exercises for calendar format (must match CalendarEvent schema)
      const calendarExercises = sessionData.exercises.map((ex) => ({
        exerciseName: ex.exercise_name,
        targetSets: ex.sets.length,
        targetReps: ex.sets[0]?.target_reps,
        notes: ex.notes || ""
      }));

      // Save to calendar using CalendarEvent format (same as Calendar.jsx)
      const calendarEventData = {
        date: workoutDate,
        title: sessionData.title,
        type: 'session',
        status: 'scheduled',
        sessionDetails: {
          discipline,
          estimatedDuration: sessionData.duration_minutes,
          exercises: calendarExercises
        },
        notes: 'AI-generated workout'
      };

      try {
        await CalendarEvent.create(calendarEventData);
      } catch (calendarError) {
        console.error('Failed to save to calendar:', calendarError);
        // Show error to user but still continue to start workout
        console.warn('Continuing to start workout despite calendar save failure');
      }

      // Store in localStorage using the new workout session utility and navigate
      startLiveSession(sessionData);
      navigate(createPageUrl('LiveSession'));
    } catch (error) {
      console.error('Error starting workout:', error);
      alert('Failed to start workout. Please try again.');
    }
  };

  // Nothing on the Calendar page ever read the sessionStorage hand-off this used
  // to write ('pendingCalendarWorkout'), so the write was dead and is gone. The
  // button still navigates to the Calendar; wiring the pre-fill is tracked
  // separately.
  const addToCalendar = () => {
    navigate(createPageUrl('Calendar'));
  };

  const getButtonIcon = (type) => {
    switch (type) {
      case 'train-now':
        return <Play className="w-4 h-4" />;
      case 'add-to-calendar':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Plus className="w-4 h-4" />;
    }
  };

  const getButtonStyle = (type) => {
    switch (type) {
      case 'train-now':
        return 'bg-[#FE5334] text-white hover:bg-[#E84A2D] border-[#FE5334]';
      case 'add-to-calendar':
        return 'bg-blue-500 text-white hover:bg-blue-600 border-blue-500';
      default:
        return 'bg-gray-900 text-white hover:bg-gray-800 border-gray-900';
    }
  };

  return (
    <>
      {/* Conflict Modal - shown when trying to start new workout with existing one */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Unfinished Workout</h3>
            <p className="text-gray-600 mb-1">
              You have an unfinished workout:
            </p>
            <p className="font-semibold text-gray-900 mb-4">
              {activeSession?.data?.title}
            </p>
            <p className="text-gray-600 mb-6">
              Would you like to resume it or start a new workout?
            </p>
            <div className="space-y-3">
              <button
                onClick={resumeWorkout}
                className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
              >
                Resume Workout
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

      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => handleAction(action)}
            disabled={disabled}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl
              border transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              ${getButtonStyle(action.type)}
            `}
          >
            {getButtonIcon(action.type)}
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Extract a raw JSON attribute value (single- or double-quoted) for `name`.
 * The JSON payload itself uses double quotes, so the closing delimiter is found
 * by looking for the quote that follows the final `}` rather than by regex.
 * @returns {string|null}
 */
function extractJsonAttribute(attributesStr, name) {
  const singleQuoteToken = `${name}='`;
  const doubleQuoteToken = `${name}="`;
  const singleQuoteStart = attributesStr.indexOf(singleQuoteToken);
  const doubleQuoteStart = attributesStr.indexOf(doubleQuoteToken);

  if (singleQuoteStart !== -1) {
    const startIdx = singleQuoteStart + singleQuoteToken.length;
    let endIdx = attributesStr.indexOf("}'", startIdx);
    if (endIdx !== -1) {
      return attributesStr.substring(startIdx, endIdx + 1);
    }
    // Fallback: find last single quote
    endIdx = attributesStr.lastIndexOf("'");
    return endIdx > startIdx ? attributesStr.substring(startIdx, endIdx) : null;
  }

  if (doubleQuoteStart !== -1) {
    const startIdx = doubleQuoteStart + doubleQuoteToken.length;
    const endIdx = attributesStr.indexOf('}"', startIdx);
    if (endIdx !== -1) {
      return attributesStr.substring(startIdx, endIdx + 1);
    }
  }

  return null;
}

/**
 * Parses action buttons from message content.
 * Returns { cleanContent, actionButtons }
 *
 * Format:
 * <action-button action="train-now" session='{"title":"..."}'>Start Training</action-button>
 *
 * Both `session=` (current) and `workout=` (pre-rename, still present in
 * persisted conversations) are accepted.
 */
export function parseActionButtons(content) {
  if (!content) return { cleanContent: content, actionButtons: [] };

  // Match action-button tags
  const actionButtonRegex = /<action-button\s+([^>]+)>([^<]*)<\/action-button>/gi;
  const matches = [...content.matchAll(actionButtonRegex)];

  if (matches.length === 0) {
    return { cleanContent: content, actionButtons: [] };
  }

  const actionButtons = matches.map(match => {
    const attributesStr = match[1];
    const label = match[2].trim();

    // Parse attributes
    const actionMatch = attributesStr.match(/action=["']([^"']+)["']/);
    const dateMatch = attributesStr.match(/date=["']([^"']+)["']/);

    // Parse the session JSON. Accept the new `session=` spelling first and fall
    // back to the pre-rename `workout=` so old persisted messages still render
    // working buttons.
    let session = null;
    const sessionStr =
      extractJsonAttribute(attributesStr, 'session') ??
      extractJsonAttribute(attributesStr, 'workout');

    if (sessionStr) {
      try {
        // Handle HTML entity encoding
        const decodedStr = sessionStr
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        session = JSON.parse(decodedStr);
      } catch (e) {
        console.error('Failed to parse session JSON:', e, 'Raw string:', sessionStr);
        // Try to fix common issues
        try {
          // Sometimes the AI uses curly quotes or other issues
          const fixedStr = sessionStr
            .replace(/[""]/g, '"')  // Replace curly quotes
            .replace(/['']/g, "'")  // Replace curly single quotes
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
          session = JSON.parse(fixedStr);
        } catch (e2) {
          console.error('Still failed after fixing:', e2);
          session = null;
        }
      }
    }

    return {
      type: actionMatch ? actionMatch[1] : 'unknown',
      label,
      session,
      date: dateMatch ? dateMatch[1] : null
    };
  });

  // Remove action-button tags from content
  const cleanContent = content.replace(actionButtonRegex, '').trim();

  return { cleanContent, actionButtons };
}

export default ActionButtons;
