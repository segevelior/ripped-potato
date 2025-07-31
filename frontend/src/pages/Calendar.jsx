
import React, { useState, useEffect } from "react";
import { TrainingPlan, Discipline, Workout, Plan } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, Target, ChevronLeft, ChevronRight, Plus, CalendarDays, CalendarRange, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isValid, isToday, addWeeks, subWeeks, startOfDay, endOfDay, addDays } from "date-fns";

import WorkoutSelectionModal from "../components/calendar/WorkoutSelectionModal";

// Enhanced Calendar with plan integration and drag support
const CalendarView = ({ workouts, activePlans, view, currentDate, onDateChange, onAddWorkout, onEditWorkout, onDeleteWorkout, onRescheduleWorkout }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [draggedWorkout, setDraggedWorkout] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setEditingWorkout(null);
    setShowWorkoutModal(true);
  };

  const handleEditWorkout = (workout) => {
    if (!workout || !workout.date) return;
    const workoutDate = parseISO(workout.date);
    if(isValid(workoutDate)) {
      setEditingWorkout(workout);
      setSelectedDate(workoutDate);
      setShowWorkoutModal(true);
    }
  };

  const handleApplyWorkout = (workoutData) => {
    if (editingWorkout) {
      onEditWorkout(editingWorkout.id, {
        ...workoutData,
        date: format(selectedDate, 'yyyy-MM-dd')
      });
    } else {
      onAddWorkout({
        ...workoutData,
        date: format(selectedDate, 'yyyy-MM-dd')
      });
    }
    setShowWorkoutModal(false);
    setEditingWorkout(null);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, workout) => {
    setDraggedWorkout(workout);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    if (draggedWorkout && targetDate) {
      const newDate = format(targetDate, 'yyyy-MM-dd');
      if (newDate !== draggedWorkout.date) {
        onRescheduleWorkout(draggedWorkout.id, newDate);

        // Save edit for AI feedback
        const editInfo = {
          type: 'reschedule',
          workoutTitle: draggedWorkout.title,
          oldDate: draggedWorkout.date,
          newDate: newDate
        };
        localStorage.setItem('manualEdit', JSON.stringify(editInfo));
      }
    }
    setDraggedWorkout(null);
    setHoveredDate(null);
  };

  const getDayData = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayWorkouts = workouts.filter(w => w.date === dateStr && w.exercises && w.exercises.length > 0);

    return { actual: dayWorkouts };
  };

  const getWorkoutPlanInfo = (workout) => {
    const plan = activePlans.find(plan => 
      plan.linked_workouts?.some(pw => pw.workout_id === workout.id)
    );
    return plan ? { id: plan.id, name: plan.name, color: getPlanColor(plan.id) } : null;
  };

  const getPlanColor = (planId) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500'];
    return colors[planId.charCodeAt(0) % colors.length];
  };

  const isProgressionWorkout = (workout, planInfo) => {
    if (!planInfo) return false;
    const plan = activePlans.find(p => p.id === planInfo.id);
    const linkedWorkout = plan?.linked_workouts?.find(pw => pw.workout_id === workout.id);
    return linkedWorkout?.workout_type === 'progression';
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
      const firstDay = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      const lastDay = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start: firstDay, end: lastDay });
    } else if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else {
      return [currentDate];
    }
  };

  const getViewTitle = () => {
    if (view === 'month') {
      return format(currentDate, "MMMM yyyy");
    } else if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else {
      return format(currentDate, "EEEE, MMMM d, yyyy");
    }
  };

  const dates = getDateRange();
  
  if (view === 'day') {
    const { actual } = getDayData(currentDate);
    const isCurrentDay = isToday(currentDate);
    
    return (
      <>
        <div className="apple-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>
              {getViewTitle()}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
              </button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronRight className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
              </button>
            </div>
          </div>

          <div 
            className={`p-6 rounded-xl border-2 min-h-[400px] ${
              isCurrentDay ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
            } ${hoveredDate && hoveredDate.getTime() === currentDate.getTime() ? 'border-purple-400 bg-purple-50' : ''}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, currentDate)}
            onDragEnter={() => setHoveredDate(currentDate)}
            onDragLeave={() => setHoveredDate(null)}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${isCurrentDay ? 'text-red-600' : 'text-gray-900'}`}>
                {format(currentDate, 'EEEE, MMMM d')}
                {isCurrentDay && <span className="ml-2 text-sm font-normal">(Today)</span>}
              </h3>
              <button
                onClick={() => handleDateClick(currentDate)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Workout
              </button>
            </div>

            <div className="space-y-3">
              {actual.length > 0 ? actual.map((workout, idx) => {
                const planInfo = getWorkoutPlanInfo(workout);
                const isProgression = isProgressionWorkout(workout, planInfo);
                
                return (
                  <div key={idx} className="group relative">
                    <div 
                      draggable
                      onDragStart={(e) => handleDragStart(e, workout)}
                      className="p-4 rounded-lg text-sm bg-white border cursor-move hover:shadow-md transition-all border-blue-200 group-hover:border-blue-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditWorkout(workout);
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-bold text-lg mb-1" style={{color: 'var(--text-primary)'}}>
                            {workout.title}
                            {isProgression && (
                              <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                📈 Progression
                              </span>
                            )}
                          </p>
                          {planInfo && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-3 h-3 rounded-full ${planInfo.color}`}></div>
                              <Link 
                                to={createPageUrl(`Plans`)} 
                                className="text-sm text-purple-600 hover:underline font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {planInfo.name}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-sm opacity-75 mb-2">
                        {workout.exercises?.length || 0} exercises • {workout.duration_minutes}min
                      </p>
                      {workout.exercises?.slice(0, 3).map((ex, exIdx) => (
                        <p key={exIdx} className="text-sm opacity-60">
                          {ex.exercise_name} - {ex.sets}x{ex.reps?.[0] || '?'}
                        </p>
                      ))}
                      {workout.exercises?.length > 3 && (
                        <p className="text-sm opacity-60 mt-1">
                          +{workout.exercises.length - 3} more exercises
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteWorkout(workout.id);
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
                  <p>No workouts scheduled for this day</p>
                  <button
                    onClick={() => handleDateClick(currentDate)}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
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
              setEditingWorkout(null);
            }}
            editingWorkout={editingWorkout}
            onApplyWorkout={handleApplyWorkout}
          />
        )}
      </>
    );
  }

  if (view === 'week') {
    const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    
    return (
      <>
        <div className="apple-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>
              {getViewTitle()}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
              </button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronRight className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {dates.map((day, index) => {
              const { actual } = getDayData(day);
              const isCurrentDay = isToday(day);
              const isDragTarget = hoveredDate && hoveredDate.getTime() === day.getTime();

              return (
                <div key={index} className="space-y-2">
                  <div className="text-center">
                    <div className="text-xs font-medium" style={{color: 'var(--text-secondary)'}}>
                      {weekDays[index]}
                    </div>
                    <div 
                      className={`text-lg font-bold p-2 rounded-full w-10 h-10 mx-auto flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors ${
                        isCurrentDay ? 'bg-red-500 text-white' : ''
                      }`}
                      style={isCurrentDay ? {} : {color: 'var(--text-primary)'}}
                      onClick={() => handleDateClick(day)}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>

                  <div 
                    className={`bg-gray-50 rounded-lg p-2 min-h-[120px] cursor-pointer hover:bg-gray-100 transition-colors ${
                      isCurrentDay ? 'ring-2 ring-red-300' : ''
                    } ${isDragTarget ? 'ring-2 ring-purple-400 bg-purple-50' : ''}`}
                    onClick={() => handleDateClick(day)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                    onDragEnter={() => setHoveredDate(day)}
                    onDragLeave={() => setHoveredDate(null)}
                  >
                    <div className="space-y-1">
                      {actual.slice(0, 2).map((workout, idx) => {
                        const planInfo = getWorkoutPlanInfo(workout);
                        const isProgression = isProgressionWorkout(workout, planInfo);
                        
                        return (
                          <div key={idx} className="group relative">
                            <div 
                              draggable
                              onDragStart={(e) => handleDragStart(e, workout)}
                              className="p-2 rounded bg-white border cursor-move hover:shadow-sm border-blue-200 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditWorkout(workout);
                              }}
                            >
                              <div className="flex items-center gap-1 mb-1">
                                {planInfo && <div className={`w-2 h-2 rounded-full ${planInfo.color}`}></div>}
                                <p className="font-bold truncate flex-1" style={{color: 'var(--text-primary)'}}>
                                  {workout.title}
                                </p>
                                {isProgression && <span className="text-green-600">📈</span>}
                              </div>
                              <p className="text-xs opacity-75">
                                {workout.exercises?.length || 0} exercises
                              </p>
                              {planInfo && (
                                <p className="text-xs text-purple-600 truncate mt-1">
                                  {planInfo.name}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteWorkout(workout.id);
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                      {actual.length > 2 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{actual.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showWorkoutModal && (
          <WorkoutSelectionModal
            date={selectedDate}
            onClose={() => {
              setShowWorkoutModal(false);
              setEditingWorkout(null);
            }}
            editingWorkout={editingWorkout}
            onApplyWorkout={handleApplyWorkout}
          />
        )}
      </>
    );
  }

  // Month view with plan integration
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <>
      <div className="apple-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{color: 'var(--text-primary)'}}>
            {getViewTitle()}
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
            </button>
            <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-5 h-5" style={{color: 'var(--text-secondary)'}}/>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-px" style={{backgroundColor: 'var(--separator)'}}>
          {weekDays.map(day => (
            <div key={day} className="py-2 text-center text-xs font-bold" style={{color: 'var(--text-secondary)', backgroundColor: 'var(--card-background)'}}>
              {day}
            </div>
          ))}
          {dates.map((day, i) => {
            const { actual } = getDayData(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isCurrentDay = isToday(day);
            const isDragTarget = hoveredDate && hoveredDate.getTime() === day.getTime();
            
            return (
              <div 
                key={i} 
                className={`p-2 min-h-[120px] cursor-pointer hover:bg-gray-50 transition-colors ${
                  isCurrentMonth ? (isCurrentDay ? 'bg-red-50 border-2 border-red-200' : 'bg-white') : 'bg-gray-50'
                } ${isDragTarget ? 'bg-purple-50 border-2 border-purple-300' : ''}`}
                onClick={() => handleDateClick(day)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, day)}
                onDragEnter={() => setHoveredDate(day)}
                onDragLeave={() => setHoveredDate(null)}
              >
                <span className={`text-sm font-medium ${
                  isCurrentMonth ? 
                    (isCurrentDay ? 'text-red-600 font-bold' : 'text-gray-900') : 
                    'text-gray-400'
                }`}>
                  {format(day, 'd')}
                  {isCurrentDay && <span className="text-xs ml-1">(Today)</span>}
                </span>
                
                <div className="mt-1 space-y-1">
                  {actual.slice(0, 3).map((workout, idx) => {
                    const planInfo = getWorkoutPlanInfo(workout);
                    const isProgression = isProgressionWorkout(workout, planInfo);
                    
                    return (
                      <div key={idx} className="group relative">
                        <div 
                          draggable
                          onDragStart={(e) => handleDragStart(e, workout)}
                          className="p-2 rounded-lg text-xs bg-white border cursor-move hover:shadow-sm border-blue-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditWorkout(workout);
                          }}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            {planInfo && <div className={`w-2 h-2 rounded-full ${planInfo.color}`}></div>}
                            <p className="font-bold truncate text-xs flex-1" style={{color: 'var(--text-primary)'}}>
                              {workout.title}
                              {isProgression && <span className="ml-1 text-green-600">📈</span>}
                            </p>
                          </div>
                          <p className="text-xs opacity-75 mb-1">
                            {workout.exercises?.length || 0} exercises • {workout.duration_minutes}min
                          </p>
                          {planInfo && (
                            <p className="text-xs text-purple-600 truncate">
                              {planInfo.name}
                            </p>
                          )}
                          {workout.exercises?.slice(0, 2).map((ex, exIdx) => (
                            <p key={exIdx} className="text-xs opacity-60 truncate">
                              {ex.exercise_name}
                            </p>
                          ))}
                          {workout.exercises?.length > 2 && (
                            <p className="text-xs opacity-60">
                              +{workout.exercises.length - 2} more exercises
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWorkout(workout.id);
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  {actual.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{actual.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showWorkoutModal && (
        <WorkoutSelectionModal
          date={selectedDate}
          onClose={() => {
            setShowWorkoutModal(false);
            setEditingWorkout(null);
          }}
          editingWorkout={editingWorkout}
          onApplyWorkout={handleApplyWorkout}
        />
      )}
    </>
  );
};

export default function CalendarPage() {
  const [currentPlan, setCurrentPlan] = useState(null);
  const [activePlans, setActivePlans] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('month'); // 'day', 'week', 'month'
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [plans, trainingPlans, disciplineData, workoutData] = await Promise.all([
        Plan.filter({ status: 'active' }),
        TrainingPlan.filter({ is_active: true }),
        Discipline.list(),
        Workout.list("-date", 100)
      ]);
      
      setActivePlans(plans || []);
      if (trainingPlans && trainingPlans.length > 0) setCurrentPlan(trainingPlans[0]);
      setDisciplines(disciplineData || []);
      
      // Filter out invalid/placeholder workouts and add plan info
      const validWorkouts = (workoutData || []).filter(workout => 
        workout.exercises && 
        workout.exercises.length > 0 && 
        workout.title && 
        workout.title.trim() !== "" &&
        workout.title !== "Strength Session" &&
        !workout.title.includes("Planned")
      ).map(workout => {
        // Check if this workout is linked to any active plan
        const linkedPlan = plans.find(plan => 
          plan.linked_workouts?.some(pw => 
            pw.workout_id === workout.id && pw.workout_type === 'scheduled'
          )
        );
        
        return {
          ...workout,
          linkedPlan: linkedPlan ? { id: linkedPlan.id, name: linkedPlan.name } : null
        };
      });
      
      setWorkouts(validWorkouts);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
    setIsLoading(false);
  };

  const handleAddWorkout = async (workoutData) => {
    try {
      const result = await Workout.create(workoutData);
      loadData();
    } catch (error) {
      console.error("Error adding workout:", error);
      alert(`Failed to add workout: ${error.message}`);
    }
  };

  const handleEditWorkout = async (workoutId, workoutData) => {
    try {
      await Workout.update(workoutId, workoutData);
      loadData();
    } catch (error) {
      console.error("Error updating workout:", error);
    }
  };

  const handleDeleteWorkout = async (workoutId) => {
    if (!confirm("Are you sure you want to delete this workout?")) return;
    
    try {
      await Workout.delete(workoutId);
      
      // Also remove from any linked plans
      for (const plan of activePlans) {
        if (plan.linked_workouts?.some(pw => pw.workout_id === workoutId)) {
          const updatedWorkouts = plan.linked_workouts.filter(pw => pw.workout_id !== workoutId);
          await Plan.update(plan.id, { 
            linked_workouts: updatedWorkouts,
            progress_metrics: {
              ...plan.progress_metrics,
              total_workouts: updatedWorkouts.length
            }
          });
        }
      }
      
      loadData(); // Refresh the calendar
    } catch (error) {
      console.error("Error deleting workout:", error);
      alert("Failed to delete workout. Please try again.");
    }
  };

  const handleRescheduleWorkout = async (workoutId, newDate) => {
    try {
      await Workout.update(workoutId, { date: newDate });
      
      // Also update the plan if this workout is linked to a plan
      const workout = workouts.find(w => w.id === workoutId);
      if (workout?.linkedPlan) {
        const plan = activePlans.find(p => p.id === workout.linkedPlan.id);
        if (plan) {
          const updatedWorkouts = plan.linked_workouts.map(pw => 
            pw.workout_id === workoutId 
              ? { ...pw, scheduled_date: newDate }
              : pw
          );
          await Plan.update(plan.id, { linked_workouts: updatedWorkouts });
        }
      }
      
      loadData();
    } catch (error) {
      console.error("Error rescheduling workout:", error);
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const openAICoach = (prompt) => {
    document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt } }));
  }
  
  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{color: 'var(--text-primary)'}}>Calendar</h1>
          <p className="text-lg" style={{color: 'var(--text-secondary)'}}>
            Your training schedule with full workout details.
          </p>
          {activePlans.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <FileText className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-purple-600 font-medium">
                {activePlans.length} active plan{activePlans.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* View Selector */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('day')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                view === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Day
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                view === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                view === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              Month
            </button>
          </div>

          {/* Today Button */}
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
          >
            Today
          </button>

          <Link to={createPageUrl("Plans")}>
            <button className="apple-button-secondary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Plans
            </button>
          </Link>

          <button onClick={() => openAICoach('I want to create a new plan.')} className="apple-button-secondary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Plan with AI
          </button>
        </div>
      </div>

      <CalendarView 
        workouts={workouts}
        activePlans={activePlans}
        view={view}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        onAddWorkout={handleAddWorkout}
        onEditWorkout={handleEditWorkout}
        onDeleteWorkout={handleDeleteWorkout}
        onRescheduleWorkout={handleRescheduleWorkout}
      />

      {workouts.length === 0 && !isLoading && (
        <div className="apple-card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Calendar className="w-8 h-8" style={{color: 'var(--text-secondary)'}} />
          </div>
          <h3 className="text-xl font-semibold mb-2" style={{color: 'var(--text-primary)'}}>No Workouts Scheduled</h3>
          <p className="mb-6" style={{color: 'var(--text-secondary)'}}>
            Click on any date to add a workout, or use the AI Coach to create a plan.
          </p>
          <button onClick={() => openAICoach('Help me create a workout plan.')} className="apple-button-primary">Go to AI Coach</button>
          
          {/* Test button */}
        </div>
      )}
    </div>
  );
}
