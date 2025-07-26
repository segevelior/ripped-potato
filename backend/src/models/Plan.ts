import mongoose, { Document, Schema } from 'mongoose';

export interface IPlanWorkout {
  workout: mongoose.Types.ObjectId; // Reference to Workout (template)
  scheduledDate?: Date;
  isCompleted: boolean;
  completedAt?: Date;
  actualWorkout?: mongoose.Types.ObjectId; // Reference to actual completed Workout
}

export interface IPlan extends Document {
  user: mongoose.Types.ObjectId; // Reference to User
  name: string;
  description?: string;
  goals: mongoose.Types.ObjectId[]; // References to Goals
  startDate: Date;
  endDate: Date;
  status: 'draft' | 'active' | 'completed' | 'paused' | 'cancelled';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  workoutsPerWeek: number;
  estimatedDurationMinutes: number; // per workout
  workouts: IPlanWorkout[];
  progressMetrics: {
    completedWorkouts: number;
    totalWorkouts: number;
    completionRate: number; // percentage
    averageRating?: number;
    totalTimeSpent: number; // in minutes
  };
  isTemplate: boolean;
  templateName?: string;
  isPublic: boolean;
  tags: string[];
  createdBy?: mongoose.Types.ObjectId; // For shared/coach plans
  createdAt: Date;
  updatedAt: Date;
}

const PlanWorkoutSchema: Schema = new Schema({
  workout: {
    type: Schema.Types.ObjectId,
    ref: 'Workout',
    required: true
  },
  scheduledDate: {
    type: Date
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  actualWorkout: {
    type: Schema.Types.ObjectId,
    ref: 'Workout'
  }
}, { _id: false });

const PlanSchema: Schema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  goals: [{
    type: Schema.Types.ObjectId,
    ref: 'Goal'
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'paused', 'cancelled'],
    default: 'draft'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  workoutsPerWeek: {
    type: Number,
    required: true,
    min: 1,
    max: 14 // realistic max
  },
  estimatedDurationMinutes: {
    type: Number,
    required: true,
    min: 10,
    max: 300 // 5 hours max per workout
  },
  workouts: [PlanWorkoutSchema],
  progressMetrics: {
    completedWorkouts: {
      type: Number,
      default: 0
    },
    totalWorkouts: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number
    },
    totalTimeSpent: {
      type: Number,
      default: 0
    }
  },
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateName: {
    type: String,
    trim: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'plans'
});

// Indexes for performance
PlanSchema.index({ user: 1, status: 1 });
PlanSchema.index({ user: 1, startDate: 1 });
PlanSchema.index({ isTemplate: 1, isPublic: 1 });
PlanSchema.index({ status: 1 });
PlanSchema.index({ tags: 1 });

// Pre-save middleware to calculate progress metrics
PlanSchema.pre<IPlan>('save', function(next) {
  if (this.workouts && Array.isArray(this.workouts)) {
    const totalWorkouts = this.workouts.length;
    const completedWorkouts = this.workouts.filter(w => w.isCompleted).length;
    const completionRate = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0;

    this.progressMetrics = {
      ...this.progressMetrics,
      totalWorkouts,
      completedWorkouts,
      completionRate
    };
  }
  next();
});

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema); 