# MongoDB Database Schema Design

## Overview
This document defines the MongoDB schema for the SynergyFit application. We're using MongoDB for its flexibility with fitness data structures and ease of scaling.

## Collections

### 1. Users
```javascript
{
  _id: ObjectId,
  email: String (unique, required),
  password: String (hashed, required),
  name: String (required),
  profile: {
    age: Number,
    weight: Number, // in kg
    height: Number, // in cm
    fitnessLevel: String (enum: ['beginner', 'intermediate', 'advanced']),
    goals: [String],
    preferences: {
      workoutDuration: Number, // preferred minutes
      workoutDays: [Number], // 0-6 for days of week
      equipment: [String]
    }
  },
  settings: {
    units: String (enum: ['metric', 'imperial']),
    notifications: Boolean,
    theme: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 2. Exercises
```javascript
{
  _id: ObjectId,
  name: String (required),
  description: String,
  muscles: [String] (required), // primary muscle groups
  secondaryMuscles: [String], // secondary muscle groups
  discipline: [String] (required), // ['strength', 'cardio', 'flexibility', etc]
  equipment: [String], // required equipment
  difficulty: String (enum: ['beginner', 'intermediate', 'advanced']),
  instructions: [String], // step by step
  strain: {
    intensity: String (enum: ['low', 'moderate', 'high', 'max']),
    load: String (enum: ['bodyweight', 'light', 'moderate', 'heavy']),
    durationType: String (enum: ['reps', 'time', 'distance']),
    typicalVolume: String // e.g., "3x12", "30 seconds"
  },
  mediaUrls: {
    image: String,
    video: String
  },
  isCustom: Boolean (default: false),
  createdBy: ObjectId (ref: 'Users'), // null for system exercises
  createdAt: Date,
  updatedAt: Date
}
```

### 3. Workouts
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'Users', required),
  title: String (required),
  date: Date (required),
  type: String (enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit']),
  status: String (enum: ['planned', 'in_progress', 'completed', 'skipped']),
  durationMinutes: Number,
  exercises: [{
    exerciseId: ObjectId (ref: 'Exercises'),
    exerciseName: String, // denormalized for performance
    order: Number,
    sets: [{
      targetReps: Number,
      actualReps: Number,
      weight: Number, // in kg
      time: Number, // in seconds
      distance: Number, // in meters
      rpe: Number, // 1-10 rate of perceived exertion
      restSeconds: Number,
      notes: String,
      isCompleted: Boolean
    }],
    notes: String
  }],
  totalStrain: Number,
  muscleStrain: {
    chest: Number,
    back: Number,
    shoulders: Number,
    arms: Number,
    legs: Number,
    core: Number
  },
  notes: String,
  planId: ObjectId (ref: 'Plans'), // if part of a plan
  createdAt: Date,
  updatedAt: Date
}
```

### 4. PredefinedWorkouts (Templates)
```javascript
{
  _id: ObjectId,
  title: String (required),
  description: String,
  type: String (enum: ['strength', 'cardio', 'hybrid', 'recovery', 'hiit']),
  difficulty: String (enum: ['beginner', 'intermediate', 'advanced']),
  durationMinutes: Number,
  targetMuscles: [String],
  equipment: [String],
  exercises: [{
    exerciseId: ObjectId (ref: 'Exercises'),
    exerciseName: String, // denormalized
    order: Number,
    sets: [{
      reps: Number,
      time: Number, // for time-based exercises
      restSeconds: Number,
      notes: String
    }]
  }],
  isPublic: Boolean (default: true),
  createdBy: ObjectId (ref: 'Users'), // null for system templates
  tags: [String],
  popularity: Number, // usage count
  createdAt: Date,
  updatedAt: Date
}
```

### 5. Goals
```javascript
{
  _id: ObjectId,
  name: String (required),
  description: String,
  category: String (enum: ['strength', 'endurance', 'skill', 'weight', 'performance']),
  discipline: [String],
  difficultyLevel: String (enum: ['beginner', 'intermediate', 'advanced']),
  estimatedWeeks: Number,
  milestones: [{
    name: String,
    description: String,
    criteria: String, // how to measure
    order: Number
  }],
  prerequisites: [ObjectId] (ref: 'Goals'),
  progressionPaths: [ObjectId] (ref: 'ProgressionPaths'),
  isPublic: Boolean (default: true),
  createdBy: ObjectId (ref: 'Users'),
  createdAt: Date,
  updatedAt: Date
}
```

