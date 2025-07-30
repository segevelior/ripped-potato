// Load all converted CSV data as seed data
import exerciseData from './exercise.json' assert { type: 'json' };
import workoutData from './workout.json' assert { type: 'json' };
import goalData from './goal.json' assert { type: 'json' };
import disciplineData from './discipline.json' assert { type: 'json' };
import workoutTypeData from './workouttype.json' assert { type: 'json' };
import predefinedWorkoutData from './predefinedworkout.json' assert { type: 'json' };
import planData from './plan.json' assert { type: 'json' };
import externalActivityData from './externalactivity.json' assert { type: 'json' };
import progressionPathData from './progressionpath.json' assert { type: 'json' };
import trainingPlanData from './trainingplan.json' assert { type: 'json' };
import userGoalProgressData from './usergoalprogress.json' assert { type: 'json' };
import userTrainingPatternData from './usertrainingpattern.json' assert { type: 'json' };
import workoutTemplateData from './workouttemplate.json' assert { type: 'json' };

export const seedData = {
  Exercise: exerciseData,
  Workout: workoutData,
  ExternalActivity: externalActivityData,
  WorkoutTemplate: workoutTemplateData,
  Discipline: disciplineData,
  WorkoutType: workoutTypeData,
  TrainingPlan: trainingPlanData,
  PredefinedWorkout: predefinedWorkoutData,
  Goal: goalData,
  ProgressionPath: progressionPathData,
  UserGoalProgress: userGoalProgressData,
  Plan: planData,
  UserTrainingPattern: userTrainingPatternData
};

// Function to load seed data into localStorage
export function loadSeedData() {
  Object.entries(seedData).forEach(([entity, data]) => {
    localStorage.setItem(`base44_${entity}`, JSON.stringify(data));
    console.log(`Loaded seed data for ${entity}: ${data.length} items`);
  });
}