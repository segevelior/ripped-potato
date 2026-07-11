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
const OAuthClient = require('../models/OAuthClient');
const OAuthAuthorizationCode = require('../models/OAuthAuthorizationCode');
const OAuthToken = require('../models/OAuthToken');
const OAuthPendingAuthorization = require('../models/OAuthPendingAuthorization');

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
      { name: 'User', model: User },
      { name: 'OAuthClient', model: OAuthClient },
      { name: 'OAuthAuthorizationCode', model: OAuthAuthorizationCode },
      { name: 'OAuthToken', model: OAuthToken },
      { name: 'OAuthPendingAuthorization', model: OAuthPendingAuthorization }
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

  // Atlas Search + Vector Search indexes for exercises (separate API from the
  // classic B-tree/text indexes above). Non-fatal: on a cluster without Atlas
  // Search these creations fail and the app degrades to in-memory search.
  await createAtlasExerciseIndexes(logger);
}

/**
 * Create the Atlas Search (fuzzy typeahead) and Vector Search (similar
 * exercises) indexes on the exercises collection. Idempotent — skips indexes
 * that already exist. Requires a cluster that supports Atlas Search (M0+).
 *
 * Note: M0/M2/M5 shared tiers cap at 3 Atlas Search indexes total; we create 2.
 */
async function createAtlasExerciseIndexes(logger) {
  const { EMBEDDING_DIMS } = require('../services/EmbeddingService');

  try {
    const db = mongoose.connection.db;
    const exercises = db.collection('exercises');

    // listSearchIndexes is a distinct API from indexes(); returns a cursor.
    let existing = [];
    try {
      existing = await exercises.listSearchIndexes().toArray();
    } catch (listErr) {
      // Older/unsupported clusters throw here — treat as "no Atlas Search".
      logger.warn('Atlas Search not available; skipping vector/search indexes (non-fatal)', { error: listErr.message });
      return;
    }
    const existingNames = new Set(existing.map(idx => idx.name));

    // Vector Search index for "similar exercises".
    if (!existingNames.has('exercise_vector_index')) {
      await exercises.createSearchIndex({
        name: 'exercise_vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [
            { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMS, similarity: 'cosine' },
            { type: 'filter', path: 'isCommon' },
            { type: 'filter', path: 'createdBy' }
          ]
        }
      });
      logger.info('Created Atlas vectorSearch index: exercise_vector_index');
    }

    // Atlas Search index for fuzzy typeahead. `name` gets both string +
    // autocomplete mappings so we can run text() and autocomplete() on it.
    if (!existingNames.has('exercise_search_index')) {
      await exercises.createSearchIndex({
        name: 'exercise_search_index',
        // type defaults to 'search'
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              name: [{ type: 'string' }, { type: 'autocomplete' }],
              description: { type: 'string' },
              muscles: { type: 'string' },
              secondaryMuscles: { type: 'string' },
              equipment: { type: 'string' },
              discipline: { type: 'string' }
            }
          }
        }
      });
      logger.info('Created Atlas search index: exercise_search_index');
    }

    logger.info('Atlas exercise search indexes verified');
  } catch (err) {
    logger.warn('Could not create Atlas exercise search indexes (non-fatal)', { error: err.message });
  }
}

module.exports = {
  ensureIndexes,
  createSearchIndexes
};