### 6. UserGoalProgress
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'Users', required),
  goalId: ObjectId (ref: 'Goals', required),
  status: String (enum: ['active', 'paused', 'completed', 'abandoned']),
  startDate: Date,
  targetDate: Date,
  completedDate: Date,
  currentMilestone: Number,
  milestoneProgress: [{
    milestoneIndex: Number,
    status: String (enum: ['pending', 'in_progress', 'completed']),
    startDate: Date,
    completedDate: Date,
    notes: String
  }],
  workouts: [ObjectId] (ref: 'Workouts'), // related workouts
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 7. Plans (Training Plans)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'Users', required),
  name: String (required),
  description: String,
  goalId: ObjectId (ref: 'Goals'),
  status: String (enum: ['draft', 'active', 'paused', 'completed']),
  startDate: Date,
  endDate: Date,
  schedule: {
    weeksTotal: Number,
    workoutsPerWeek: Number,
    restDays: [Number], // 0-6 for days of week
  },
  weeks: [{
    weekNumber: Number,
    focus: String, // weekly focus
    workouts: [{
      dayOfWeek: Number, // 0-6
      predefinedWorkoutId: ObjectId (ref: 'PredefinedWorkouts'),
      customWorkout: { // if not using predefined
        title: String,
        exercises: [/* same structure as workout exercises */]
      }
    }]
  }],
  progress: {
    currentWeek: Number,
    completedWorkouts: Number,
    totalWorkouts: Number,
    adherencePercentage: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 8. ExternalActivities
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'Users', required),
  date: Date (required),
  activityType: String (required), // 'running', 'cycling', 'swimming', etc
  source: String (enum: ['manual', 'strava', 'garmin', 'apple_health']),
  externalId: String, // ID from external service
  duration: Number, // in minutes
  distance: Number, // in meters
  metrics: {
    heartRate: {
      average: Number,
      max: Number
    },
    pace: Number, // minutes per km
    speed: Number, // km/h
    elevation: Number, // meters gained
    calories: Number
  },
  muscleStrain: {/* same as workouts */},
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### 9. WorkoutTypes
```javascript
{
  _id: ObjectId,
  name: String (unique, required),
  description: String,
  characteristics: {
    primaryFocus: String,
    intensityRange: {
      min: Number,
      max: Number
    },
    typicalDuration: Number,
    restBetweenSets: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 10. Disciplines
```javascript
{
  _id: ObjectId,
  name: String (unique, required),
  description: String,
  category: String, // 'strength', 'cardio', 'flexibility', 'skill'
  equipment: [String], // typical equipment
  createdAt: Date,
  updatedAt: Date
}
```

## Indexes

### Performance Indexes
```javascript
// Users
db.users.createIndex({ email: 1 }, { unique: true })

// Exercises
db.exercises.createIndex({ name: 1 })
db.exercises.createIndex({ muscles: 1 })
db.exercises.createIndex({ discipline: 1 })

// Workouts
db.workouts.createIndex({ userId: 1, date: -1 })
db.workouts.createIndex({ userId: 1, status: 1 })

// PredefinedWorkouts
db.predefinedworkouts.createIndex({ type: 1, difficulty: 1 })
db.predefinedworkouts.createIndex({ tags: 1 })

// Goals
db.goals.createIndex({ category: 1, difficultyLevel: 1 })

// UserGoalProgress
db.usergoalprogress.createIndex({ userId: 1, status: 1 })
db.usergoalprogress.createIndex({ goalId: 1 })

// Plans
db.plans.createIndex({ userId: 1, status: 1 })

// ExternalActivities
db.externalactivities.createIndex({ userId: 1, date: -1 })
```

## Data Migration Notes

### From CSV Files
1. **Exercises**: Map muscle_groups → muscles, add strain object
2. **Goals**: Ensure discipline is array, add milestones
3. **PredefinedWorkouts**: Convert exercise references to ObjectIds
4. **Handle dates**: Convert all date strings to Date objects
5. **User creation**: Create default user for migrated data

### Validation Rules
- All dates should be valid Date objects
- All ObjectId references should be validated
- Enum values must match defined options
- Required fields must be present

## API Considerations
- Use pagination for list endpoints
- Include populate options for references
- Add field selection for performance
- Implement soft deletes where appropriate