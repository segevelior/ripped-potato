import mongoose, { Document, Schema } from 'mongoose';

// Sub-schema for workout sets
export interface IWorkoutSet {
  reps?: number;
  weight?: number; // in kg or lbs
  duration?: number; // in seconds
  distance?: number; // in meters
  rpe?: number; // Rate of Perceived Exertion (1-10)
  restTime?: number; // in seconds
  notes?: string;
}

export interface IWorkoutExercise {
  exercise: mongoose.Types.ObjectId; // Reference to Exercise
  sets: IWorkoutSet[];
  totalVolume?: number; // calculated field
  personalRecord?: boolean;
  notes?: string;
}

export interface IWorkout extends Document {
  user: mongoose.Types.ObjectId; // Reference to User
  title: string;
  description?: string;
  date: Date;
  startTime?: Date;
  endTime?: Date;
  duration?: number; // in minutes
  exercises: IWorkoutExercise[];
  type: 'strength' | 'cardio' | 'mixed' | 'flexibility' | 'sports';
  intensity: 'low' | 'moderate' | 'high' | 'maximal';
  location?: string;
  weather?: string;
  mood?: 'excellent' | 'good' | 'average' | 'poor' | 'terrible';
  overallRpe?: number; // Overall workout RPE (1-10)
  caloriesBurned?: number;
  notes?: string;
  isCompleted: boolean;
  isTemplate: boolean;
  templateName?: string;
  tags: string[];
  metrics: {
    totalSets: number;
    totalReps: number;
    totalWeight: number; // total weight lifted
    averageRpe: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const WorkoutSetSchema: Schema = new Schema({
  reps: {
    type: Number,
    min: 0
  },
  weight: {
    type: Number,
    min: 0
  },
  duration: {
    type: Number,
    min: 0
  },
  distance: {
    type: Number,
    min: 0
  },
  rpe: {
    type: Number,
    min: 1,
    max: 10
  },
  restTime: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: false });

const WorkoutExerciseSchema: Schema = new Schema({
  exercise: {
    type: Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  sets: [WorkoutSetSchema],
  totalVolume: {
    type: Number,
    default: 0
  },
  personalRecord: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: false });

const WorkoutSchema: Schema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in minutes
    min: 0
  },
  exercises: [WorkoutExerciseSchema],
  type: {
    type: String,
    enum: ['strength', 'cardio', 'mixed', 'flexibility', 'sports'],
    default: 'mixed'
  },
  intensity: {
    type: String,
    enum: ['low', 'moderate', 'high', 'maximal'],
    default: 'moderate'
  },
  location: {
    type: String,
    trim: true
  },
  weather: {
    type: String,
    trim: true
  },
  mood: {
    type: String,
    enum: ['excellent', 'good', 'average', 'poor', 'terrible']
  },
  overallRpe: {
    type: Number,
    min: 1,
    max: 10
  },
  caloriesBurned: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    trim: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateName: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  metrics: {
    totalSets: {
      type: Number,
      default: 0
    },
    totalReps: {
      type: Number,
      default: 0
    },
    totalWeight: {
      type: Number,
      default: 0
    },
    averageRpe: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  collection: 'workouts'
});

// Indexes for performance
WorkoutSchema.index({ user: 1, date: -1 });
WorkoutSchema.index({ user: 1, isCompleted: 1 });
WorkoutSchema.index({ user: 1, isTemplate: 1 });
WorkoutSchema.index({ date: 1 });
WorkoutSchema.index({ type: 1 });
WorkoutSchema.index({ tags: 1 });

// Pre-save middleware to calculate metrics
WorkoutSchema.pre<IWorkout>('save', function(next) {
  if (this.exercises && Array.isArray(this.exercises) && this.exercises.length > 0) {
    let totalSets = 0;
    let totalReps = 0;
    let totalWeight = 0;
    let totalRpe = 0;
    let rpeCount = 0;

    this.exercises.forEach((exercise: IWorkoutExercise) => {
      if (exercise.sets && Array.isArray(exercise.sets)) {
        totalSets += exercise.sets.length;
        exercise.sets.forEach((set: IWorkoutSet) => {
          if (set.reps) totalReps += set.reps;
          if (set.weight && set.reps) totalWeight += (set.weight * set.reps);
          if (set.rpe) {
            totalRpe += set.rpe;
            rpeCount++;
          }
        });
      }
    });

    this.metrics = {
      totalSets,
      totalReps,
      totalWeight,
      averageRpe: rpeCount > 0 ? totalRpe / rpeCount : 0
    };
  }
  next();
});

export const Workout = mongoose.model<IWorkout>('Workout', WorkoutSchema); 