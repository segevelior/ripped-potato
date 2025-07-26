import React, { useState, useEffect } from "react";
import { Plan, Goal, Workout, PredefinedWorkout, UserGoalProgress, ProgressionPath } from "@/api/entities";
import { ArrowLeft, Calendar, Target, Plus, X, Search, Clock, Check, ChevronRight, Zap, Wand2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addDays, parseISO, eachDayOfInterval, addWeeks } from "date-fns";

const WizardStep = ({ currentStep, stepNumber, title, children, isCompleted }) => {
  const isActive = currentStep === stepNumber;
  const isAccessible = currentStep >= stepNumber || isCompleted;
  
  return (
    <div className={`border rounded-xl transition-all ${
      isActive ? 'border-purple-500 bg-purple-50' : 
      isCompleted ? 'border-green-300 bg-green-50' :
      'border-gray-200 bg-white'
    }`}>
      <div className={`p-4 border-b ${
        isActive ? 'border-purple-200' : 
        isCompleted ? 'border-green-200' : 
        'border-gray-100'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isCompleted ? 'bg-green-500 text-white' :
            isActive ? 'bg-purple-500 text-white' :
            'bg-gray-200 text-gray-500'
          }`}>
            {isCompleted ? <Check className="w-4 h-4" /> : stepNumber}
          </div>
          <h3 className={`text-lg font-semibold ${
            isActive ? 'text-purple-900' :
            isCompleted ? 'text-green-900' :
            'text-gray-700'
          }`}>
            {title}
          </h3>
        </div>
      </div>
      
      {isAccessible && (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  );
};

const GoalSelector = ({ selectedGoals, onGoalToggle, goals, userProgress }) => {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredGoals = goals.filter(goal =>
    goal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getGoalProgress = (goalId) => {
    return userProgress.find(p => p.goal_id === goalId && p.is_active);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search goals..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>
      
      <div className="max-h-60 overflow-y-auto space-y-2">
        {filteredGoals.map(goal => {
          const progress = getGoalProgress(goal.id);
          const isSelected = selectedGoals.includes(goal.id);
          
          return (
            <div
              key={goal.id}
              onClick={() => onGoalToggle(goal.id)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                isSelected
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {goal.icon && <span>{goal.icon}</span>}
                    <h4 className="font-medium text-gray-900">{goal.name}</h4>
                    {progress && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        Level {progress.current_level}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                      {goal.category}
                    </span>
                    {goal.difficulty_level && (
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                        {goal.difficulty_level}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-5 h-5 text-purple-600" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const WorkoutAutoGenerator = ({ selectedGoals, goals, progressionPaths, predefinedWorkouts, planData, onWorkoutsGenerated }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationType, setGenerationType] = useState('smart'); // 'smart' or 'manual'
  const [generatedWorkouts, setGeneratedWorkouts] = useState([]);

  const generateSmartWorkouts = async () => {
    setIsGenerating(true);
    try {
      const linkedGoals = goals.filter(g => selectedGoals.includes(g.id));
      const workouts = [];
      
      // Calculate plan duration in weeks
      const startDate = new Date(planData.start_date);
      const endDate = new Date(planData.end_date);
      const planDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const planWeeks = Math.ceil(planDays / 7);
      
      // For each goal, find relevant workouts based on progression paths
      linkedGoals.forEach(goal => {
        const progressionPath = progressionPaths.find(p => p.goal_id === goal.id);
        
        if (progressionPath && progressionPath.levels) {
          // Add workouts for each progression level within the plan timeframe
          const relevantLevels = progressionPath.levels.filter(level => 
            !level.timeline_week || level.timeline_week <= planWeeks
          ).slice(0, Math.min(6, planWeeks)); // Max 6 workouts per goal
          
          relevantLevels.forEach((level, index) => {
            const scheduledDate = addDays(startDate, index * 7); // Weekly spacing
            
            workouts.push({
              workout_id: `progression-${goal.id}-${level.level}`,
              workout_type: 'progression',
              scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
              goal_id: goal.id,
              is_completed: false,
              progression_data: {
                goal_name: goal.name,
                level: level.level,
                exercise_name: level.exercise_name,
                mastery_criteria: level.mastery_criteria
              }
            });
          });
        } else {
          // Fallback: Find predefined workouts matching goal disciplines
          const relevantWorkouts = predefinedWorkouts.filter(workout =>
            workout.primary_disciplines?.some(discipline => 
              goal.discipline.includes(discipline)
            )
          ).slice(0, 3); // Max 3 workouts per goal without progression
          
          relevantWorkouts.forEach((workout, index) => {
            const scheduledDate = addDays(startDate, index * 10); // Spread over time
            
            workouts.push({
              workout_id: workout.id,
              workout_type: 'predefined',
              scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
              goal_id: goal.id,
              is_completed: false
            });
          });
        }
      });
      
      // Sort workouts by date and limit total number
      const sortedWorkouts = workouts
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
        .slice(0, Math.min(20, planWeeks * 3)); // Max 3 workouts per week
      
      setGeneratedWorkouts(sortedWorkouts);
      onWorkoutsGenerated(sortedWorkouts);
      
    } catch (error) {
      console.error("Error generating workouts:", error);
      alert("Failed to generate workouts. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const addManualWorkout = (workout) => {
    const newWorkout = {
      workout_id: workout.id,
      workout_type: 'predefined',
      scheduled_date: format(addDays(new Date(planData.start_date), generatedWorkouts.length), 'yyyy-MM-dd'),
      is_completed: false
    };
    
    const updatedWorkouts = [...generatedWorkouts, newWorkout];
    setGeneratedWorkouts(updatedWorkouts);
    onWorkoutsGenerated(updatedWorkouts);
  };

  if (selectedGoals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Select goals in Step 2 to auto-generate workouts</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Generation Options */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setGenerationType('smart')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            generationType === 'smart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Wand2 className="w-4 h-4 inline mr-2" />
          Smart Generation
        </button>
        <button
          onClick={() => setGenerationType('manual')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            generationType === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
          }`}
        >
          <Plus className="w-4 h-4 inline mr-2" />
          Add Manually
        </button>
      </div>

      {generationType === 'smart' ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Smart Workout Generation</h4>
            <p className="text-sm text-blue-700 mb-3">
              I'll create a progression-based workout schedule for your selected goals, using existing progression paths and relevant workout templates.
            </p>
            <ul className="text-xs text-blue-600 space-y-1 mb-4">
              <li>• {selectedGoals.length} goals selected</li>
              <li>• {Math.ceil((new Date(planData.end_date) - new Date(planData.start_date)) / (1000 * 60 * 60 * 24 * 7))} week plan</li>
              <li>• Progression-aware scheduling</li>
            </ul>
            <button
              onClick={generateSmartWorkouts}
              disabled={isGenerating}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Generate Workouts'}
            </button>
          </div>
          
          {/* Generated Workouts Preview */}
          {generatedWorkouts.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Generated Workouts ({generatedWorkouts.length})</h4>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {generatedWorkouts.map((workout, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">
                          {workout.progression_data ? (
                            <>
                              {workout.progression_data.exercise_name}
                              <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                                📈 Level {workout.progression_data.level}
                              </span>
                            </>
                          ) : (
                            predefinedWorkouts.find(w => w.id === workout.workout_id)?.name || 'Workout'
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {format(parseISO(workout.scheduled_date), 'MMM d, yyyy')}
                          {workout.goal_id && (
                            <span className="ml-2 text-blue-600">
                              → {goals.find(g => g.id === workout.goal_id)?.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const updated = generatedWorkouts.filter((_, i) => i !== index);
                          setGeneratedWorkouts(updated);
                          onWorkoutsGenerated(updated);
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Add Workouts Manually</h4>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {predefinedWorkouts.slice(0, 10).map(workout => (
              <div
                key={workout.id}
                onClick={() => addManualWorkout(workout)}
                className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium text-sm">{workout.name}</h5>
                    <p className="text-xs text-gray-600 mt-1">{workout.goal}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {(workout.primary_disciplines || []).slice(0, 2).map(discipline => (
                        <span key={discipline} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          {discipline}
                        </span>
                      ))}
                      <span className="text-xs text-gray-500">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {workout.estimated_duration}min
                      </span>
                    </div>
                  </div>
                  <Plus className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function CreatePlan() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [goals, setGoals] = useState([]);
  const [userProgress, setUserProgress] = useState([]);
  const [progressionPaths, setProgressionPaths] = useState([]);
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Form state
  const [planData, setPlanData] = useState({
    name: "",
    description: "",
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(addDays(new Date(), 56), 'yyyy-MM-dd'), // 8 weeks default
    recurrence: "once",
    status: "draft",
    linked_goals: [],
    linked_workouts: [],
    tags: []
  });

  useEffect(() => {
    loadData();
    
    // Check if we're editing an existing plan
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId) {
      setIsEditMode(true);
      loadPlanForEdit(editId);
    }
  }, []);

  const loadData = async () => {
    try {
      const [goalsData, progressData, pathsData, workoutsData] = await Promise.all([
        Goal.list(),
        UserGoalProgress.list(),
        ProgressionPath.list(),
        PredefinedWorkout.list()
      ]);
      setGoals(goalsData);
      setUserProgress(progressData);
      setProgressionPaths(pathsData);
      setPredefinedWorkouts(workoutsData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const loadPlanForEdit = async (planId) => {
    try {
      const plan = await Plan.get(planId);
      setPlanData(plan);
      if (plan.linked_goals?.length > 0) setCurrentStep(2);
      if (plan.linked_workouts?.length > 0) setCurrentStep(3);
    } catch (error) {
      console.error("Error loading plan for edit:", error);
    }
  };

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGoalToggle = (goalId) => {
    setPlanData(prev => ({
      ...prev,
      linked_goals: prev.linked_goals.includes(goalId)
        ? prev.linked_goals.filter(id => id !== goalId)
        : [...prev.linked_goals, goalId]
    }));
  };

  const handleWorkoutsGenerated = (workouts) => {
    setPlanData(prev => ({
      ...prev,
      linked_workouts: workouts
    }));
  };

  const handleSubmit = async (status = 'draft') => {
    if (!planData.name.trim()) {
      alert("Please enter a plan name");
      return;
    }

    setIsLoading(true);
    try {
      // Calculate progress metrics
      const progressMetrics = {
        total_workouts: planData.linked_workouts.length,
        completed_workouts: 0,
        completion_percentage: 0,
        current_week: 1,
        streak_days: 0
      };

      const finalPlanData = {
        ...planData,
        status,
        progress_metrics: progressMetrics
      };

      if (isEditMode) {
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        await Plan.update(editId, finalPlanData);
        alert("Plan updated successfully!");
      } else {
        await Plan.create(finalPlanData);
        alert("Plan created successfully!");
      }
      
      navigate(createPageUrl("Plans"));
    } catch (error) {
      console.error("Error saving plan:", error);
      alert("Failed to save plan. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isStep1Complete = planData.name.trim() && planData.start_date && planData.end_date;
  const isStep2Complete = planData.linked_goals.length > 0;
  const isStep3Complete = planData.linked_workouts.length > 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl("Plans")}>
          <button className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Edit Plan' : 'Create New Plan'}
          </h1>
          <p className="text-lg text-gray-600">Build a structured training plan with smart workout generation.</p>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                currentStep >= step ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step}
              </div>
              {step < 3 && (
                <div className={`w-20 h-1 mx-4 rounded transition-colors ${
                  currentStep > step ? 'bg-purple-500' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-600">
          <span>Basic Details</span>
          <span>Select Goals</span>
          <span>Generate Workouts</span>
        </div>
      </div>

      {/* Wizard Steps */}
      <div className="space-y-6">
        <WizardStep currentStep={currentStep} stepNumber={1} title="Plan Details" isCompleted={isStep1Complete}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan Name *</label>
              <input
                type="text"
                value={planData.name}
                onChange={(e) => setPlanData(prev => ({...prev, name: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., 8-Week Muscle-Up Training"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan Type</label>
              <select
                value={planData.recurrence}
                onChange={(e) => setPlanData(prev => ({...prev, recurrence: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="once">One-time Plan</option>
                <option value="weekly">Repeats Weekly</option>
                <option value="monthly">Repeats Monthly</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
              <input
                type="date"
                value={planData.start_date}
                onChange={(e) => setPlanData(prev => ({...prev, start_date: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
              <input
                type="date"
                value={planData.end_date}
                onChange={(e) => setPlanData(prev => ({...prev, end_date: e.target.value}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={planData.description}
              onChange={(e) => setPlanData(prev => ({...prev, description: e.target.value}))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={3}
              placeholder="Describe what this plan aims to achieve..."
            />
          </div>

          {isStep1Complete && (
            <div className="flex justify-end mt-6">
              <button
                onClick={handleNextStep}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                Next: Select Goals
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </WizardStep>

        <WizardStep currentStep={currentStep} stepNumber={2} title={`Linked Goals (${planData.linked_goals.length})`} isCompleted={isStep2Complete}>
          <p className="text-sm text-gray-600 mb-4">
            Select the goals this plan will help you achieve. The workout generator will use these to create a progression-based schedule.
          </p>
          
          <GoalSelector
            selectedGoals={planData.linked_goals}
            onGoalToggle={handleGoalToggle}
            goals={goals}
            userProgress={userProgress}
          />

          <div className="flex justify-between mt-6">
            <button
              onClick={handlePreviousStep}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Previous
            </button>
            {isStep2Complete && (
              <button
                onClick={handleNextStep}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                Next: Generate Workouts
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </WizardStep>

        <WizardStep currentStep={currentStep} stepNumber={3} title={`Workouts (${planData.linked_workouts.length})`} isCompleted={isStep3Complete}>
          <WorkoutAutoGenerator
            selectedGoals={planData.linked_goals}
            goals={goals}
            progressionPaths={progressionPaths}
            predefinedWorkouts={predefinedWorkouts}
            planData={planData}
            onWorkoutsGenerated={handleWorkoutsGenerated}
          />

          <div className="flex justify-between mt-6">
            <button
              onClick={handlePreviousStep}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Previous
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => handleSubmit('draft')}
                disabled={isLoading}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? "Saving..." : "Save as Draft"}
              </button>
              <button
                onClick={() => handleSubmit('active')}
                disabled={isLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create & Activate Plan"}
              </button>
            </div>
          </div>
        </WizardStep>
      </div>
    </div>
  );
}