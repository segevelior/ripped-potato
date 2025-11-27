import { useState, useEffect } from "react";
import { CalendarEvent, Plan } from "@/api/entities";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isValid, isToday, addWeeks, subWeeks, addDays, isSameDay } from "date-fns";

import WorkoutSelectionModal from "../components/calendar/WorkoutSelectionModal";

// Helper to get user's week start preference from localStorage
const getWeekStartDay = () => {
  try {
    const authUser = JSON.parse(localStorage.getItem('authUser') || '{}');
    return authUser.settings?.weekStartDay ?? 0; // Default to Sunday (0)
  } catch {
    return 0;
  }
};

// Color palette for workout types - circular after 10 colors
const WORKOUT_COLORS = [
  { bg: 'bg-blue-100', dot: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
  { bg: 'bg-green-100', dot: 'bg-green-500', text: 'text-green-700', border: 'border-green-200' },
  { bg: 'bg-purple-100', dot: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-orange-100', dot: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200' },
  { bg: 'bg-pink-100', dot: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-200' },
  { bg: 'bg-cyan-100', dot: 'bg-cyan-500', text: 'text-cyan-700', border: 'border-cyan-200' },
  { bg: 'bg-yellow-100', dot: 'bg-yellow-500', text: 'text-yellow-700', border: 'border-yellow-200' },
  { bg: 'bg-red-100', dot: 'bg-red-500', text: 'text-red-700', border: 'border-red-200' },
  { bg: 'bg-indigo-100', dot: 'bg-indigo-500', text: 'text-indigo-700', border: 'border-indigo-200' },
  { bg: 'bg-teal-100', dot: 'bg-teal-500', text: 'text-teal-700', border: 'border-teal-200' },
];

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

// Selected Day Panel Component - shows below the calendar
const SelectedDayPanel = ({ date, events, onAddClick, onEditEvent, onDeleteEvent, getEventColor }) => {
  const isCurrentDay = isToday(date);

  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${isCurrentDay ? 'ring-2 ring-[#FE5334]/20' : ''}`}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className={`text-lg font-bold ${isCurrentDay ? 'text-[#FE5334]' : 'text-gray-900'}`}>
            {format(date, 'EEEE, MMMM d')}
            {isCurrentDay && <span className="ml-2 text-sm font-medium bg-[#FEE1DC] px-2 py-0.5 rounded-full">Today</span>}
          </h3>
          <p className="text-sm text-gray-500">{events.length} workout{events.length !== 1 ? 's' : ''} scheduled</p>
        </div>
        <button
          onClick={() => onAddClick(date)}
          className="flex items-center gap-2 px-4 py-2 bg-[#FE5334] text-white rounded-lg hover:bg-[#E84A2D] transition-colors text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add Workout
        </button>
      </div>

      {events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event, idx) => {
            const colors = getEventColor(event);
            return (
              <div key={event.id || idx} className="group relative">
                <div
                  className={`p-4 rounded-xl cursor-pointer hover:shadow-md transition-all ${colors.bg} border ${colors.border}`}
                  onClick={() => onEditEvent(event)}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-3 h-3 rounded-full ${colors.dot}`}></div>
                    <p className={`font-bold text-base ${colors.text}`}>
                      {event.title}
                    </p>
                    {event.status && event.status !== 'scheduled' && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        event.status === 'completed' ? 'bg-green-100 text-green-700' :
                        event.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        event.status === 'skipped' ? 'bg-gray-100 text-gray-600' : ''
                      }`}>
                        {event.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 ml-6">
                    {event.workoutDetails?.exercises?.length || 0} exercises • {event.workoutDetails?.estimatedDuration || 60}min
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(event.id);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No workouts scheduled for this day</p>
          <p className="text-xs text-gray-400 mt-1">Click "Add Workout" to schedule one</p>
        </div>
      )}
    </div>
  );
};

// Figma-style Calendar View Component
const CalendarView = ({ events, activePlans, view, currentDate, onDateChange, onAddEvent, onEditEvent, onDeleteEvent, onMoveEvent, weekStartDay }) => {
  const [selectedDate, setSelectedDate] = useState(new Date()); // Default to today
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);

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
    setEditingEvent(null);
    setShowWorkoutModal(true);
  };

  const handleEditEvent = (event) => {
    if (!event || !event.date) return;
    const eventDate = typeof event.date === 'string' ? parseISO(event.date) : new Date(event.date);
    if (isValid(eventDate)) {
      setEditingEvent(event);
      setSelectedDate(eventDate);
      setShowWorkoutModal(true);
    }
  };

  const handleApplyWorkout = (workoutData) => {
    if (editingEvent) {
      onEditEvent(editingEvent.id, {
        ...workoutData,
        date: format(selectedDate, 'yyyy-MM-dd')
      });
    } else {
      onAddEvent({
        ...workoutData,
        date: format(selectedDate, 'yyyy-MM-dd')
      });
    }
    setShowWorkoutModal(false);
    setEditingEvent(null);
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
    return { events: dayEvents };
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
    if (view === 'month') {
      onDateChange(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else if (view === 'week') {
      onDateChange(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else if (view === 'day') {
      onDateChange(direction > 0 ? addDays(currentDate, 1) : addDays(currentDate, -1));
    }
  };

  const getDateRange = () => {
    if (view === 'month') {
      const firstDay = startOfWeek(startOfMonth(currentDate), { weekStartsOn: weekStartDay });
      const lastDay = endOfWeek(endOfMonth(currentDate), { weekStartsOn: weekStartDay });
      return eachDayOfInterval({ start: firstDay, end: lastDay });
    } else if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else {
      return [currentDate];
    }
  };

  const dates = getDateRange();
  const selectedDayEvents = getDayData(selectedDate).events;

  // Day View - full day display
  if (view === 'day') {
    const { events: dayEvents } = getDayData(currentDate);
    const isCurrentDay = isToday(currentDate);

    return (
      <>
        <div className="bg-white rounded-xl shadow-sm p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Calendar</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-900">
                {format(currentDate, "MMMM d, yyyy")}
              </span>
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
              <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Day Content */}
          <div
            className={`p-6 rounded-xl min-h-[400px] ${isCurrentDay ? 'bg-[#FEE1DC]' : 'bg-gray-50'}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, currentDate)}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-xl font-bold ${isCurrentDay ? 'text-[#FE5334]' : 'text-gray-900'}`}>
                {format(currentDate, 'EEEE')}
                {isCurrentDay && <span className="ml-2 text-sm font-medium">(Today)</span>}
              </h3>
              <button
                onClick={() => handleAddClick(currentDate)}
                className="flex items-center gap-2 px-4 py-2 bg-[#FE5334] text-white rounded-lg hover:bg-[#E84A2D] transition-colors text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add Workout
              </button>
            </div>

            <div className="space-y-3">
              {dayEvents.length > 0 ? dayEvents.map((event, idx) => {
                const colors = getEventColor(event);
                return (
                  <div key={event.id || idx} className="group relative">
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, event)}
                      className={`p-4 rounded-xl cursor-move hover:shadow-md transition-all ${colors.bg} border ${colors.border}`}
                      onClick={() => handleEditEvent(event)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${colors.dot}`}></div>
                        <p className={`font-bold text-base ${colors.text}`}>
                          {event.title}
                        </p>
                        {event.status && event.status !== 'scheduled' && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            event.status === 'completed' ? 'bg-green-100 text-green-700' :
                            event.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            event.status === 'skipped' ? 'bg-gray-100 text-gray-600' : ''
                          }`}>
                            {event.status.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 ml-6">
                        {event.workoutDetails?.exercises?.length || 0} exercises • {event.workoutDetails?.estimatedDuration || 60}min
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEvent(event.id);
                      }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                );
              }) : (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No workouts scheduled</p>
                  <button
                    onClick={() => handleAddClick(currentDate)}
                    className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-[#FE5334] text-white rounded-lg hover:bg-[#E84A2D] transition-colors text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" />
                    Add Workout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showWorkoutModal && (
          <WorkoutSelectionModal
            date={selectedDate}
            onClose={() => {
              setShowWorkoutModal(false);
              setEditingEvent(null);
            }}
            editingWorkout={editingEvent}
            onApplyWorkout={handleApplyWorkout}
          />
        )}
      </>
    );
  }

  // Week View
  if (view === 'week') {
    return (
      <>
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Calendar</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">
                  {format(startOfWeek(currentDate, { weekStartsOn: weekStartDay }), 'MMM d')} - {format(endOfWeek(currentDate, { weekStartsOn: weekStartDay }), 'MMM d, yyyy')}
                </span>
                <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>
                <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Week Grid */}
            <div className="grid grid-cols-7 gap-2">
              {dates.map((day, index) => {
                const { events: dayEvents } = getDayData(day);
                const isCurrentDay = isToday(day);
                const isSelected = isSameDay(day, selectedDate);
                const isDragTarget = hoveredDate && hoveredDate.getTime() === day.getTime();

                return (
                  <div key={index} className="flex flex-col">
                    {/* Day Header */}
                    <div className="text-center mb-2">
                      <div className="text-xs font-medium text-gray-400 mb-1">
                        {weekDays[index]}
                      </div>
                      <div
                        onClick={() => handleDateClick(day)}
                        className={`w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-base font-semibold cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#FE5334] text-white'
                            : isCurrentDay
                              ? 'bg-[#FEE1DC] text-[#FE5334]'
                              : 'text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {format(day, 'd')}
                      </div>
                    </div>

                    {/* Day Content */}
                    <div
                      className={`flex-1 rounded-lg p-2 min-h-[140px] transition-colors relative group cursor-pointer ${
                        isSelected ? 'bg-[#FFF2F0] ring-2 ring-[#FE5334]' :
                        isCurrentDay ? 'bg-[#FFF8F7]' : 'bg-gray-50 hover:bg-gray-100'
                      } ${isDragTarget ? 'ring-2 ring-[#FE5334] bg-[#FFF2F0]' : ''}`}
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
                        className="absolute top-1 right-1 w-6 h-6 bg-[#FE5334] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#E84A2D]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-1.5">
                        {dayEvents.slice(0, 3).map((event, idx) => {
                          const colors = getEventColor(event);
                          return (
                            <div key={event.id || idx} className="group/event relative">
                              <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, event)}
                                className={`p-2 rounded-lg cursor-move text-xs ${colors.bg} border ${colors.border}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEvent(event);
                                }}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`}></div>
                                  <p className={`font-semibold truncate ${colors.text}`}>
                                    {event.title}
                                  </p>
                                </div>
                                <p className="text-gray-500 text-[10px] ml-3.5">
                                  {event.workoutDetails?.estimatedDuration || 60}min
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteEvent(event.id);
                                }}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center opacity-0 group-hover/event:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-500 text-center py-1">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Day Panel */}
          <SelectedDayPanel
            date={selectedDate}
            events={selectedDayEvents}
            onAddClick={handleAddClick}
            onEditEvent={handleEditEvent}
            onDeleteEvent={onDeleteEvent}
            getEventColor={getEventColor}
          />
        </div>

        {showWorkoutModal && (
          <WorkoutSelectionModal
            date={selectedDate}
            onClose={() => {
              setShowWorkoutModal(false);
              setEditingEvent(null);
            }}
            editingWorkout={editingEvent}
            onApplyWorkout={handleApplyWorkout}
          />
        )}
      </>
    );
  }

  // Month View (Compact)
  return (
    <>
      <div className="space-y-2">
        <div className="bg-white rounded-xl shadow-sm p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-900">
              {format(currentDate, "MMMM yyyy")}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
              <button onClick={() => navigate(1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

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
              const { events: dayEvents } = getDayData(day);
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

                  {/* Event Indicators - Horizontal bars */}
                  {hasEvents && (
                    <div className="space-y-0.5 px-0.5">
                      {dayEvents.slice(0, 3).map((event, idx) => {
                        const colors = getEventColor(event);
                        return (
                          <div
                            key={event.id || idx}
                            draggable
                            onDragStart={(e) => handleDragStart(e, event)}
                            className={`h-1 w-full rounded-full cursor-move ${colors.dot}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEvent(event);
                            }}
                            title={event.title}
                          />
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
          <div className="bg-white rounded-xl shadow-sm p-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">
                {format(selectedDate, 'MMM d')} {isToday(selectedDate) && <span className="text-[#FE5334] text-xs ml-1">(Today)</span>}
              </span>
              <button
                onClick={() => handleAddClick(selectedDate)}
                className="w-6 h-6 bg-[#FE5334] text-white rounded-full flex items-center justify-center hover:bg-[#E84A2D] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {selectedDayEvents.map((event, idx) => {
                const colors = getEventColor(event);
                return (
                  <div
                    key={event.id || idx}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${colors.bg}`}
                    onClick={() => handleEditEvent(event)}
                  >
                    <div className={`w-1.5 h-6 rounded-full ${colors.dot}`}></div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${colors.text}`}>{event.title}</p>
                      <p className="text-[10px] text-gray-500">{event.workoutDetails?.estimatedDuration || 60}min</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEvent(event.id);
                      }}
                      className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
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
          onClose={() => {
            setShowWorkoutModal(false);
            setEditingEvent(null);
          }}
          editingWorkout={editingEvent}
          onApplyWorkout={handleApplyWorkout}
        />
      )}
    </>
  );
};

export default function CalendarPage() {
  const [activePlans, setActivePlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('month'); // 'day', 'week', 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekStartDay, setWeekStartDay] = useState(getWeekStartDay());

  // Calculate date range for current view
  const getViewDateRange = (date, viewType) => {
    if (viewType === 'month') {
      const firstDay = startOfWeek(startOfMonth(date), { weekStartsOn: weekStartDay });
      const lastDay = endOfWeek(endOfMonth(date), { weekStartsOn: weekStartDay });
      return { startDate: format(firstDay, 'yyyy-MM-dd'), endDate: format(lastDay, 'yyyy-MM-dd') };
    } else if (viewType === 'week') {
      const weekStart = startOfWeek(date, { weekStartsOn: weekStartDay });
      const weekEnd = endOfWeek(date, { weekStartsOn: weekStartDay });
      return { startDate: format(weekStart, 'yyyy-MM-dd'), endDate: format(weekEnd, 'yyyy-MM-dd') };
    } else {
      // Day view - get a week around the day for context
      const start = addDays(date, -3);
      const end = addDays(date, 3);
      return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
    }
  };

  useEffect(() => {
    loadData();
  }, [currentDate, view]);

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
      const { startDate, endDate } = getViewDateRange(currentDate, view);

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
      {/* Compact Header Controls */}
      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl shadow-sm">
        {/* View Toggle - Compact */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-lg">
          {['Day', 'Week', 'Month'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v.toLowerCase())}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === v.toLowerCase()
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Today Button */}
        <button
          onClick={goToToday}
          className="px-4 py-1.5 bg-[#FE5334] text-white rounded-full font-semibold hover:bg-[#E84A2D] transition-colors text-xs"
        >
          Today
        </button>
      </div>

      {/* Calendar View */}
      <CalendarView
        events={events}
        activePlans={activePlans}
        view={view}
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
