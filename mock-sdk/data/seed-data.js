// Load all converted CSV data as seed data
import exerciseData from './exercise.json' assert { type: 'json' };
import sessionLogData from './sessionlog.json' assert { type: 'json' };
import goalData from './goal.json' assert { type: 'json' };
import disciplineData from './discipline.json' assert { type: 'json' };
import sessionTypeData from './sessiontype.json' assert { type: 'json' };
import sessionTemplateData from './sessiontemplate.json' assert { type: 'json' };
import planData from './plan.json' assert { type: 'json' };
import externalActivityData from './externalactivity.json' assert { type: 'json' };
import progressionPathData from './progressionpath.json' assert { type: 'json' };
import trainingPlanData from './trainingplan.json' assert { type: 'json' };
import userGoalProgressData from './usergoalprogress.json' assert { type: 'json' };
import userTrainingPatternData from './usertrainingpattern.json' assert { type: 'json' };
// Legacy weekly-schedule rows the pre-rename mock exposed as `WorkoutTemplate` —
// a separate dataset from the session templates above, kept for parity.
import sessionTemplateAliasData from './sessiontemplate-alias.json' assert { type: 'json' };

export const seedData = {
  Exercise: exerciseData,
  SessionLog: sessionLogData,
  ExternalActivity: externalActivityData,
  SessionTemplateAlias: sessionTemplateAliasData,
  Discipline: disciplineData,
  SessionType: sessionTypeData,
  TrainingPlan: trainingPlanData,
  SessionTemplate: sessionTemplateData,
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
