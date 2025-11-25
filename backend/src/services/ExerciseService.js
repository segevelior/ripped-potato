const Exercise = require('../models/Exercise');
const UserExerciseModification = require('../models/UserExerciseModification');
const mongoose = require('mongoose');

class ExerciseService {
  /**
   * Get all exercises for a user with their modifications applied
   * @param {String} userId - The user's ID
   * @returns {Array} Array of exercises with modifications applied
   */
  static async getExercisesForUser(userId) {
    // Convert userId to ObjectId to match how exercises are stored
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1. Get all exercises user can see
    const exercises = await Exercise.find({
      $or: [
        { isCommon: true },
        { createdBy: userObjectId }
      ]
    }).lean();
    
    // 2. Get all user modifications
    const modifications = await UserExerciseModification.find({ userId }).lean();
    
    // 3. Create a map for quick lookup
    const modMap = new Map(
      modifications.map(mod => [mod.exerciseId.toString(), mod])
    );
    
    // 4. Merge exercises with modifications
    return exercises.map(exercise => {
      const mod = modMap.get(exercise._id.toString());
      
      // Create base exercise with additional fields
      const result = {
        ...exercise,
        isCommon: exercise.isCommon || false,
        isPrivate: !exercise.isCommon,
        canEdit: !exercise.isCommon && exercise.createdBy?.toString() === userId.toString()
      };
      
      if (!mod) return result;
      
      // Apply modifications
      if (mod.modifications) {
        Object.keys(mod.modifications).forEach(key => {
          if (mod.modifications[key] !== undefined) {
            if (key === 'strain' && typeof mod.modifications[key] === 'object') {
              result[key] = { ...result[key], ...mod.modifications[key] };
            } else {
              result[key] = mod.modifications[key];
            }
          }
        });
      }
      
      // Add metadata
      result.userMetadata = mod.metadata;
      
      // Only mark as modified if there are actual content modifications
      // (not just metadata like favorites)
      const hasContentModifications = mod.modifications && 
        Object.keys(mod.modifications).some(key => mod.modifications[key] !== undefined);
      
      result.isModified = hasContentModifications;
      result.modificationId = mod._id;
      
      return result;
    });
  }
  
  /**
   * Save or update a modification
   * @param {String} userId - The user's ID
   * @param {String} exerciseId - The exercise ID
   * @param {Object} modifications - The modifications to apply
   * @param {Object} metadata - User-specific metadata
   */
  static async saveModification(userId, exerciseId, modifications, metadata) {
    // Convert userId to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Verify exercise exists and user can access it
    const exercise = await Exercise.findOne({
      _id: exerciseId,
      $or: [
        { isCommon: true },
        { createdBy: userObjectId }
      ]
    });
    
    if (!exercise) {
      throw new Error('Exercise not found or not accessible');
    }
    
    // Don't allow modifications on own private exercises - just edit directly
    if (exercise.createdBy?.toString() === userId.toString() && !exercise.isCommon) {
      throw new Error('Edit your private exercise directly instead of creating modifications');
    }
    
    return await UserExerciseModification.findOneAndUpdate(
      { userId, exerciseId },
      {
        modifications: modifications || {},
        metadata: metadata || {},
        userId,
        exerciseId
      },
      { upsert: true, new: true }
    );
  }
  
  /**
   * Remove a modification (revert to original)
   * @param {String} userId - The user's ID
   * @param {String} exerciseId - The exercise ID
   */
  static async removeModification(userId, exerciseId) {
    return await UserExerciseModification.findOneAndDelete({
      userId,
      exerciseId
    });
  }
  
  /**
   * Get a single exercise with modifications applied
   * @param {String} exerciseId - The exercise ID
   * @param {String} userId - The user's ID
   */
  static async getExerciseForUser(exerciseId, userId) {
    // Convert userId to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const exercise = await Exercise.findOne({
      _id: exerciseId,
      $or: [
        { isCommon: true },
        { createdBy: userObjectId }
      ]
    }).lean();
    
    if (!exercise) {
      return null;
    }
    
    // Check for modifications
    const modification = await UserExerciseModification.findOne({
      userId,
      exerciseId
    }).lean();
    
    if (!modification) {
      return exercise;
    }
    
    // Apply modifications
    const merged = { ...exercise };
    if (modification.modifications) {
      Object.keys(modification.modifications).forEach(key => {
        if (modification.modifications[key] !== undefined) {
          if (key === 'strain' && typeof modification.modifications[key] === 'object') {
            merged[key] = { ...merged[key], ...modification.modifications[key] };
          } else {
            merged[key] = modification.modifications[key];
          }
        }
      });
    }
    
    // Add metadata
    merged.userMetadata = modification.metadata;
    merged.isModified = true;
    merged.modificationId = modification._id;
    
    return merged;
  }
  
  /**
   * Toggle favorite status for an exercise
   * @param {String} userId - The user's ID
   * @param {String} exerciseId - The exercise ID
   * @param {Boolean} isFavorite - The new favorite status
   */
  static async toggleFavorite(userId, exerciseId, isFavorite) {
    const exercise = await Exercise.findById(exerciseId);
    
    if (!exercise) {
      throw new Error('Exercise not found');
    }
    
    // If it's a user's own exercise, they can update metadata without creating a modification
    if (exercise.canUserEdit(userId)) {
      // For now, we'll store this in modifications anyway for consistency
      // In the future, you might want to add a favorites field directly to the exercise
    }
    
    return await UserExerciseModification.findOneAndUpdate(
      { userId, exerciseId },
      {
        'metadata.isFavorite': isFavorite,
        userId,
        exerciseId
      },
      { upsert: true, new: true }
    );
  }
  
  /**
   * Update personal best for an exercise
   * @param {String} userId - The user's ID
   * @param {String} exerciseId - The exercise ID
   * @param {Object} personalBest - { value, unit, date }
   */
  static async updatePersonalBest(userId, exerciseId, personalBest) {
    return await UserExerciseModification.findOneAndUpdate(
      { userId, exerciseId },
      {
        'metadata.personalBest': personalBest,
        userId,
        exerciseId
      },
      { upsert: true, new: true }
    );
  }
}

module.exports = ExerciseService;