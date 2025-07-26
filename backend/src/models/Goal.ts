import mongoose, { Document, Schema } from 'mongoose';

export interface IGoal extends Document {
  user: mongoose.Types.ObjectId; // Reference to User
  name: string;
  description?: string;
  category: 'strength' | 'endurance' | 'skill' | 'performance' | 'body_composition';
  discipline: string[]; // e.g., ['weightlifting', 'cardio']
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  estimatedWeeks: number;
  targetDate?: Date;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress: number; // 0-100 percentage
  icon?: string;
  prerequisites: string[];
  metrics: {
    currentValue?: number;
    targetValue?: number;
    unit?: string; // kg, lbs, reps, seconds, etc.
  };
  milestones: {
    title: string;
    description?: string;
    targetValue?: number;
    isCompleted: boolean;
    completedAt?: Date;
  }[];
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const GoalSchema: Schema = new Schema({
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
  category: {
    type: String,
    required: true,
    enum: ['strength', 'endurance', 'skill', 'performance', 'body_composition']
  },
  discipline: [{
    type: String,
    enum: [
      'weightlifting',
      'cardio',
      'running',
      'cycling',
      'swimming',
      'martial_arts',
      'yoga',
      'calisthenics',
      'powerlifting',
      'olympic_lifting'
    ]
  }],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'elite'],
    default: 'beginner'
  },
  estimatedWeeks: {
    type: Number,
    required: true,
    min: 1,
    max: 104 // 2 years max
  },
  targetDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'cancelled'],
    default: 'active'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  icon: {
    type: String
  },
  prerequisites: [{
    type: String
  }],
  metrics: {
    currentValue: {
      type: Number
    },
    targetValue: {
      type: Number
    },
    unit: {
      type: String,
      enum: ['kg', 'lbs', 'reps', 'seconds', 'minutes', 'miles', 'km', 'percent']
    }
  },
  milestones: [{
    title: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    targetValue: {
      type: Number
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  collection: 'goals'
});

// Indexes for performance
GoalSchema.index({ user: 1, status: 1 });
GoalSchema.index({ user: 1, category: 1 });
GoalSchema.index({ targetDate: 1 });
GoalSchema.index({ status: 1 });

export const Goal = mongoose.model<IGoal>('Goal', GoalSchema); 