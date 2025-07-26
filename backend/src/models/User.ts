import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  profilePicture?: string;
  isVerified: boolean;
  lastLogin?: Date;
  preferences: {
    units: 'metric' | 'imperial';
    notifications: boolean;
    theme: 'light' | 'dark';
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  profilePicture: {
    type: String // URL to profile image
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  preferences: {
    units: {
      type: String,
      enum: ['metric', 'imperial'],
      default: 'metric'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  collection: 'users'
});

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ createdAt: 1 });

export const User = mongoose.model<IUser>('User', UserSchema); 