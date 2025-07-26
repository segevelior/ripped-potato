
import React, { useState } from "react";
import { ArrowLeft, Target, Play, Users, Trophy, MoreVertical, Trash2, Repeat, GitBranch } from "lucide-react";
import { ProgressionPath, UserGoalProgress } from "@/api/entities";
import ProgressionFlowEditor from "./ProgressionFlowEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function GoalDetailView({ goal, progressionPath, userProgress, allExercises, onBack, onStartGoal, onProgressUpdate }) {
  const isStarted = !!userProgress;
  const isCompleted = userProgress?.completed_date;

  const handleSavePath = async (updatedPath) => {
    try {
        if (updatedPath.id) {
            await ProgressionPath.update(updatedPath.id, updatedPath);
        } else {
            const newPath = await ProgressionPath.create(updatedPath);
            // We need to trigger a reload of data on the parent page
        }
        alert("Progression path saved!");
        onProgressUpdate(); // Reload data on the main page
    } catch (error) {
        console.error("Error saving progression path:", error);
        alert("Failed to save progression path.");
    }
  };

  const handleResignGoal = async () => {
    if (!userProgress || !confirm("Are you sure you want to resign from this goal? Your progress will be deleted.")) return;
    
    try {
      await UserGoalProgress.delete(userProgress.id);
      alert("You have resigned from the goal.");
      onProgressUpdate(); // Refresh the data
      onBack(); // Go back to goals list
    } catch (error) {
      console.error("Error resigning from goal:", error);
      alert("Failed to resign from goal. Please try again.");
    }
  };

  const handleRestartGoal = async () => {
    if (!userProgress || !confirm("Are you sure you want to restart this goal? Your current progress will be reset to level 1.")) return;
    
    try {
      const updates = {
        current_level: 1,
        started_date: new Date().toISOString().split('T')[0],
        completed_date: null,
        is_active: true,
        level_history: [{
          level: 1,
          achieved_date: new Date().toISOString().split('T')[0],
          notes: "Goal restarted"
        }]
      };
      await UserGoalProgress.update(userProgress.id, updates);
      alert("Goal has been restarted.");
      onProgressUpdate();
    } catch (error) {
      console.error("Error restarting goal:", error);
      alert("Failed to restart goal. Please try again.");
    }
  };

  if (!goal) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{goal.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            {goal.icon && <span className="text-2xl">{goal.icon}</span>}
            <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 font-medium">{goal.category}</span>
            {goal.difficulty_level && (
              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 font-medium">{goal.difficulty_level}</span>
            )}
            {(goal.discipline || []).map(d => (
              <span key={d} className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">{d}</span>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {isCompleted ? (
                <div className="flex items-center gap-2 text-green-600">
                    <Trophy className="w-5 h-5" />
                    <span className="font-semibold">Completed!</span>
                </div>
            ) : isStarted ? (
                <div className="flex items-center gap-2 text-blue-600">
                    <Target className="w-5 h-5" />
                    <span className="font-semibold">Level {userProgress.current_level}</span>
                </div>
            ) : (
                 <button
                    onClick={() => onStartGoal(goal)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-lg"
                 >
                    <Play className="w-5 h-5" />
                    Start This Goal
                </button>
            )}

            {isStarted && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-2 rounded-full hover:bg-gray-100">
                            <MoreVertical className="w-5 h-5" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleRestartGoal}>
                            <Repeat className="w-4 h-4 mr-2"/>
                            Restart Goal
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleResignGoal} className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2"/>
                            Resign from Goal
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
      </div>

      {/* Goal Description */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold mb-3">About This Goal</h2>
        <p className="text-gray-700 mb-4">{goal.description}</p>
      </div>

      {/* Progression Builder */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold flex items-center gap-2 mb-4">
          <GitBranch className="text-purple-600"/> 
          Progression Builder
        </h3>
        <ProgressionFlowEditor 
          goal={goal}
          initialPath={progressionPath}
          onSave={handleSavePath}
        />
      </div>
    </div>
  );
}
