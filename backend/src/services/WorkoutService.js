const PredefinedWorkout = require('../models/PredefinedWorkout');
const UserWorkoutModification = require('../models/UserWorkoutModification');
const mongoose = require('mongoose');

class WorkoutService {
  /**
   * Get all predefined workouts for a user, including their modifications
   */
  static async getWorkoutsForUser(userId) {
    // Convert userId to ObjectId to match how workouts are stored
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get all workouts (common and user's private)
    const workouts = await PredefinedWorkout.find({
      $or: [
        { isCommon: true },
        { createdBy: userObjectId }
      ]
    })
    .populate('blocks.exercises.exercise_id', 'name muscles')
    .lean();
    
    // Get all user modifications
    const modifications = await UserWorkoutModification.find({ userId }).lean();
    
    // Create a map for quick lookup
    const modMap = new Map();
    modifications.forEach(mod => {
      modMap.set(mod.workoutId.toString(), mod);
    });
    
    // Apply modifications to workouts
    return workouts.map(workout => {
      const modification = modMap.get(workout._id.toString());
      if (modification) {
        const UserWorkoutModificationDoc = new UserWorkoutModification(modification);
        return UserWorkoutModificationDoc.applyToWorkout(workout);
      }
      return workout;
    });
  }
  
  /**
   * Get a single workout for a user with modifications applied
   */
  static async getWorkoutForUser(workoutId, userId) {
    // Convert userId to ObjectId for comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const workout = await PredefinedWorkout.findById(workoutId)
      .populate('blocks.exercises.exercise_id', 'name muscles')
      .lean();

    if (!workout) {
      return null;
    }

    // Check if user has access to this workout
    if (!workout.isCommon && workout.createdBy?.toString() !== userObjectId.toString()) {
      return null;
    }
    
    // Get user's modification if exists
    const modification = await UserWorkoutModification.findOne({
      userId,
      workoutId
    }).lean();
    
    if (modification) {
      const UserWorkoutModificationDoc = new UserWorkoutModification(modification);
      return UserWorkoutModificationDoc.applyToWorkout(workout);
    }
    
    return workout;
  }
  
  /**
   * Save or update a user's workout modification
   */
  static async saveModification(userId, workoutId, modifications, metadata) {
    const workout = await PredefinedWorkout.findById(workoutId);
    
    if (!workout) {
      throw new Error('Workout not found');
    }
    
    // Can only modify common workouts or workouts from other users
    if (!workout.isCommon && workout.createdBy?.toString() !== userId.toString()) {
      throw new Error('Cannot modify this workout');
    }
    
    // If it's the user's own private workout, they should use the regular update endpoint
    if (workout.createdBy?.toString() === userId.toString() && !workout.isCommon) {
      throw new Error('Use regular update endpoint for your own workouts');
    }
    
    const modification = await UserWorkoutModification.findOneAndUpdate(
      { userId, workoutId },
      {
        userId,
        workoutId,
        modifications,
        metadata
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    return modification;
  }
  
  /**
   * Remove a user's workout modification
   */
  static async removeModification(userId, workoutId) {
    const result = await UserWorkoutModification.findOneAndDelete({
      userId,
      workoutId
    });
    
    if (!result) {
      throw new Error('No modification found for this workout');
    }
    
    return result;
  }
  
  /**
   * Toggle favorite status for a workout
   */
  static async toggleFavorite(userId, workoutId, isFavorite) {
    const workout = await PredefinedWorkout.findById(workoutId);
    
    if (!workout) {
      throw new Error('Workout not found');
    }
    
    // Ensure modification exists with at least the favorite status
    const modification = await UserWorkoutModification.findOneAndUpdate(
      { userId, workoutId },
      {
        $set: {
          'metadata.isFavorite': isFavorite
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );
    
    return modification;
  }
  
  /**
   * Record workout completion
   */
  static async recordCompletion(userId, workoutId, completionData) {
    const workout = await PredefinedWorkout.findById(workoutId);
    
    if (!workout) {
      throw new Error('Workout not found');
    }
    
    // Get or create modification
    let modification = await UserWorkoutModification.findOne({ userId, workoutId });
    
    if (!modification) {
      modification = new UserWorkoutModification({
        userId,
        workoutId,
        metadata: {}
      });
    }
    
    // Update completion data
    modification.metadata.timesCompleted = (modification.metadata.timesCompleted || 0) + 1;
    modification.metadata.lastUsed = new Date();
    
    // Update personal record if applicable
    if (completionData.totalWeight || completionData.completionTime) {
      const currentPR = modification.metadata.personalRecord || {};
      
      if (completionData.totalWeight && 
          (!currentPR.totalWeight || completionData.totalWeight > currentPR.totalWeight)) {
        currentPR.totalWeight = completionData.totalWeight;
        currentPR.date = new Date();
      }
      
      if (completionData.completionTime && 
          (!currentPR.completionTime || completionData.completionTime < currentPR.completionTime)) {
        currentPR.completionTime = completionData.completionTime;
        currentPR.date = new Date();
      }
      
      modification.metadata.personalRecord = currentPR;
    }
    
    await modification.save();
    
    // Also increment popularity on the original workout
    await workout.incrementPopularity();
    
    return modification;
  }
}

module.exports = WorkoutService;