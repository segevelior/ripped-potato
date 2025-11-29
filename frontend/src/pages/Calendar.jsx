import { useState, useEffect } from "react";
import { CalendarEvent, Plan } from "@/api/entities";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isValid, isToday, isSameDay } from "date-fns";

import WorkoutSelectionModal from "../components/calendar/WorkoutSelectionModal";
import CalendarEventDetailModal from "../components/calendar/CalendarEventDetailModal";

// Helper to get user's week start preference from localStorage
const getWeekStartDay = () => {
  try {
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    return authUser.settings?.weekStartDay ?? 0; // Default to Sunday (0)
  } catch {
    return 0;
  }
};

// Color palette for workout types - using design system colors
const WORKOUT_COLORS = [
  { bg: 'bg-indigo-50', dot: 'bg-indigo-500', text: 'text-indigo-700', border: 'border-indigo-100' },      // strength
  { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-100' },  // cardio
  { bg: 'bg-violet-50', dot: 'bg-violet-500', text: 'text-violet-700', border: 'border-violet-100' },      // yoga/flexibility
  { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-100' },          // hiit
  { bg: 'bg-rose-50', dot: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-100' },              // calisthenics
  { bg: 'bg-cyan-50', dot: 'bg-cyan-500', text: 'text-cyan-700', border: 'border-cyan-100' },              // mobility
  { bg: 'bg-slate-100', dot: 'bg-slate-400', text: 'text-slate-600', border: 'border-slate-200' },         // recovery
  { bg: 'bg-purple-50', dot: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-100' },      // meditation
  { bg: 'bg-teal-50', dot: 'bg-teal-500', text: 'text-teal-700', border: 'border-teal-100' },              // hybrid
  { bg: 'bg-sky-50', dot: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-100' },                  // other
];

// Status-based styling - for showing what's done vs pending
const STATUS_STYLES = {
  completed: {
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Done',
    dotStyle: 'ring-2 ring-emerald-400 ring-offset-1',
    cardOverlay: ''
  },
  in_progress: {
    badge: 'bg-amber-100 text-amber-700',
    label: 'In Progress',
    dotStyle: 'ring-2 ring-amber-400 ring-offset-1',
    cardOverlay: ''
  },
  scheduled: {
    badge: 'bg-gray-100 text-gray-500',
    label: 'Scheduled',
    dotStyle: '',
    cardOverlay: ''
  },
  skipped: {
    badge: 'bg-gray-100 text-gray-400 line-through',
    label: 'Skipped',
    dotStyle: 'opacity-40',
    cardOverlay: 'opacity-50'
  }
};

// Get color for a workout type (circular index for 10+ types)
const getWorkoutTypeColor = (typeIndex) => {
  return WORKOUT_COLORS[typeIndex % WORKOUT_COLORS.length];
};

// Map workout types to their color indices
const getTypeColorIndex = (type, typeMap) => {
  if (!typeMap.has(type)) {
    typeMap.set(type, typeMap.size);
  }
  return typeMap.get(type);
};

// Get color for event type
const getEventTypeColor = (eventType) => {
  switch (eventType) {
    case 'workout':
      return WORKOUT_COLORS[0]; // blue
    case 'rest':
      return WORKOUT_COLORS[6]; // yellow
    case 'deload':
      return WORKOUT_COLORS[5]; // cyan
    case 'milestone':
      return WORKOUT_COLORS[2]; // purple
    default:
      return WORKOUT_COLORS[0];
  }
};

// Figma-style Calendar View Component (Month View Only)
const CalendarView = ({ events, activePlans, currentDate, onDateChange, onAddEvent, onEditEvent, onDeleteEvent, onMoveEvent, weekStartDay }) => {
  const [selectedDate, setSelectedDate] = useState(new Date()); // Default to today
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [showEventDetailModal, setShowEventDetailModal] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [viewingEvent, setViewingEvent] = useState(null);
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);
  const [pickerYear, setPickerYear] = useState(currentDate.getFullYear());

  // Create a stable type-to-color mapping based on workoutDetails.type
  const workoutTypeMap = new Map();
  events.forEach(e => {
    const type = e.workoutDetails?.type || e.type || 'general';
    if (!workoutTypeMap.has(type)) {
      workoutTypeMap.set(type, workoutTypeMap.size);
    }
  });

  // Week day labels based on start day preference
  const weekDays = weekStartDay === 1
    ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]  // Monday start
    : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // Sunday start

  // Click on date -> select it (don't change view)
  const handleDateClick = (date) => {
    setSelectedDate(date);
  };

  // Click + button to add workout
  const handleAddClick = (date) => {
    setSelectedDate(date);
    setShowWorkoutModal(true);
  };

  // View existing event details (not edit)
  const handleViewEvent = (event) => {
    if (!event || !event.date) return;
    const eventDate = typeof event.date === 'string' ? parseISO(event.date) : new Date(event.date);
    if (isValid(eventDate)) {
      setViewingEvent(event);
      setSelectedDate(eventDate);
      setShowEventDetailModal(true);
    }
  };

  const handleApplyWorkout = (workoutData) => {
    onAddEvent({
      ...workoutData,
      date: format(selectedDate, 'yyyy-MM-dd')
    });
    setShowWorkoutModal(false);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, event) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    if (draggedEvent && targetDate) {
      const newDate = format(targetDate, 'yyyy-MM-dd');
      const oldDate = typeof draggedEvent.date === 'string'
        ? draggedEvent.date.split('T')[0]
        : format(new Date(draggedEvent.date), 'yyyy-MM-dd');
      if (newDate !== oldDate) {
        onMoveEvent(draggedEvent.id, newDate);
      }
    }
    setDraggedEvent(null);
    setHoveredDate(null);
  };

  const getDayData = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => {
      const eventDate = typeof e.date === 'string' ? e.date.split('T')[0] : format(new Date(e.date), 'yyyy-MM-dd');
      return eventDate === dateStr;
    });
    return dayEvents;
  };

  const getEventColor = (event) => {
    if (event.type === 'workout') {
      const type = event.workoutDetails?.type || 'strength';
      const colorIndex = getTypeColorIndex(type, workoutTypeMap);
      return getWorkoutTypeColor(colorIndex);
    }
    return getEventTypeColor(event.type);
  };

  const navigate = (direction) => {
    onDateChange(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const getDateRange = () => {
    const firstDay = startOfWeek(startOfMonth(currentDate), { weekStartsOn: weekStartDay });
    const lastDay = endOfWeek(endOfMonth(currentDate), { weekStartsOn: weekStartDay });
    return eachDayOfInterval({ start: firstDay, end: lastDay });
  };

  const dates = getDateRange();
  const selectedDayEvents = getDayData(selectedDate);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const handleMonthSelect = (monthIndex) => {
    const newDate = new Date(pickerYear, monthIndex, 1);
    onDateChange(newDate);
    setShowMonthPicker(false);
  };

  const goToToday = () => {
    const today = new Date();
    onDateChange(today);
    setSelectedDate(today);
    setShowMonthPicker(false);
  };

  // Month View (Compact)
  return (
    <>
      <div className="space-y-2">
        <div className="bg-white rounded-xl shadow-sm p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPickerYear(currentDate.getFullYear());
                  setShowMonthPicker(!showMonthPicker);
                }}
                className="text-sm font-bold text-gray-900 hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
              >
                {format(currentDate, "MMMM yyyy")}
                <ChevronLeft className={`w-3 h-3 text-gray-400 transition-transform ${showMonthPicker ? 'rotate-90' : '-rotate-90'}`} />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={goToToday}
                className="px-2 py-1 text-xs font-medium text-[#FE5334] hover:bg-[#FEE1DC] rounded-lg transition-colors"
              >
                Today
              </button>
              <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <button onClick={() => navigate(1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Month/Year Picker Dropdown */}
          {showMonthPicker && (
            <div className="mb-3 p-3 bg-gray-50 rounded-xl">
              {/* Year Navigation */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setPickerYear(pickerYear - 1)}
                  className="p-1 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <span className="text-sm font-bold text-gray-900">{pickerYear}</span>
                <button
                  onClick={() => setPickerYear(pickerYear + 1)}
                  className="p-1 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Month Grid */}
              <div className="grid grid-cols-4 gap-1">
                {months.map((month, idx) => {
                  const isCurrentMonth = idx === currentDate.getMonth() && pickerYear === currentDate.getFullYear();
                  const isThisMonth = idx === new Date().getMonth() && pickerYear === new Date().getFullYear();
                  return (
                    <button
                      key={month}
                      onClick={() => handleMonthSelect(idx)}
                      className={`py-2 px-1 text-xs font-medium rounded-lg transition-colors ${
                        isCurrentMonth
                          ? 'bg-[#FE5334] text-white'
                          : isThisMonth
                            ? 'bg-[#FEE1DC] text-[#FE5334] hover:bg-[#FDD]'
                            : 'text-gray-700 hover:bg-white'
                      }`}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-1">
            {weekDays.map(day => (
              <div key={day} className="py-1 text-center text-xs font-medium text-gray-400">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid - Compact */}
          <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
            {dates.map((day, i) => {
              const dayEvents = getDayData(day);
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const isCurrentDay = isToday(day);
              const isSelected = isSameDay(day, selectedDate);
              const isDragTarget = hoveredDate && hoveredDate.getTime() === day.getTime();
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={i}
                  className={`bg-white p-1 min-h-[56px] cursor-pointer transition-all relative group ${
                    !isCurrentMonth ? 'opacity-40' : ''
                  } ${isSelected ? 'bg-[#FFF2F0] ring-2 ring-inset ring-[#FE5334]' : ''} ${isDragTarget ? 'bg-[#FFF2F0] ring-2 ring-[#FE5334]' : 'hover:bg-gray-50'}`}
                  onClick={() => handleDateClick(day)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                  onDragEnter={() => setHoveredDate(day)}
                  onDragLeave={() => setHoveredDate(null)}
                >
                  {/* + button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddClick(day);
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#FE5334] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#E84A2D] z-10"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>

                  {/* Date Number */}
                  <div className="flex justify-center mb-0.5">
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-md text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'bg-[#FE5334] text-white'
                          : isCurrentDay
                            ? 'bg-[#FEE1DC] text-[#FE5334]'
                            : isCurrentMonth
                              ? 'text-gray-900'
                              : 'text-gray-300'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Event Indicators - Horizontal bars with status */}
                  {hasEvents && (
                    <div className="space-y-0.5 px-0.5">
                      {dayEvents.slice(0, 3).map((event, idx) => {
                        const colors = getEventColor(event);
                        const status = event.status || 'scheduled';
                        const isCompleted = status === 'completed';
                        const isSkipped = status === 'skipped';
                        const isPastAndNotDone = !isCompleted && !isSkipped && new Date(event.date) < new Date().setHours(0,0,0,0);
                        const isStrava = event.externalActivityId || event.workoutDetails?.source === 'strava';
                        return (
                          <div
                            key={event.id || idx}
                            className={`pointer-events-none ${isSkipped || isPastAndNotDone ? 'opacity-40' : ''}`}
                            title={`${event.title} (${STATUS_STYLES[status]?.label || 'Scheduled'})`}
                          >
                            <div className={`h-1 rounded-full ${isStrava ? 'bg-[#FC4C02]' : colors.dot}`} />
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[8px] text-gray-400 text-center leading-none">
                          +{dayEvents.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact Workout List for Selected Day */}
        {selectedDayEvents.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {format(selectedDate, 'EEEE, MMM d')}
                </h3>
                {isToday(selectedDate) && (
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FEE1DC] text-[#FE5334]">Today</span>
                )}
              </div>
              <button
                onClick={() => handleAddClick(selectedDate)}
                className="w-8 h-8 bg-[#FE5334] text-white rounded-full flex items-center justify-center hover:bg-[#E84A2D] transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {selectedDayEvents.map((event, idx) => {
                const colors = getEventColor(event);
                const status = event.status || 'scheduled';
                const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.scheduled;
                const workoutType = event.workoutDetails?.type || event.eventType || 'Workout';
                const isCompleted = status === 'completed';
                const isSkipped = status === 'skipped';
                const isPastAndNotDone = !isCompleted && !isSkipped && new Date(event.date) < new Date().setHours(0,0,0,0);
                const isStrava = event.externalActivityId || event.workoutDetails?.source === 'strava';
                const stravaData = event.workoutDetails?.stravaData;
                return (
                  <div
                    key={event.id || idx}
                    className={`group bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden border ${
                      isStrava
                        ? 'border-l-4 border-l-[#FC4C02] border-t-orange-100 border-r-orange-100 border-b-orange-100'
                        : isCompleted
                          ? 'border-l-4 border-l-emerald-500 border-t-gray-100 border-r-gray-100 border-b-gray-100'
                          : isPastAndNotDone
                            ? 'border-l-4 border-l-gray-300 border-t-gray-100 border-r-gray-100 border-b-gray-100 opacity-60'
                            : colors.border
                    } ${statusStyle.cardOverlay}`}
                    onClick={() => handleViewEvent(event)}
                  >
                    <div className="p-3">
                      {/* Type Badge */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${isStrava ? 'bg-[#FC4C02]' : colors.dot}`}>
                          {isStrava ? (stravaData?.sportType || workoutType) : (workoutType.charAt(0).toUpperCase() + workoutType.slice(1))}
                        </span>
                        {isStrava && (
                          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="#FC4C02">
                            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
                          </svg>
                        )}
                        {isCompleted && !isStrava && (
                          <span className="flex items-center gap-0.5 text-emerald-600">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                        {isPastAndNotDone && !isStrava && (
                          <span className="text-[10px] text-gray-400 font-medium">Missed</span>
                        )}
                      </div>

                      {/* Title and Status */}
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-sm font-bold text-gray-900 line-clamp-1 ${isSkipped ? 'line-through opacity-60' : ''} ${isPastAndNotDone && !isStrava ? 'text-gray-500' : ''}`}>
                          {event.title}
                        </h4>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isStrava ? 'bg-orange-100 text-orange-700' : isPastAndNotDone ? 'bg-gray-100 text-gray-400' : statusStyle.badge
                        }`}>
                          {isStrava ? 'Synced' : isPastAndNotDone ? 'Missed' : statusStyle.label}
                        </span>
                      </div>

                      {/* Duration */}
                      <p className={`text-xs mt-1 ${isPastAndNotDone && !isStrava ? 'text-gray-400' : 'text-gray-500'}`}>
                        {event.workoutDetails?.durationMinutes || event.workoutDetails?.estimatedDuration || 60} min
                        {stravaData?.distance && ` • ${(stravaData.distance / 1000).toFixed(1)} km`}
                      </p>

                      {/* Mood & Feedback (for completed workouts) */}
                      {isCompleted && event.workoutDetails?.mood && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                          <span className="text-base" title={event.workoutDetails.mood}>
                            {event.workoutDetails.mood === 'great' && '😄'}
                            {event.workoutDetails.mood === 'good' && '🙂'}
                            {event.workoutDetails.mood === 'okay' && '😐'}
                            {event.workoutDetails.mood === 'tired' && '😕'}
                            {event.workoutDetails.mood === 'exhausted' && '😢'}
                          </span>
                          {event.workoutDetails.feedback && (
                            <span className="text-xs text-gray-500 line-clamp-1 flex-1">
                              {event.workoutDetails.feedback}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showWorkoutModal && (
        <WorkoutSelectionModal
          date={selectedDate}
          onClose={() => setShowWorkoutModal(false)}
          onApplyWorkout={handleApplyWorkout}
        />
      )}

      {showEventDetailModal && viewingEvent && (
        <CalendarEventDetailModal
          event={viewingEvent}
          onClose={() => {
            setShowEventDetailModal(false);
            setViewingEvent(null);
          }}
          onDelete={(eventId) => {
            onDeleteEvent(eventId);
            setShowEventDetailModal(false);
            setViewingEvent(null);
          }}
        />
      )}
    </>
  );
};

export default function CalendarPage() {
  const [activePlans, setActivePlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekStartDay, setWeekStartDay] = useState(getWeekStartDay());

  // Calculate date range for month view
  const getViewDateRange = (date) => {
    const firstDay = startOfWeek(startOfMonth(date), { weekStartsOn: weekStartDay });
    const lastDay = endOfWeek(endOfMonth(date), { weekStartsOn: weekStartDay });
    return { startDate: format(firstDay, 'yyyy-MM-dd'), endDate: format(lastDay, 'yyyy-MM-dd') };
  };

  useEffect(() => {
    loadData();
  }, [currentDate]);

  // Listen for storage changes to update weekStartDay when user changes settings
  useEffect(() => {
    const handleStorageChange = () => {
      setWeekStartDay(getWeekStartDay());
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getViewDateRange(currentDate);

      const [plans, calendarEvents] = await Promise.all([
        Plan.active().catch(() => []),
        CalendarEvent.list(startDate, endDate).catch(() => [])
      ]);

      setActivePlans(Array.isArray(plans) ? plans : []);
      setEvents(Array.isArray(calendarEvents) ? calendarEvents : []);
    } catch (error) {
      console.error("Error loading calendar data:", error);
      setEvents([]);
      setActivePlans([]);
    }
    setIsLoading(false);
  };

  const handleAddEvent = async (workoutData) => {
    try {
      // Convert workout data to calendar event format
      const eventData = {
        date: workoutData.date,
        title: workoutData.title,
        type: 'workout',
        status: 'scheduled',
        workoutDetails: {
          type: workoutData.type || 'strength',
          estimatedDuration: workoutData.durationMinutes || 60,
          exercises: workoutData.exercises || []
        },
        notes: workoutData.notes
      };

      // If workoutTemplateId is provided, add it
      if (workoutData.workoutTemplateId) {
        eventData.workoutTemplateId = workoutData.workoutTemplateId;
      }

      await CalendarEvent.create(eventData);
      loadData();
    } catch (error) {
      console.error("Error adding calendar event:", error);
      alert(`Failed to add workout: ${error.message}`);
    }
  };

  const handleEditEvent = async (eventId, eventData) => {
    try {
      const updateData = {
        title: eventData.title,
        date: eventData.date,
        workoutDetails: {
          type: eventData.type || 'strength',
          estimatedDuration: eventData.durationMinutes || 60,
          exercises: eventData.exercises || []
        },
        notes: eventData.notes
      };
      await CalendarEvent.update(eventId, updateData);
      loadData();
    } catch (error) {
      console.error("Error updating calendar event:", error);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm("Are you sure you want to delete this workout?")) return;

    try {
      await CalendarEvent.delete(eventId);
      loadData();
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      alert("Failed to delete workout. Please try again.");
    }
  };

  const handleMoveEvent = async (eventId, newDate) => {
    try {
      await CalendarEvent.move(eventId, newDate);
      loadData();
    } catch (error) {
      console.error("Error moving calendar event:", error);
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse bg-white rounded-xl p-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
          <div className="grid grid-cols-7 gap-2">
            {Array(35).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Calendar View */}
      <CalendarView
        events={events}
        activePlans={activePlans}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onAddEvent={handleAddEvent}
        onEditEvent={handleEditEvent}
        onDeleteEvent={handleDeleteEvent}
        onMoveEvent={handleMoveEvent}
        weekStartDay={weekStartDay}
      />
    </div>
  );
}
