import React from "react";
import { X, Clock, Dumbbell, CheckCircle, Calendar, Play, SkipForward, Target } from "lucide-react";
import { format } from "date-fns";

const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    badge: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle,
    iconColor: "text-emerald-500"
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-amber-100 text-amber-700",
    icon: Play,
    iconColor: "text-amber-500"
  },
  scheduled: {
    label: "Scheduled",
    badge: "bg-gray-100 text-gray-600",
    icon: Calendar,
    iconColor: "text-gray-500"
  },
  skipped: {
    label: "Skipped",
    badge: "bg-gray-100 text-gray-400",
    icon: SkipForward,
    iconColor: "text-gray-400"
  }
};

const WORKOUT_TYPE_COLORS = {
  strength: { bg: "bg-indigo-50", text: "text-indigo-700", badge: "bg-indigo-500" },
  cardio: { bg: "bg-emerald-50", text: "text-emerald-700", badge: "bg-emerald-500" },
  hiit: { bg: "bg-amber-50", text: "text-amber-700", badge: "bg-amber-500" },
  flexibility: { bg: "bg-violet-50", text: "text-violet-700", badge: "bg-violet-500" },
  calisthenics: { bg: "bg-rose-50", text: "text-rose-700", badge: "bg-rose-500" },
  mobility: { bg: "bg-cyan-50", text: "text-cyan-700", badge: "bg-cyan-500" },
  recovery: { bg: "bg-slate-50", text: "text-slate-600", badge: "bg-slate-400" },
  hybrid: { bg: "bg-teal-50", text: "text-teal-700", badge: "bg-teal-500" }
};

export default function CalendarEventDetailModal({ event, onClose, onStartWorkout, onDelete }) {
  if (!event) return null;

  const status = event.status || "scheduled";
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.scheduled;
  const StatusIcon = statusConfig.icon;

  const workoutType = event.workoutDetails?.type || event.eventType || "strength";
  const typeColors = WORKOUT_TYPE_COLORS[workoutType] || WORKOUT_TYPE_COLORS.strength;

  const exercises = event.workoutDetails?.exercises || [];
  const duration = event.workoutDetails?.estimatedDuration || event.workoutDetails?.durationMinutes || 60;
  const notes = event.workoutDetails?.notes || event.notes || "";

  const eventDate = typeof event.date === 'string' ? new Date(event.date) : event.date;

  // Calculate completed exercises
  const completedExercises = exercises.filter(ex =>
    ex.sets?.every(set => set.isCompleted)
  ).length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:w-[480px] sm:max-w-lg max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              {/* Type Badge */}
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold text-white mb-2 ${typeColors.badge}`}>
                {workoutType.charAt(0).toUpperCase() + workoutType.slice(1)}
              </span>

              {/* Title */}
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {event.title}
              </h2>

              {/* Date */}
              <p className="text-sm text-gray-500 mt-0.5">
                {format(eventDate, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Status Card */}
          <div className={`rounded-2xl p-4 mb-5 ${typeColors.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusConfig.badge}`}>
                <StatusIcon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Status</p>
                <p className={`text-lg font-bold ${typeColors.text}`}>{statusConfig.label}</p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-lg font-bold text-gray-900">{duration}</p>
              <p className="text-xs text-gray-500">minutes</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Dumbbell className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-lg font-bold text-gray-900">{exercises.length}</p>
              <p className="text-xs text-gray-500">exercises</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-lg font-bold text-gray-900">
                {status === 'completed' ? completedExercises : '-'}
              </p>
              <p className="text-xs text-gray-500">completed</p>
            </div>
          </div>

          {/* Exercises List */}
          {exercises.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Exercises</h3>
              <div className="space-y-2">
                {exercises.map((exercise, idx) => {
                  const setsCompleted = exercise.sets?.filter(s => s.isCompleted).length || 0;
                  const totalSets = exercise.sets?.length || 0;
                  const isExerciseComplete = totalSets > 0 && setsCompleted === totalSets;

                  return (
                    <div
                      key={exercise.exerciseId || idx}
                      className={`p-3 rounded-xl border ${isExerciseComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExerciseComplete && (
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          )}
                          <span className={`font-medium text-sm ${isExerciseComplete ? 'text-emerald-700' : 'text-gray-900'}`}>
                            {exercise.exerciseName}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {setsCompleted}/{totalSets} sets
                        </span>
                      </div>

                      {/* Show set details if completed */}
                      {status === 'completed' && exercise.sets && exercise.sets.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {exercise.sets.map((set, setIdx) => (
                            <span
                              key={setIdx}
                              className={`text-xs px-2 py-0.5 rounded ${set.isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                            >
                              {set.weight > 0 ? `${set.weight}kg` : ''}
                              {set.actualReps || set.targetReps} reps
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 whitespace-pre-wrap">
                {notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <div className="flex gap-3">
            {status === 'scheduled' && onStartWorkout && (
              <button
                onClick={() => onStartWorkout(event)}
                className="flex-1 px-4 py-3 bg-[#FE5334] text-white rounded-xl hover:bg-[#E84A2D] transition-colors font-semibold text-sm"
              >
                Start Workout
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this workout?')) {
                    onDelete(event.id);
                    onClose();
                  }
                }}
                className={`px-4 py-3 bg-white border border-gray-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors font-medium text-sm ${status === 'scheduled' ? '' : 'flex-1'}`}
              >
                Delete
              </button>
            )}

            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
