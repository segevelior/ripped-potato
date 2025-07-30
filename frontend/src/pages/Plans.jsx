
import React, { useState, useEffect } from "react";
import { Plan, Goal, Workout, PredefinedWorkout, UserGoalProgress } from "@/api/entities";
import { Calendar, Target, Plus, Play, Pause, CheckCircle2, Clock, ArrowRight, MoreVertical, Edit3, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, parseISO, differenceInDays, isAfter, isBefore } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PlanCard = ({ plan, onEdit, onDelete, onToggleStatus, goals, workouts }) => {
  const getStatusInfo = () => {
    switch (plan.status) {
      case 'active':
        return { color: 'bg-green-100 text-green-800', icon: Play, label: 'Active' };
      case 'paused':
        return { color: 'bg-yellow-100 text-yellow-800', icon: Pause, label: 'Paused' };
      case 'completed':
        return { color: 'bg-blue-100 text-blue-800', icon: CheckCircle2, label: 'Completed' };
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: Clock, label: 'Draft' };
    }
  };

  const getNextWorkout = () => {
    if (!plan.linked_workouts) return null;
    const upcoming = plan.linked_workouts
      .filter(w => !w.is_completed && w.scheduled_date)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    return upcoming[0];
  };

  const getProgress = () => {
    if (!plan.progress_metrics) return { completed: 0, total: 0, percentage: 0 };
    return {
      completed: plan.progress_metrics.completed_workouts || 0,
      total: plan.progress_metrics.total_workouts || 0,
      percentage: plan.progress_metrics.completion_percentage || 0
    };
  };

  const getDaysInfo = () => {
    const start = parseISO(plan.start_date);
    const end = parseISO(plan.end_date);
    const now = new Date();
    
    if (isBefore(now, start)) {
      return { label: 'Starts in', value: `${differenceInDays(start, now)} days` };
    } else if (isAfter(now, end)) {
      return { label: 'Ended', value: `${differenceInDays(now, end)} days ago` };
    } else {
      return { label: 'Day', value: `${differenceInDays(now, start) + 1} of ${differenceInDays(end, start) + 1}` };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const nextWorkout = getNextWorkout();
  const progress = getProgress();
  const daysInfo = getDaysInfo();
  const linkedGoals = goals.filter(g => (plan.linked_goals || []).includes(g.id));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-200 group">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                <StatusIcon className="w-3 h-3 inline mr-1" />
                {statusInfo.label}
              </span>
              <span>{daysInfo.label}: {daysInfo.value}</span>
              <span>{progress.completed}/{progress.total} workouts</span>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onEdit(plan)}>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus(plan)}>
                {plan.status === 'active' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {plan.status === 'active' ? 'Pause Plan' : 'Activate Plan'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(plan)} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {plan.description && (
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">{plan.description}</p>
        )}

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>

        {/* Linked Goals */}
        {linkedGoals.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2">Working toward:</div>
            <div className="flex flex-wrap gap-1">
              {linkedGoals.map(goal => (
                <span key={goal.id} className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                  {goal.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Next Workout */}
        {nextWorkout && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-blue-600 font-medium mb-1">Next Workout</div>
            <div className="text-sm text-blue-800">
              {format(parseISO(nextWorkout.scheduled_date), 'EEEE, MMM d')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('all'); // 'all', 'active', 'draft', 'completed'

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [planData, goalData, workoutData] = await Promise.all([
        Plan.list("-created_date"),
        Goal.list(),
        Workout.list("-date", 50)
      ]);
      setPlans(planData);
      setGoals(goalData);
      setWorkouts(workoutData);
    } catch (error) {
      console.error("Error loading plans data:", error);
    }
    setIsLoading(false);
  };

  const handleToggleStatus = async (plan) => {
    try {
      const newStatus = plan.status === 'active' ? 'paused' : 'active';
      await Plan.update(plan.id, { status: newStatus });
      loadData();
    } catch (error) {
      console.error("Error updating plan status:", error);
      alert("Failed to update plan status");
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!confirm(`Are you sure you want to delete "${plan.name}"? This action cannot be undone.`)) return;
    
    try {
      // First, delete any linked workouts that were created by this plan
      if (plan.linked_workouts && plan.linked_workouts.length > 0) {
        for (const linkedWorkout of plan.linked_workouts) {
          // Only delete workouts that were specifically created for this plan
          if (linkedWorkout.workout_type === 'scheduled') {
            try {
              await Workout.delete(linkedWorkout.workout_id);
            } catch (error) {
              console.warn(`Could not delete linked workout ${linkedWorkout.workout_id}:`, error);
              // Continue with other deletions even if one linked workout fails
            }
          }
        }
      }
      
      // Then delete the plan itself
      await Plan.delete(plan.id);
      
      // Refresh the data
      await loadData();
      
      alert("Plan deleted successfully!");
    } catch (error) {
      console.error("Error deleting plan:", error);
      alert("Failed to delete plan. Please try again.");
    }
  };

  const filteredPlans = plans.filter(plan => {
    if (view === 'all') return true;
    return plan.status === view;
  });

  const getStatsForView = () => {
    return {
      all: plans.length,
      active: plans.filter(p => p.status === 'active').length,
      draft: plans.filter(p => p.status === 'draft').length,
      completed: plans.filter(p => p.status === 'completed').length
    };
  };

  const stats = getStatsForView();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-64"></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-200 h-64 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plans</h1>
          <p className="text-lg text-gray-600">
            Structured training plans that combine workouts with goal progression.
          </p>
        </div>
        <Link to={createPageUrl("CreatePlan")}>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Plus className="w-5 h-5" />
            Create Plan
          </button>
        </Link>
      </div>

      {/* View Toggle & Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Plans ({stats.all})
            </button>
            <button
              onClick={() => setView('active')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => setView('draft')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'draft' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Draft ({stats.draft})
            </button>
            <button
              onClick={() => setView('completed')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed ({stats.completed})
            </button>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      {filteredPlans.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              goals={goals}
              workouts={workouts}
              onEdit={(plan) => window.location.href = createPageUrl(`CreatePlan?edit=${plan.id}`)}
              onDelete={handleDeletePlan}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
            <Target className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-900">
            {view === 'all' ? 'No Plans Yet' : `No ${view.charAt(0).toUpperCase() + view.slice(1)} Plans`}
          </h3>
          <p className="text-gray-600 mb-6">
            {view === 'all' 
              ? 'Create your first structured training plan to combine workouts with goal progression.'
              : `You don't have any ${view} plans at the moment.`
            }
          </p>
          <Link to={createPageUrl("CreatePlan")}>
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium">
              Create Your First Plan
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
