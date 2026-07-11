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
   * Overlay a user's modifications onto an already-fetched set of exercises.
   * Batched (one query for all ids) — unlike getExerciseForUser which is one
   * doc / two queries. Used by findSimilar so we don't do N+1 lookups.
   * Mirrors the merge logic in getExercisesForUser, scoped to the passed set.
   * @param {Array} exercises - lean exercise docs (must include _id)
   * @param {String} userId - The user's ID
   * @returns {Array} exercises with modifications + metadata applied
   */
  static async applyModifications(exercises, userId) {
    if (!exercises || exercises.length === 0) return exercises;

    const ids = exercises.map(ex => ex._id);
    const modifications = await UserExerciseModification.find({
      userId,
      exerciseId: { $in: ids }
    }).lean();

    const modMap = new Map(
      modifications.map(mod => [mod.exerciseId.toString(), mod])
    );

    return exercises.map(exercise => {
      const result = {
        ...exercise,
        isCommon: exercise.isCommon || false,
        isPrivate: !exercise.isCommon,
        canEdit: !exercise.isCommon && exercise.createdBy?.toString() === userId.toString()
      };

      const mod = modMap.get(exercise._id.toString());
      if (!mod) return result;

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

      result.userMetadata = mod.metadata;
      const hasContentModifications = mod.modifications &&
        Object.keys(mod.modifications).some(key => mod.modifications[key] !== undefined);
      result.isModified = hasContentModifications;
      result.modificationId = mod._id;

      return result;
    });
  }

  /**
   * Find exercises semantically similar to a given one via Atlas Vector Search.
   * "Clusters" are emergent at query time — no precomputed groups. Respects
   * visibility (common OR owned by the user) via the vector index filter fields.
   * @param {String} exerciseId - The source exercise
   * @param {String|null} userId - Requesting user (null = anonymous, common only)
   * @param {Number} limit - Max alternatives to return
   * @returns {Array} similar exercises with a `score`, modifications overlaid
   */
  static async findSimilar(exerciseId, userId, limit = 8) {
    // Source embedding is select:false, so opt in explicitly.
    const source = await Exercise.findById(exerciseId).select('+embedding').lean();
    if (!source) return [];

    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;
    const visibilityFilter = userObjectId
      ? { $or: [{ isCommon: true }, { createdBy: userObjectId }] }
      : { isCommon: true };

    // Deterministic muscle-overlap fallback. Used when this exercise has no
    // embedding yet (pre-backfill) or when vector search is unavailable/empty
    // (index still building). Keeps "Similar" working without embeddings and
    // upgrades to semantic ranking transparently once vectors land. Projects the
    // same shape as the vector path (incl. strain, so callers can build default
    // sets from strain.typicalVolume).
    const muscleFallback = async () => {
      const muscles = source.muscles || [];
      if (muscles.length === 0) return [];
      const docs = await Exercise.find({
        muscles: { $in: muscles },
        _id: { $ne: source._id },
        ...visibilityFilter
      })
        .select('name description muscles secondaryMuscles discipline equipment difficulty instructions strain mediaUrls isCommon createdBy')
        .limit(50)
        .lean();
      const srcSet = new Set(muscles.map(m => String(m).toLowerCase()));
      const ranked = docs
        .map(d => ({
          ...d,
          score: (d.muscles || []).reduce((n, m) => n + (srcSet.has(String(m).toLowerCase()) ? 1 : 0), 0)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return userId ? this.applyModifications(ranked, userId) : ranked;
    };

    const hasEmbedding = Array.isArray(source.embedding) && source.embedding.length > 0;
    if (!hasEmbedding) return muscleFallback();

    let results;
    try {
      results = await Exercise.aggregate([
        {
          $vectorSearch: {
            index: 'exercise_vector_index',
            path: 'embedding',
            queryVector: source.embedding,
            numCandidates: 100,
            limit: limit + 1, // +1 so we can drop the source itself
            filter: visibilityFilter
          }
        },
        {
          $project: {
            name: 1, description: 1, muscles: 1, secondaryMuscles: 1, discipline: 1,
            equipment: 1, difficulty: 1, instructions: 1, strain: 1, mediaUrls: 1,
            isCommon: 1, createdBy: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ]);
    } catch (err) {
      // Index not READY / vector search unavailable — degrade, don't 500.
      console.warn('Vector search unavailable, falling back to muscle overlap:', err.message);
      return muscleFallback();
    }

    // Drop the source exercise if it came back among its own neighbours.
    const filtered = results
      .filter(ex => ex._id.toString() !== exerciseId.toString())
      .slice(0, limit);

    // No semantic neighbours (e.g. sparse embeddings) — still give the user
    // something useful.
    if (filtered.length === 0) return muscleFallback();

    // Overlay the user's modifications for display consistency (name/edits).
    // NOTE: the embedding was built from base fields, so this only affects
    // display — it does not change what matched in vector space.
    return userId ? this.applyModifications(filtered, userId) : filtered;
  }

  /**
   * Server-side fuzzy search via Atlas $search. Ranks by relevance (fuzzy on
   * name + muscle/equipment matching), then applies visibility + facet filters
   * BEFORE pagination so `total`/`pages` reflect the filtered set (not a
   * post-filtered top-N slice). Throws if the Atlas Search index is absent /
   * not READY — the controller catches this and falls back to in-memory search.
   *
   * Known limitation (documented, per plan): $search matches the STORED
   * document, so a common exercise a user renamed via UserExerciseModification
   * won't match by its overlaid name. Modifications are overlaid on results for
   * display only. This edge case is intentionally not unioned back in.
   *
   * @returns {{ exercises: Array, total: Number }}
   */
  static async searchExercises({ userId, search, muscle, discipline, equipment, difficulty, page = 1, limit = 50 }) {
    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    // Visibility + facets, applied as a $match after $search (pre-pagination).
    const match = {
      $or: userObjectId
        ? [{ isCommon: true }, { createdBy: userObjectId }]
        : [{ isCommon: true }]
    };
    const and = [];
    if (muscle) {
      const muscles = muscle.split(',');
      and.push({ $or: [{ muscles: { $in: muscles } }, { secondaryMuscles: { $in: muscles } }] });
    }
    if (discipline) {
      match.discipline = { $in: discipline.split(',') };
    }
    if (difficulty) {
      match.difficulty = difficulty;
    }
    if (equipment) {
      const equipmentList = equipment.split(',');
      if (equipmentList.includes('none')) {
        and.push({ $or: [{ equipment: { $exists: false } }, { equipment: { $size: 0 } }] });
      } else {
        match.equipment = { $in: equipmentList };
      }
    }
    if (and.length) match.$and = and;

    const skip = (page - 1) * limit;

    const [agg] = await Exercise.aggregate([
      {
        $search: {
          index: 'exercise_search_index',
          compound: {
            should: [
              // Prefix/typeahead on name, boosted highest.
              { autocomplete: { query: search, path: 'name', fuzzy: { maxEdits: 2 }, score: { boost: { value: 3 } } } },
              // Full-token fuzzy on name.
              { text: { query: search, path: 'name', fuzzy: { maxEdits: 2 }, score: { boost: { value: 2 } } } },
              // Match by muscle / equipment so "chest" or "barbell" find things.
              { text: { query: search, path: ['muscles', 'secondaryMuscles', 'equipment'], fuzzy: { maxEdits: 1 } } },
              // Description match (the old in-memory path searched description too).
              { text: { query: search, path: 'description', fuzzy: { maxEdits: 1 } } }
            ],
            minimumShouldMatch: 1
          }
        }
      },
      { $match: match },
      {
        $facet: {
          results: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                name: 1, description: 1, muscles: 1, secondaryMuscles: 1,
                discipline: 1, equipment: 1, difficulty: 1, instructions: 1,
                strain: 1, mediaUrls: 1, isCommon: 1, createdBy: 1,
                score: { $meta: 'searchScore' }
              }
            }
          ],
          totalCount: [{ $count: 'count' }]
        }
      }
    ]);

    const raw = agg?.results || [];
    const total = agg?.totalCount?.[0]?.count || 0;
    const exercises = userId ? await this.applyModifications(raw, userId) : raw;

    return { exercises, total };
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