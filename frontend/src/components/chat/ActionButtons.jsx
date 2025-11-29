import { useNavigate } from 'react-router-dom';
import { Play, Calendar, Plus } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { CalendarEvent } from '@/api/entities';

// Helper to validate MongoDB ObjectId format (24 hex characters)
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * ActionButtons component displays special action buttons in chat messages.
 * These are different from quick replies - they perform specific actions
 * like starting a workout or adding to calendar.
 *
 * Format in AI messages:
 * <action-button action="train-now" workout='{"title":"...","exercises":[...]}' date="2025-01-15">Start Training Now</action-button>
 * <action-button action="add-to-calendar" date="2025-01-15" workout='{"title":"..."}'>Add to Calendar</action-button>
 */
export function ActionButtons({ actions, disabled }) {
  const navigate = useNavigate();

  if (!actions || actions.length === 0) return null;

  const handleAction = async (action) => {
    if (disabled) return;

    switch (action.type) {
      case 'train-now':
        // First save to calendar, then start the workout
        await saveWorkoutToCalendarAndStart(action.workout, action.date);
        break;
      case 'add-to-calendar':
        addToCalendar(action.date, action.workout);
        break;
      default:
        console.warn('Unknown action type:', action.type);
    }
  };

  // Build session data in the format LiveWorkout expects
  const buildSessionData = (workout) => {
    const sessionData = {
      title: workout.title || workout.name || "AI Workout",
      type: workout.type || workout.primary_disciplines?.[0] || "strength",
      duration_minutes: workout.duration_minutes || workout.estimated_duration || 60,
      exercises: []
    };

    // Parse exercises - handle both flat array and blocks format
    const exerciseList = workout.exercises || [];

    // If it's in blocks format, flatten it
    if (workout.blocks) {
      workout.blocks.forEach(block => {
        block.exercises?.forEach(ex => {
          exerciseList.push(ex);
        });
      });
    }

    exerciseList.forEach((ex, index) => {
      // Only include exercise_id if it's a valid MongoDB ObjectId (24 hex chars)
      // Backend will resolve exercise by name if ID is missing/invalid
      const rawExerciseId = ex.exercise_id || ex.exerciseId;
      const newExercise = {
        exercise_id: isValidObjectId(rawExerciseId) ? rawExerciseId : null,
        exercise_name: ex.exercise_name || ex.exerciseName || ex.name || "Exercise",
        notes: ex.notes || "",
        order: index,
        sets: []
      };

      // Parse volume/sets
      let numSets = 3;
      let numReps = 10;
      let restSeconds = 90;

      // Handle different formats
      if (ex.sets && Array.isArray(ex.sets)) {
        // Already has sets array
        newExercise.sets = ex.sets.map(set => ({
          target_reps: set.target_reps || set.targetReps || set.reps || 10,
          reps: 0,
          weight: set.weight || 0,
          rest_seconds: set.rest_seconds || set.restSeconds || 90,
          is_completed: false
        }));
      } else {
        // Parse from volume string like "3x10"
        const volume = ex.volume || ex.sets_reps || "3x10";
        if (typeof volume === 'string' && volume.includes('x')) {
          const [setsStr, repsStr] = volume.split('x');
          numSets = parseInt(setsStr) || 3;
          numReps = parseInt(repsStr) || 10;
        }

        // Parse rest time
        if (ex.rest) {
          const restMatch = ex.rest.match(/\d+/);
          if (restMatch) restSeconds = parseInt(restMatch[0]);
        }

        // Create sets
        for (let i = 0; i < numSets; i++) {
          newExercise.sets.push({
            target_reps: numReps,
            reps: 0,
            weight: 0,
            rest_seconds: restSeconds,
            is_completed: false
          });
        }
      }

      if (newExercise.sets.length > 0) {
        sessionData.exercises.push(newExercise);
      }
    });

    return sessionData;
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

      if (!workout || !workout.title) {
        console.error('Invalid workout object:', workout);
        alert('The workout data appears to be incomplete. Please ask Sensei to create the workout again.');
        return;
      }

      const sessionData = buildSessionData(workout);

      // Use provided date or default to today
      const workoutDate = dateStr || format(new Date(), 'yyyy-MM-dd');

      // Map discipline to valid workout type
      const disciplineToType = {
        'calisthenics': 'calisthenics',
        'strength': 'strength',
        'cardio': 'cardio',
        'hiit': 'hiit',
        'yoga': 'flexibility',
        'stretching': 'flexibility',
        'flexibility': 'flexibility',
        'mobility': 'mobility',
        'recovery': 'recovery',
        'hybrid': 'hybrid'
      };

      const rawType = (workout.type || workout.primary_disciplines?.[0] || "strength").toLowerCase();
      const workoutType = disciplineToType[rawType] || 'strength';

      // Build exercises for calendar format (must match CalendarEvent schema)
      const calendarExercises = sessionData.exercises.map((ex) => ({
        exerciseName: ex.exercise_name,
        targetSets: ex.sets.length,
        targetReps: ex.sets[0]?.target_reps || 10,
        notes: ex.notes || ""
      }));

      // Save to calendar using CalendarEvent format (same as Calendar.jsx)
      const calendarEventData = {
        date: workoutDate,
        title: sessionData.title,
        type: 'workout',
        status: 'scheduled',
        workoutDetails: {
          type: workoutType,
          estimatedDuration: sessionData.duration_minutes,
          exercises: calendarExercises
        },
        notes: 'AI-generated workout'
      };

      console.log('Creating calendar event with data:', calendarEventData);

      try {
        const result = await CalendarEvent.create(calendarEventData);
        console.log('Workout saved to calendar for', workoutDate, 'Result:', result);
      } catch (calendarError) {
        console.error('Failed to save to calendar:', calendarError);
        // Show error to user but still continue to start workout
        console.warn('Continuing to start workout despite calendar save failure');
      }

      // Store in sessionStorage and navigate to LiveWorkout
      const tempId = `temp_${Date.now()}`;
      sessionStorage.setItem(tempId, JSON.stringify(sessionData));
      navigate(createPageUrl(`LiveWorkout?id=${tempId}`));
    } catch (error) {
      console.error('Error starting workout:', error);
      alert('Failed to start workout. Please try again.');
    }
  };

  const addToCalendar = (date, workoutData) => {
    // Navigate to calendar with the workout data
    try {
      const workout = typeof workoutData === 'string' ? JSON.parse(workoutData) : workoutData;
      sessionStorage.setItem('pendingCalendarWorkout', JSON.stringify({
        date,
        workout
      }));
      navigate(createPageUrl('Calendar'));
    } catch (error) {
      console.error('Error adding to calendar:', error);
      navigate(createPageUrl('Calendar'));
    }
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
  );
}

