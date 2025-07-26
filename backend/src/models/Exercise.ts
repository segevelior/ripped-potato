import mongoose, { Document, Schema } from 'mongoose';

export interface IExercise extends Document {
  name: string;
  description?: string;
  category: string;
  equipment: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  tips?: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  videoUrl?: string;
  imageUrls: string[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSchema: Schema = new Schema({
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
    enum: [
      'strength',
      'cardio',
      'flexibility',
      'mobility',
      'balance',
      'plyometrics',
      'rehabilitation'
    ]
  },
  equipment: [{
    type: String,
    enum: [
      'none',
      'dumbbells',
      'barbell',
      'kettlebell',
      'resistance_bands',
      'pull_up_bar',
      'bench',
      'cable_machine',
      'treadmill',
      'bike',
      'yoga_mat'
    ]
  }],
  primaryMuscles: [{
    type: String,
    enum: [
      'chest',
      'back',
      'shoulders',
      'biceps',
      'triceps',
      'forearms',
      'abs',
      'obliques',
      'glutes',
      'quadriceps',
      'hamstrings',
      'calves'
    ]
  }],
  secondaryMuscles: [{
    type: String,
    enum: [
      'chest',
      'back',
      'shoulders',
      'biceps',
      'triceps',
      'forearms',
      'abs',
      'obliques',
      'glutes',
      'quadriceps',
      'hamstrings',
      'calves'
    ]
  }],
  instructions: [{
    type: String,
    required: true
  }],
  tips: [{
    type: String
  }],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  videoUrl: {
    type: String
  },
  imageUrls: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'exercises'
});

// Indexes for performance
ExerciseSchema.index({ name: 1 });
ExerciseSchema.index({ category: 1 });
ExerciseSchema.index({ primaryMuscles: 1 });
ExerciseSchema.index({ difficulty: 1 });
ExerciseSchema.index({ isActive: 1 });

export const Exercise = mongoose.model<IExercise>('Exercise', ExerciseSchema); 