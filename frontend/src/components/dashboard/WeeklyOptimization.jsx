import React, { useState, useEffect } from "react";
import { Workout, Plan, UserTrainingPattern } from "@/api/entities";
import { TrendingUp, AlertTriangle, CheckCircle2, Clock, Target } from "lucide-react";
import { startOfWeek, endOfWeek, format, parseISO, isAfter, isBefore } from "date-fns";

const OptimizationCard = ({ title, insight, recommendation, status, onApply }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'info': return <TrendingUp className="w-5 h-5 text-blue-600" />;
      default: return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'warning': return 'bg-yellow-50 border-yellow-200';
      case 'info': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-start gap-3">
        {getStatusIcon()}
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
          <p className="text-sm text-gray-700 mb-2">{insight}</p>
          <p className="text-sm font-medium text-gray-800 mb-3">{recommendation}</p>
          {onApply && (
            <button 
              onClick={onApply}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Optimization
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function WeeklyOptimization() {
  const [optimizations, setOptimizations] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    analyzeWeeklyPerformance();
  }, []);

  const analyzeWeeklyPerformance = async () => {
    setIsLoading(true);
    try {
      const currentWeekStart = startOfWeek(new Date());
      const currentWeekEnd = endOfWeek(new Date());
      
      // Get this week's data
      const [workouts, plans, patterns] = await Promise.all([
        Workout.list().catch(() => []),
        Plan.active().catch(() => []),
        UserTrainingPattern.list().catch(() => [])
      ]);

      const thisWeekWorkouts = workouts.filter(w => {
        const workoutDate = parseISO(w.date);
        return isAfter(workoutDate, currentWeekStart) && isBefore(workoutDate, currentWeekEnd);
      });

      const lastWeekWorkouts = workouts.filter(w => {
        const workoutDate = parseISO(w.date);
        const lastWeekStart = new Date(currentWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(currentWeekEnd);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
        return isAfter(workoutDate, lastWeekStart) && isBefore(workoutDate, lastWeekEnd);
      });

      // Calculate weekly stats
      const stats = {
        thisWeekCount: thisWeekWorkouts.length,
        lastWeekCount: lastWeekWorkouts.length,
        completionRate: plans.length > 0 ? (thisWeekWorkouts.length / (plans[0].linked_workouts?.length / 4)) * 100 : 0, // Rough weekly target
        averageDuration: thisWeekWorkouts.reduce((acc, w) => acc + (w.duration_minutes || 0), 0) / (thisWeekWorkouts.length || 1),
        muscleGroupBalance: analyzeMuscleGroupBalance(thisWeekWorkouts)
      };

      setWeeklyStats(stats);

      // Generate optimizations based on patterns
      const opts = [];
      
      // Completion rate optimization
      if (stats.completionRate < 70) {
        opts.push({
          title: "Low Completion Rate",
          insight: `You've completed ${stats.completionRate.toFixed(0)}% of your planned workouts this week.`,
          recommendation: "Consider shorter sessions or fewer weekly workouts to build consistency.",
          status: "warning",
          action: "reduce_volume"
        });
      }

      // Duration optimization
      if (stats.averageDuration > 75) {
        opts.push({
          title: "Long Workout Sessions",
          insight: `Your average workout is ${stats.averageDuration.toFixed(0)} minutes.`,
          recommendation: "Break longer sessions into focused blocks to improve adherence.",
          status: "info",
          action: "optimize_duration"
        });
      }

      // Progress comparison
      if (stats.thisWeekCount > stats.lastWeekCount) {
        opts.push({
          title: "Great Progress!",
          insight: `You trained ${stats.thisWeekCount - stats.lastWeekCount} more times than last week.`,
          recommendation: "Keep this momentum while ensuring adequate recovery.",
          status: "success",
          action: null
        });
      }

      // Muscle group balance
      const imbalances = findMuscleImbalances(stats.muscleGroupBalance);
      if (imbalances.length > 0) {
        opts.push({
          title: "Muscle Group Imbalance",
          insight: `Detected overemphasis on: ${imbalances.join(', ')}.`,
          recommendation: "Add complementary exercises to balance your training.",
          status: "warning",
          action: "balance_muscles"
        });
      }

      setOptimizations(opts);
      
    } catch (error) {
      console.error("Error analyzing weekly performance:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeMuscleGroupBalance = (workouts) => {
    const muscleGroups = {};
    workouts.forEach(workout => {
      if (workout.muscle_strain) {
        Object.entries(workout.muscle_strain).forEach(([muscle, strain]) => {
          muscleGroups[muscle] = (muscleGroups[muscle] || 0) + strain;
        });
      }
    });
    return muscleGroups;
  };

  const findMuscleImbalances = (muscleBalance) => {
    const values = Object.values(muscleBalance);
    if (values.length === 0) return [];
    
    const average = values.reduce((acc, val) => acc + val, 0) / values.length;
    const threshold = average * 1.5; // 50% above average
    
    return Object.entries(muscleBalance)
      .filter(([_, strain]) => strain > threshold)
      .map(([muscle]) => muscle);
  };

  const handleApplyOptimization = async (optimization) => {
    // Here you would implement the actual optimization logic
    // For now, just show a success message
    console.log("Applying optimization:", optimization.action);
    
    // Remove the applied optimization
    setOptimizations(prev => prev.filter(opt => opt !== optimization));
    
    // You could trigger plan updates, workout modifications, etc.
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48"></div>
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (optimizations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900">Weekly Optimization</h3>
        </div>
        <div className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p className="text-gray-600">Your training looks well-optimized this week!</p>
          <p className="text-sm text-gray-500 mt-1">Keep up the great work.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Weekly Optimization</h3>
        </div>
        {weeklyStats && (
          <div className="text-sm text-gray-600">
            {weeklyStats.thisWeekCount} workouts • {weeklyStats.completionRate.toFixed(0)}% target
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        {optimizations.map((opt, index) => (
          <OptimizationCard
            key={index}
            title={opt.title}
            insight={opt.insight}
            recommendation={opt.recommendation}
            status={opt.status}
            onApply={opt.action ? () => handleApplyOptimization(opt) : null}
          />
        ))}
      </div>
    </div>
  );
}