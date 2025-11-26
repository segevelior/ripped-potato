
import React, { useState, useEffect } from "react";
import { Workout, UserGoalProgress, Plan } from "@/api/entities";
import { Calendar, Target, ChevronRight, Activity, Trophy, Clock, Play, Users, MoreVertical, Trash2, FileText, Plus } from "lucide-react";
import { format, startOfWeek, addDays, isToday, parseISO, isValid, isAfter } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BodyRegionChart from "../components/dashboard/BodyRegionChart";
import WeeklyOptimization from "../components/dashboard/WeeklyOptimization"; // New import
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ActiveGoalCard = ({ goal, progress, onGoalClick, onResignGoal }) => {
  const getDaysSinceStart = () => {
    if (!progress?.started_date) return 0;
    return Math.floor((new Date() - new Date(progress.started_date)) / (1000 * 60 * 60 * 24));
  };

  const getProgressPercentage = () => {
    // Assuming 10 levels max for progress visualization
    return Math.min((progress.current_level / 10) * 100, 100);
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1" onClick={() => onGoalClick(goal)}>
          <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
            {goal.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {goal.icon && <span className="text-lg">{goal.icon}</span>}
            <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 font-medium">
              {goal.category}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded-full hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100">
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onGoalClick(goal)}>
              <Target className="w-4 h-4 mr-2" />
              View Progress
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onResignGoal(progress)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Resign Goal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div onClick={() => onGoalClick(goal)}>
        {/* Progress Info */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Current Level:</span>
            <span className="font-bold text-blue-600">Level {progress.current_level}</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Training for:</span>
            <span className="font-medium text-gray-700">{getDaysSinceStart()} days</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
        </div>

        {/* Next Step Hint */}
        <div className="text-xs text-gray-500">
          Next: Level {progress.current_level + 1} milestone
        </div>
      </div>
    </div>
  );
};

const ActivePlanCard = ({ plan, onPlanClick }) => {
  const getProgress = () => {
    if (!plan.progress_metrics) return { completed: 0, total: 0, percentage: 0 };
    return {
      completed: plan.progress_metrics.completed_workouts || 0,
      total: plan.progress_metrics.total_workouts || 0,
      percentage: plan.progress_metrics.completion_percentage || 0
    };
  };

  const getNextWorkout = () => {
    if (!plan.linked_workouts) return null;
    const upcoming = plan.linked_workouts
      .filter(w => !w.is_completed && w.scheduled_date)
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    return upcoming[0];
  };

  const progress = getProgress();
  const nextWorkout = getNextWorkout();

  return (
    <div
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onPlanClick(plan)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-gray-900 mb-1">{plan.name}</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">
              {plan.status}
            </span>
            <span className="text-sm text-gray-600">
              {progress.completed}/{progress.total} workouts
            </span>
          </div>
        </div>
        <FileText className="w-5 h-5 text-purple-600" />
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Next Workout */}
      {nextWorkout && (
        <div className="text-sm text-gray-600">
          Next: {format(parseISO(nextWorkout.scheduled_date), 'MMM d')}
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const [workouts, setWorkouts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('overview'); // 'overview' or 'plan'
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workoutData, goalsData, plansData] = await Promise.all([
        Workout.list("-date", 50),
        UserGoalProgress.filter({ is_active: true }),
        Plan.filter({ status: 'active' }),
      ]);
      setWorkouts(workoutData);
      setGoals(goalsData);
      setPlans(plansData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const upcomingWorkouts = workouts
    .filter(w => isValid(parseISO(w.date)) && isAfter(parseISO(w.date), addDays(new Date(), -1)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  const completedWorkoutsThisWeek = workouts.filter(w => {
    const date = parseISO(w.date);
    return isValid(date) && date >= startOfWeek(new Date(), { weekStartsOn: 1 });
  }).length;

  const completedGoals = goals.filter(g => g.completed_date).length;
  const activeGoals = goals.filter(g => g.is_active && !g.completed_date);
  const activePlans = plans.filter(p => p.status === 'active');

  const handleGoalClick = (goal) => {
    // Navigate using react-router-dom for a smoother experience
    navigate(createPageUrl(`Goals?goal=${goal.id}`));
  };

  const handlePlanClick = (plan) => {
    navigate(createPageUrl("Plans"));
  };

  const handleResignGoal = async (progress) => {
    if (!confirm(`Are you sure you want to resign from "${progress.goal_name}"? Your progress will be deleted.`)) return;

    try {
      await UserGoalProgress.delete(progress.id);
      await loadData();
      alert("You have resigned from the goal.");
    } catch (error) {
      console.error("Error resigning from goal:", error);
      alert("Failed to resign from goal.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-64"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-200 h-24 rounded-xl"></div>
          ))}
        </div>
        <div className="animate-pulse h-64 bg-gray-200 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with View Toggle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          </div>
          <p className="text-base md:text-lg text-gray-600">Your training progress and active plans.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('overview')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('plan')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'plan' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              Plan View
            </button>
          </div>

          <Link to={createPageUrl("TrainNow")}>
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg">
              <Play className="w-5 h-5" />
              Train Now
            </button>
          </Link>
        </div>
      </div>

      {view === 'overview' ? (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg"><Activity className="w-6 h-6 text-blue-600" /></div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{completedWorkoutsThisWeek}</p>
                  <p className="text-sm text-gray-600">Workouts this week</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg"><Target className="w-6 h-6 text-purple-600" /></div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{activeGoals.length}</p>
                  <p className="text-sm text-gray-600">Active Goals</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg"><FileText className="w-6 h-6 text-green-600" /></div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{activePlans.length}</p>
                  <p className="text-sm text-gray-600">Active Plans</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-100 rounded-lg"><Trophy className="w-6 h-6 text-yellow-600" /></div>
                <div>
                  <p className="text-3xl font-bold text-gray-900">{completedGoals}</p>
                  <p className="text-sm text-gray-600">Goals Completed</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column: Upcoming & Goals */}
            <div className="lg:col-span-2 space-y-6">
              {/* Upcoming Workouts */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  Upcoming Workouts
                </h2>
                {upcomingWorkouts.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingWorkouts.map(workout => (
                      <Link to={createPageUrl(`LiveWorkout?id=${workout.id}`)} key={workout.id} className="block p-4 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-lg">{workout.title}</p>
                            <p className="text-sm text-gray-500">{format(parseISO(workout.date), "EEEE, MMMM d")}</p>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span><Clock className="w-4 h-4 inline mr-1" />{workout.duration_minutes} min</span>
                            <span><Target className="w-4 h-4 inline mr-1" />{workout.exercises?.length || 0} exercises</span>
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No upcoming workouts scheduled.</p>
                    <Link to={createPageUrl("TrainNow")}>
                      <button className="mt-3 text-blue-600 font-semibold">Plan a workout</button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Body Region Chart */}
              <BodyRegionChart workouts={workouts} activities={[]} />

              {/* Weekly Optimization - NEW */}
              <WeeklyOptimization />
            </div>

            {/* Right Column: Active Goals & Plans */}
            <div className="space-y-6">
              {/* Active Plans */}
              {activePlans.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-500" />
                      Active Plans
                    </h2>
                    <Link to={createPageUrl("Plans")}>
                      <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                        View All
                      </button>
                    </Link>
                  </div>
                  <div className="space-y-4">
                    {activePlans.slice(0, 2).map(plan => (
                      <ActivePlanCard
                        key={plan.id}
                        plan={plan}
                        onPlanClick={handlePlanClick}
                      />
                    ))}
                    {activePlans.length > 2 && (
                      <div className="text-center pt-2">
                        <Link to={createPageUrl("Plans")}>
                          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                            +{activePlans.length - 2} more plans
                          </button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Active Goals */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Target className="w-5 h-5 text-gray-500" />
                    Active Goals
                  </h2>
                  <Link to={createPageUrl("Goals")}>
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      View All
                    </button>
                  </Link>
                </div>
                {activeGoals.length > 0 ? (
                  <div className="space-y-4">
                    {activeGoals.slice(0, 3).map(progress => (
                      <ActiveGoalCard
                        key={progress.id}
                        goal={{ id: progress.goal_id, name: progress.goal_name, category: 'skill' }}
                        progress={progress}
                        onGoalClick={handleGoalClick}
                        onResignGoal={handleResignGoal}
                      />
                    ))}
                    {activeGoals.length > 3 && (
                      <div className="text-center pt-2">
                        <Link to={createPageUrl("Goals")}>
                          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                            +{activeGoals.length - 3} more goals
                          </button>
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No active goals yet.</p>
                    <Link to={createPageUrl("Goals")}>
                      <button className="mt-3 text-blue-600 font-semibold">Explore Goals</button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Plan View */
        <div className="space-y-6">
          {/* Active Plans Overview */}
          {activePlans.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <FileText className="w-6 h-6 text-purple-600" />
                Your Active Plans
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activePlans.map(plan => (
                  <ActivePlanCard
                    key={plan.id}
                    plan={plan}
                    onPlanClick={handlePlanClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Current Training Focus */}
          {activeGoals.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Target className="w-6 h-6 text-purple-600" />
                Training Goals
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeGoals.map(progress => (
                  <ActiveGoalCard
                    key={progress.id}
                    goal={{ id: progress.goal_id, name: progress.goal_name, category: 'skill' }}
                    progress={progress}
                    onGoalClick={handleGoalClick}
                    onResignGoal={handleResignGoal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Weekly Plan Overview */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              This Week's Schedule
            </h2>

            {upcomingWorkouts.length > 0 ? (
              <div className="grid gap-4">
                {upcomingWorkouts.map(workout => (
                  <div key={workout.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h3 className="font-semibold text-gray-900">{workout.title}</h3>
                      <p className="text-sm text-gray-600">{format(parseISO(workout.date), "EEEE, MMM d")}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {workout.duration_minutes}min
                      </div>
                      <Link to={createPageUrl(`LiveWorkout?id=${workout.id}`)}>
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
                          <Play className="w-4 h-4" />
                          Start
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No workouts planned</h3>
                <p className="mb-6">Let's get your training plan started!</p>
                <Link to={createPageUrl("TrainNow")}>
                  <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium">
                    Plan Your Week
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <Link to={createPageUrl("CreatePlan")}>
                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg font-medium flex items-center gap-2 transition-colors">
                  <Plus className="w-5 h-5" />
                  Create Plan
                </button>
              </Link>
              <Link to={createPageUrl("Goals")}>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg font-medium flex items-center gap-2 transition-colors">
                  <Target className="w-5 h-5" />
                  Browse Goals
                </button>
              </Link>
              <Link to={createPageUrl("Calendar")}>
                <button className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 p-4 rounded-lg font-medium flex items-center gap-2 transition-colors">
                  <Calendar className="w-5 h-5" />
                  View Calendar
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