/**
 * Parses action buttons from message content.
 * Returns { cleanContent, actionButtons }
 *
 * Format:
 * <action-button action="train-now" workout='{"title":"..."}'>Start Training</action-button>
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

    // Parse workout JSON - handle single-quoted attribute with JSON inside
    // The JSON itself uses double quotes, so we need careful extraction
    let workout = null;
    let workoutStr = null;

    // Try to find workout=' and extract until the matching closing '
    // Account for the fact that JSON inside uses double quotes
    const singleQuoteStart = attributesStr.indexOf("workout='");
    const doubleQuoteStart = attributesStr.indexOf('workout="');

    if (singleQuoteStart !== -1) {
      // Extract from after workout=' to the next single quote that's followed by space or end
      const startIdx = singleQuoteStart + 9; // length of "workout='"
      // Find the closing single quote - should be after a }
      let endIdx = attributesStr.indexOf("}'", startIdx);
      if (endIdx !== -1) {
        workoutStr = attributesStr.substring(startIdx, endIdx + 1);
      } else {
        // Fallback: find last single quote
        endIdx = attributesStr.lastIndexOf("'");
        if (endIdx > startIdx) {
          workoutStr = attributesStr.substring(startIdx, endIdx);
        }
      }
    } else if (doubleQuoteStart !== -1) {
      const startIdx = doubleQuoteStart + 9; // length of 'workout="'
      let endIdx = attributesStr.indexOf('}"', startIdx);
      if (endIdx !== -1) {
        workoutStr = attributesStr.substring(startIdx, endIdx + 1);
      }
    }

    // Log for debugging
    if (workoutStr) {
      console.log('Extracted workout string:', workoutStr.substring(0, 100) + '...');
    }

    if (workoutStr) {
      try {
        // Handle HTML entity encoding
        const decodedStr = workoutStr
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        workout = JSON.parse(decodedStr);
      } catch (e) {
        console.error('Failed to parse workout JSON:', e, 'Raw string:', workoutStr);
        // Try to fix common issues
        try {
          // Sometimes the AI uses curly quotes or other issues
          const fixedStr = workoutStr
            .replace(/[""]/g, '"')  // Replace curly quotes
            .replace(/['']/g, "'")  // Replace curly single quotes
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
          workout = JSON.parse(fixedStr);
        } catch (e2) {
          console.error('Still failed after fixing:', e2);
          workout = null;
        }
      }
    }

    return {
      type: actionMatch ? actionMatch[1] : 'unknown',
      label,
      workout,
      date: dateMatch ? dateMatch[1] : null
    };
  });

  // Remove action-button tags from content
  const cleanContent = content.replace(actionButtonRegex, '').trim();

  return { cleanContent, actionButtons };
}

export default ActionButtons;
