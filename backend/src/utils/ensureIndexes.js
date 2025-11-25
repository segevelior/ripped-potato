/**
 * Ensure MongoDB indexes are created for optimal query performance.
 * This runs on server startup after MongoDB connection.
 *
 * Indexes are defined in models, but this ensures they exist and logs status.
 */

const mongoose = require('mongoose');

// Import all models to ensure their indexes are registered
const Exercise = require('../models/Exercise');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const Workout = require('../models/Workout');
const Plan = require('../models/Plan');
const Goal = require('../models/Goal');
const User = require('../models/User');

/**
 * Ensure all collection indexes are created
 * @param {object} logger - Winston logger instance
 */
async function ensureIndexes(logger) {
  const startTime = Date.now();

  try {
    logger.info('Starting index creation/verification...');

    // List of models to ensure indexes for
    const models = [
      { name: 'Exercise', model: Exercise },
      { name: 'PredefinedWorkout', model: PredefinedWorkout },
      { name: 'Workout', model: Workout },
      { name: 'Plan', model: Plan },
      { name: 'Goal', model: Goal },
      { name: 'User', model: User }
    ];

    const results = [];

    for (const { name, model } of models) {
      try {
        // createIndexes() ensures all indexes defined in the schema exist
        await model.createIndexes();

        // Get the current indexes for logging
        const indexes = await model.collection.indexes();
        results.push({
          collection: name,
          indexCount: indexes.length,
          status: 'ok'
        });

        logger.info(`Indexes ensured for ${name}`, {
          collection: name,
          indexCount: indexes.length,
          indexes: indexes.map(idx => idx.name)
        });
      } catch (err) {
        results.push({
          collection: name,
          status: 'error',
          error: err.message
        });
        logger.error(`Failed to ensure indexes for ${name}`, {
          collection: name,
          error: err.message
        });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'ok').length;

    logger.info('Index verification complete', {
      duration: `${duration}ms`,
      total: models.length,
      success: successCount,
      failed: models.length - successCount
    });

    return {
      success: true,
      duration,
      results
    };

  } catch (err) {
    logger.error('Index verification failed', { error: err.message, stack: err.stack });
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Create additional custom indexes for grep/search performance
 * These are in addition to schema-defined indexes
 */
async function createSearchIndexes(logger) {
  try {
    const db = mongoose.connection.db;

    // Text index for exercise name search (for grep_exercises)
    // Note: This is already defined in the Exercise model, but we ensure it exists
    const exercisesCollection = db.collection('exercises');

    // Check if text index exists, create if not
    const exerciseIndexes = await exercisesCollection.indexes();
    const hasTextIndex = exerciseIndexes.some(idx => idx.key && idx.key._fts === 'text');

    if (!hasTextIndex) {
      await exercisesCollection.createIndex(
        { name: 'text', description: 'text' },
        { name: 'exercise_text_search', background: true }
      );
      logger.info('Created text search index for exercises');
    }

    // Similar for predefinedworkouts
    const workoutsCollection = db.collection('predefinedworkouts');
    const workoutIndexes = await workoutsCollection.indexes();
    const hasWorkoutTextIndex = workoutIndexes.some(idx => idx.key && idx.key._fts === 'text');

    if (!hasWorkoutTextIndex) {
      await workoutsCollection.createIndex(
        { name: 'text', goal: 'text', tags: 'text' },
        { name: 'workout_text_search', background: true }
      );
      logger.info('Created text search index for predefinedworkouts');
    }

    logger.info('Search indexes verified');

  } catch (err) {
    // Don't fail startup if search indexes can't be created
    logger.warn('Could not create search indexes (non-fatal)', { error: err.message });
  }
}

module.exports = {
  ensureIndexes,
  createSearchIndexes
};
