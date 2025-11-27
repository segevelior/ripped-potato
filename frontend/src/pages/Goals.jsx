
import React, { useState, useEffect } from "react";
import { Goal, ProgressionPath, UserGoalProgress, Exercise } from "@/api/entities";
import { Plus, Search, Target, Trophy, Zap, Calendar, Users, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import GoalCard from "../components/goals/GoalCard";
import GoalDetailView from "../components/goals/GoalDetailView";

const categoryColors = {
  skill: "bg-primary-50 text-primary-500",
  performance: "bg-blue-100 text-blue-800",
  endurance: "bg-green-100 text-green-800",
  strength: "bg-red-100 text-red-800"
};

const difficultyColors = {
  beginner: "bg-green-100 text-green-800",
  intermediate: "bg-yellow-100 text-yellow-800",
  advanced: "bg-orange-100 text-orange-800",
  elite: "bg-red-100 text-red-800"
};

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [progressionPaths, setProgressionPaths] = useState([]);
  const [userProgress, setUserProgress] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [showActiveGoals, setShowActiveGoals] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [goalsData, pathsData, progressData, exercisesData] = await Promise.all([
        Goal.list(),
        ProgressionPath.list(),
        UserGoalProgress.list(),
        Exercise.list()
      ]);
      
      setGoals(goalsData);
      setProgressionPaths(pathsData);
      setUserProgress(progressData);
      setExercises(exercisesData);
    } catch (error) {
      console.error("Error loading goals data:", error);
    }
    setIsLoading(false);
  };
  
  // This new effect handles opening a specific goal from a URL parameter
  useEffect(() => {
    if (goals.length > 0) { // Only attempt to process if goals data is loaded
        const params = new URLSearchParams(window.location.search);
        const goalId = params.get('goal');
        if (goalId) {
            const goalToSelect = goals.find(g => g.id === goalId);
            if (goalToSelect) {
                // Remove the URL parameter to prevent re-triggering on back navigation
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);
                setSelectedGoal(goalToSelect);
            }
        }
    }
  }, [goals]); // Depend on goals state so it runs after goals are fetched

  const handleStartGoal = async (goal) => {
    try {
      const existingProgress = userProgress.find(p => p.goal_id === goal.id);
      if (existingProgress) {
        alert("You are already tracking this goal!");
        setSelectedGoal(goal);
        return;
      }

      const newProgress = {
        goal_id: goal.id,
        goal_name: goal.name,
        current_level: 1,
        is_active: true,
        started_date: new Date().toISOString().split('T')[0],
        level_history: [{
          level: 1,
          achieved_date: new Date().toISOString().split('T')[0],
          notes: "Started working toward this goal"
        }]
      };

      await UserGoalProgress.create(newProgress);
      await loadData();
      
      alert(`Started tracking progress toward "${goal.name}"!`);
      setSelectedGoal(goal); // Keep the detail view open
    } catch (error) {
      console.error("Error starting goal:", error);
      alert("Error starting goal. Please try again.");
    }
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

  const handleViewGoal = (goal) => {
    // This is now the primary action: just show the detail view.
    setSelectedGoal(goal);
  };

  const filteredGoals = goals.filter(goal => {
    const matchesSearch = goal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         goal.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDiscipline = disciplineFilter === "all" ||
                             goal.discipline?.includes(disciplineFilter);
    const matchesCategory = categoryFilter === "all" || goal.category === categoryFilter;
    
    return matchesSearch && matchesDiscipline && matchesCategory;
  });

  const activeGoals = userProgress.filter(p => p.is_active);
  const disciplines = [...new Set(goals.flatMap(g => g.discipline || []))];
  const categories = ["skill", "performance", "endurance", "strength"];

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

  if (selectedGoal) {
    return (
      <GoalDetailView 
        goal={selectedGoal}
        progressionPath={progressionPaths.find(p => p.goal_id === selectedGoal.id)}
        userProgress={userProgress.find(p => p.goal_id === selectedGoal.id)}
        allExercises={exercises}
        onBack={() => setSelectedGoal(null)}
        onStartGoal={() => handleStartGoal(selectedGoal)}
        onProgressUpdate={loadData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Goals</h1>
          <p className="text-lg text-gray-600">
            Master skills, hit performance targets, and achieve meaningful milestones.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowActiveGoals(!showActiveGoals)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
              showActiveGoals ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Active Goals ({activeGoals.length})
          </button>
          <Link to={createPageUrl("CreateGoal")}>
            <button className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
              <Plus className="w-5 h-5" />
              Create Goal
            </button>
          </Link>
        </div>
      </div>

      {/* Active Goals Section */}
      {showActiveGoals && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Your Active Goals
          </h2>
          {activeGoals.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map(progress => {
                const goal = goals.find(g => g.id === progress.goal_id);
                if (!goal) return null;
                
                return (
                  <div key={progress.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleViewGoal(goal)}>
                    <h3 className="font-bold text-lg mb-2">{goal.name}</h3>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div>Level: <strong>{progress.current_level}</strong></div>
                      <div>Started: <strong>{new Date(progress.started_date).toLocaleDateString()}</strong></div>
                      <div>Days training: <strong>{Math.floor((new Date() - new Date(progress.started_date)) / (1000 * 60 * 60 * 24))}</strong></div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${categoryColors[goal.category]}`}>
                        {goal.category}
                      </span>
                      {goal.difficulty_level && (
                        <span className={`px-2 py-1 text-xs rounded-full ${difficultyColors[goal.difficulty_level]}`}>
                          {goal.difficulty_level}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active goals yet. Start by choosing a goal below!</p>
            </div>
          )}
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{userProgress.filter(p => p.is_active).length}</p>
              <p className="text-sm text-gray-600">Active Goals</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Trophy className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{userProgress.filter(p => p.completed_date).length}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{goals.length}</p>
              <p className="text-sm text-gray-600">Available</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Calendar className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(userProgress.reduce((sum, p) => {
                  if (p.started_date && !p.completed_date) {
                    const daysSince = Math.floor((new Date() - new Date(p.started_date)) / (1000 * 60 * 60 * 24));
                    return sum + daysSince;
                  }
                  return sum;
                }, 0) / Math.max(userProgress.filter(p => p.is_active).length, 1))}
              </p>
              <p className="text-sm text-gray-600">Avg Days Training</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search goals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Disciplines</option>
              {disciplines.map(discipline => (
                <option key={discipline} value={discipline}>
                  {discipline.charAt(0).toUpperCase() + discipline.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredGoals.length} of {goals.length} goals
        </div>
      </div>

      {/* Goals Grid */}
      {filteredGoals.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGoals.map(goal => {
            const progress = userProgress.find(p => p.goal_id === goal.id);
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                userProgress={progress}
                onView={() => handleViewGoal(goal)} // Pass view handler
                onStart={() => handleStartGoal(goal)} // Pass start handler
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-900">No Goals Found</h3>
          <p className="text-gray-600 mb-6">
            Try adjusting your search or filters to find goals.
          </p>
        </div>
      )}
    </div>
  );
}
