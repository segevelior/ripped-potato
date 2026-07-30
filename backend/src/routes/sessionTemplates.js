const express = require('express');
const SessionTemplate = require('../models/SessionTemplate');
const CalendarEvent = require('../models/CalendarEvent');
const SessionService = require('../services/SessionService');
const { resolveInterestDisciplines, isHiddenSportTemplate } = require('../services/interestDisciplines');
const { auth, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/v1/session-templates - Get all session templates with filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      difficulty,
      tags,
      popular,
      allSports,
      limit = 20,
      page = 1
    } = req.query;

    let workouts;

    if (req.user) {
      // Get workouts with user modifications applied
      workouts = await SessionService.getSessionsForUser(req.user.id);
    } else {
      // Non-authenticated users only see common workouts
      workouts = await SessionTemplate.find({ isCommon: true })
        .populate('createdBy', 'name')
        .lean();
    }

    // Apply filters
    let filteredWorkouts = workouts;

    // Interest-based visibility: once a user has EXPRESSED interests
    // (non-empty sportPreferences), common templates whose disciplines are
    // all sport-specific (running/cycling/climbing/swimming) are hidden
    // unless one of their sports matches, they have a modification doc for
    // the template (favorite/completion/rename — any engagement), or they
    // asked for everything via ?allSports=true. Any failure skips the filter
    // entirely — never blank the catalog over it.
    //
    // Deliberate scope choices:
    // - EMPTY sportPreferences (and anonymous users) see EVERYTHING: no
    //   signal means "hasn't told us yet", not "not interested" — otherwise
    //   sport commons would launch invisible to everyone who never opened
    //   the interests picker.
    // - GET /search/:term is NOT filtered — searching by name is an explicit
    //   act, so it doubles as an escape hatch (and has no auth context).
    if (allSports !== 'true') {
      try {
        const prefs = req.user?.profile?.sportPreferences || [];
        if (prefs.length > 0) {
          const userDisciplines = await resolveInterestDisciplines(prefs);
          filteredWorkouts = filteredWorkouts.filter(
            (w) => !isHiddenSportTemplate(w, userDisciplines)
          );
        }
      } catch (error) {
        console.error('[sessionTemplates] Interest filter failed, showing all:', error.message);
      }
    }

    if (difficulty) {
      filteredWorkouts = filteredWorkouts.filter(w => w.difficulty_level === difficulty);
    }
    if (tags) {
      const tagList = tags.split(',');
      filteredWorkouts = filteredWorkouts.filter(w =>
        w.tags && w.tags.some(t => tagList.includes(t))
      );
    }

    // Sort workouts
    filteredWorkouts.sort((a, b) => {
      // Favorites first if user is authenticated
      if (req.user) {
        const aFav = a.userMetadata?.isFavorite || false;
        const bFav = b.userMetadata?.isFavorite || false;
        if (aFav !== bFav) return bFav - aFav;
      }
      // Then by popularity and ratings
      if (popular === 'true') {
        if (a.popularity !== b.popularity) return b.popularity - a.popularity;
        if (a.ratings?.average !== b.ratings?.average) {
          return (b.ratings?.average || 0) - (a.ratings?.average || 0);
        }
      }
      // Default to newest first
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Apply pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedWorkouts = filteredWorkouts.slice(skip, skip + parseInt(limit));

    // Add 'id' field for frontend compatibility
    const workoutsWithId = paginatedWorkouts.map(w => ({
      ...w,
      id: w._id
    }));

    res.json(workoutsWithId);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/session-templates/search/:term - Search session templates
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { limit = 10 } = req.query;

    const workouts = await SessionTemplate.search(term)
      .populate('createdBy', 'name')
      .populate('blocks.exercises.exercise_id', 'name muscles')
      .limit(parseInt(limit));

    res.json(workouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/session-templates/:id - Get specific session template
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    let workout;

    if (req.user) {
      // Get workout with modifications for authenticated user
      workout = await SessionService.getSessionForUser(req.params.id, req.user.id);
    } else {
      // Non-authenticated users can only see common workouts
      workout = await SessionTemplate.findOne({
        _id: req.params.id,
        isCommon: true
      })
        .populate('createdBy', 'name profile')
        .lean();

      // Populate exercise details
      if (workout && workout.blocks) {
        const Exercise = require('../models/Exercise');
        for (let block of workout.blocks) {
          for (let ex of block.exercises) {
            const exerciseDetails = await Exercise.findById(ex.exercise_id);
            if (exerciseDetails) {
              ex.exercise = exerciseDetails;
              ex.exercise_name = exerciseDetails.name;
            }
          }
        }
      }
    }

    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    // Add 'id' field
    workout.id = workout._id;
    res.json(workout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/session-templates - Create new session template (authenticated)
router.post('/', auth, async (req, res) => {
  try {
    const workoutData = {
      ...req.body,
      createdBy: req.user.id,
      isCommon: false // User-created workouts are private by default
    };

    // Only superAdmin can create common workouts
    if (req.user.role === 'superAdmin' && req.body.isCommon === true) {
      workoutData.isCommon = true;
      workoutData.createdBy = null; // Common workouts don't have a specific creator
    }

    const workout = new SessionTemplate(workoutData);
    await workout.save();

    await workout.populate('createdBy', 'name');

    // Add 'id' field
    const workoutObj = workout.toObject();
    workoutObj.id = workoutObj._id;

    res.status(201).json(workoutObj);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/session-templates/:id - Update session template (authenticated)
router.put('/:id', auth, async (req, res) => {
  try {
    const workout = await SessionTemplate.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    // SuperAdmin can edit any workout, including common ones
    if (req.user.role === 'superAdmin') {
      Object.assign(workout, req.body);
      await workout.save();

      await workout.populate('createdBy', 'name');
      await workout.populate('blocks.exercises.exercise_id', 'name muscles equipment');

      return res.json(workout);
    }

    // Check if user can edit this workout directly
    if (workout.canUserEdit(req.user.id)) {
      // User owns this workout - update directly
      Object.assign(workout, req.body);
      await workout.save();

      await workout.populate('createdBy', 'name');
      await workout.populate('blocks.exercises.exercise_id', 'name muscles equipment');

      res.json(workout);
    } else if (workout.isCommon || workout.createdBy?.toString() !== req.user.id) {
      // This is a common workout or another user's workout
      // Should use modification endpoint instead
      return res.status(403).json({
        error: 'Cannot edit this workout directly. Use modifications endpoint for common workouts.'
      });
    }
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/session-templates/:id - Delete session template (authenticated)
router.delete('/:id', auth, async (req, res) => {
  try {
    const workout = await SessionTemplate.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    // Calendar events reference workouts instead of embedding exercises, so
    // deleting a workout that upcoming events link to would empty those
    // sessions. Completed/skipped history may dangle (readers null-guard).
    const upcomingRefs = await CalendarEvent.countDocuments({
      sessionTemplateId: workout._id,
      status: { $in: ['scheduled', 'in_progress'] }
    });
    const forceDelete = req.user.role === 'superAdmin' && req.query.force === 'true';
    if (upcomingRefs > 0 && !forceDelete) {
      return res.status(409).json({
        error: `This workout is scheduled on the calendar (${upcomingRefs} upcoming event(s)). ` +
          'Delete or reschedule those events first.'
      });
    }

    // SuperAdmin can delete any workout, including common ones
    if (req.user.role === 'superAdmin') {
      if (upcomingRefs > 0) {
        await CalendarEvent.updateMany(
          { sessionTemplateId: workout._id, status: { $in: ['scheduled', 'in_progress'] } },
          { $unset: { sessionTemplateId: 1 } }
        );
      }
      await workout.deleteOne();
      return res.json({ message: 'Session template deleted successfully' });
    }

    // Regular users can only delete their own private workouts
    if (!workout.canUserEdit(req.user.id)) {
      return res.status(403).json({
        error: 'You can only delete your own workouts'
      });
    }

    // Prevent regular users from deleting common workouts
    if (workout.isCommon) {
      return res.status(403).json({
        error: 'Only superAdmin can delete common workouts'
      });
    }

    await workout.deleteOne();
    res.json({ message: 'Session template deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/session-templates/:id/rate - Rate a session template (authenticated)
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const workout = await SessionTemplate.findById(req.params.id);

    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    // Use the model method to add rating
    await workout.addRating(rating);

    res.json({
      message: 'Rating submitted successfully',
      averageRating: workout.ratings.average,
      totalRatings: workout.ratings.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Clone-on-modify machinery, shared by swap-exercise and remove-exercise ---
// A common template can't be edited in place: it's forked into a private copy,
// the user's field-override modification row is baked in and moved, and their
// live references (upcoming calendar events, active plan weeks) relink to the
// clone. Completed/skipped history intentionally keeps pointing at the
// original.

async function buildUserClone(workout, userId) {
  const cloneData = workout.toObject();
  delete cloneData._id;
  delete cloneData.createdAt;
  delete cloneData.updatedAt;
  delete cloneData.__v;
  cloneData.createdBy = userId;
  cloneData.isCommon = false;
  cloneData.popularity = 0;
  cloneData.ratings = { average: 0, count: 0 };

  // The user's modification overlay (custom title/description/duration +
  // favorite/PR metadata) is applied on every read — bake the field
  // overrides into the clone and move the row so the metadata follows.
  const UserSessionModification = require('../models/UserSessionModification');
  const modification = await UserSessionModification.findOne({
    userId,
    sessionTemplateId: workout._id
  });
  if (modification?.modifications) {
    if (modification.modifications.title) cloneData.name = modification.modifications.title;
    if (modification.modifications.description) cloneData.goal = modification.modifications.description;
    if (modification.modifications.durationMinutes) {
      cloneData.estimated_duration = modification.modifications.durationMinutes;
    }
  }
  return { cloneData, modification };
}

async function relinkUserReferences(workout, clone, modification, userId) {
  if (modification) {
    modification.sessionTemplateId = clone._id;
    // Field overrides are baked into the clone now; keeping them on the row
    // would double-apply if the user later edits the clone directly.
    if (modification.modifications) {
      modification.modifications.title = undefined;
      modification.modifications.description = undefined;
      modification.modifications.durationMinutes = undefined;
      modification.markModified('modifications');
    }
    await modification.save();
  }

  // Move the user's live references to the fork so "for good" holds for
  // already-scheduled sessions and plan-driven scheduling.
  await CalendarEvent.updateMany(
    {
      userId,
      sessionTemplateId: workout._id,
      status: { $in: ['scheduled', 'in_progress'] }
    },
    { $set: { sessionTemplateId: clone._id } }
  );

  const Plan = require('../models/Plan');
  await Plan.updateMany(
    { userId, 'weeks.sessions.sessionTemplateId': workout._id },
    { $set: { 'weeks.$[].sessions.$[s].sessionTemplateId': clone._id } },
    { arrayFilters: [{ 's.sessionTemplateId': workout._id }] }
  );
}

// POST /api/v1/session-templates/:id/swap-exercise - Replace an exercise in the
// template "for good". Own template: edited in place. Common template:
// clone-on-modify (see above).
router.post('/:id/swap-exercise', auth, async (req, res) => {
  try {
    const { fromExerciseId, toExerciseId } = req.body;
    if (!fromExerciseId || !toExerciseId) {
      return res.status(400).json({ error: 'fromExerciseId and toExerciseId are required' });
    }

    const workout = await SessionTemplate.findById(req.params.id);
    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    if (!workout.canUserEdit(req.user.id) && !workout.isCommon) {
      return res.status(403).json({ error: 'You can only modify your own workouts' });
    }

    const Exercise = require('../models/Exercise');
    const replacement = await Exercise.findOne({
      _id: toExerciseId,
      $or: [{ isCommon: true }, { createdBy: req.user.id }]
    }).select('_id name');
    if (!replacement) {
      return res.status(400).json({ error: 'Replacement exercise not found' });
    }

    // The same movement may appear in several blocks (e.g. warm-up + main
    // work); a "for good" swap means all of them.
    const applySwap = (doc) => {
      let replacedCount = 0;
      for (const block of doc.blocks || []) {
        for (const ex of block.exercises || []) {
          if (ex.exercise_id?.toString() === fromExerciseId.toString()) {
            ex.exercise_id = replacement._id;
            ex.exercise_name = replacement.name;
            replacedCount += 1;
          }
        }
      }
      return replacedCount;
    };

    if (workout.canUserEdit(req.user.id)) {
      const replacedCount = applySwap(workout);
      if (replacedCount === 0) {
        return res.status(400).json({ error: 'Exercise not found in this workout' });
      }
      await workout.save();
      const workoutObj = workout.toObject();
      workoutObj.id = workoutObj._id;
      return res.json({ workout: workoutObj, cloned: false, replacedCount });
    }

    // Common template: clone-on-modify.
    const { cloneData, modification } = await buildUserClone(workout, req.user.id);
    const clone = new SessionTemplate(cloneData);
    const replacedCount = applySwap(clone);
    if (replacedCount === 0) {
      return res.status(400).json({ error: 'Exercise not found in this workout' });
    }
    await clone.save();
    await relinkUserReferences(workout, clone, modification, req.user.id);

    const cloneObj = clone.toObject();
    cloneObj.id = cloneObj._id;
    return res.json({ workout: cloneObj, cloned: true, replacedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/session-templates/:id/remove-exercise - Delete an exercise from
// the template "for good" (all occurrences). Own template: edited in place.
// Common template: clone-on-modify. Refuses to leave the workout empty.
router.post('/:id/remove-exercise', auth, async (req, res) => {
  try {
    const { exerciseId } = req.body;
    if (!exerciseId) {
      return res.status(400).json({ error: 'exerciseId is required' });
    }

    const workout = await SessionTemplate.findById(req.params.id);
    if (!workout) {
      return res.status(404).json({ error: 'Session template not found' });
    }

    if (!workout.canUserEdit(req.user.id) && !workout.isCommon) {
      return res.status(403).json({ error: 'You can only modify your own workouts' });
    }

    // Remove every occurrence; drop any block the removal leaves empty.
    const applyRemove = (doc) => {
      let removedCount = 0;
      for (const block of doc.blocks || []) {
        const before = (block.exercises || []).length;
        block.exercises = (block.exercises || []).filter(
          ex => ex.exercise_id?.toString() !== exerciseId.toString()
        );
        removedCount += before - block.exercises.length;
      }
      doc.blocks = (doc.blocks || []).filter(b => (b.exercises || []).length > 0);
      return removedCount;
    };

    const wouldEmpty = (doc) => (doc.blocks || []).length === 0;

    if (workout.canUserEdit(req.user.id)) {
      const removedCount = applyRemove(workout);
      if (removedCount === 0) {
        return res.status(400).json({ error: 'Exercise not found in this workout' });
      }
      if (wouldEmpty(workout)) {
        return res.status(400).json({ error: 'Removing this would leave the workout empty' });
      }
      await workout.save();
      const workoutObj = workout.toObject();
      workoutObj.id = workoutObj._id;
      return res.json({ workout: workoutObj, cloned: false, removedCount });
    }

    // Common template: clone-on-modify.
    const { cloneData, modification } = await buildUserClone(workout, req.user.id);
    const clone = new SessionTemplate(cloneData);
    const removedCount = applyRemove(clone);
    if (removedCount === 0) {
      return res.status(400).json({ error: 'Exercise not found in this workout' });
    }
    if (wouldEmpty(clone)) {
      return res.status(400).json({ error: 'Removing this would leave the workout empty' });
    }
    await clone.save();
    await relinkUserReferences(workout, clone, modification, req.user.id);

    const cloneObj = clone.toObject();
    cloneObj.id = cloneObj._id;
    return res.json({ workout: cloneObj, cloned: true, removedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modification endpoints

// PUT /api/v1/session-templates/:id/modifications - Create or update workout modification
router.put('/:id/modifications', auth, async (req, res) => {
  try {
    const { modifications, metadata } = req.body;

    const modification = await SessionService.saveModification(
      req.user.id,
      req.params.id,
      modifications,
      metadata
    );

    // Return the workout with modifications applied
    const workout = await SessionService.getSessionForUser(req.params.id, req.user.id);

    res.json(workout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/v1/session-templates/:id/modifications - Remove workout modification (revert to original)
router.delete('/:id/modifications', auth, async (req, res) => {
  try {
    await SessionService.removeModification(req.user.id, req.params.id);

    // Return the original workout
    const workout = await SessionService.getSessionForUser(req.params.id, req.user.id);

    res.json(workout);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/v1/session-templates/:id/favorite - Toggle favorite status
router.put('/:id/favorite', auth, async (req, res) => {
  try {
    const { isFavorite } = req.body;

    await SessionService.toggleFavorite(req.user.id, req.params.id, isFavorite);

    res.json({ success: true, isFavorite });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/v1/session-templates/:id/complete - Record workout completion
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const { totalWeight, completionTime } = req.body;

    const modification = await SessionService.recordCompletion(
      req.user.id,
      req.params.id,
      { totalWeight, completionTime }
    );

    res.json({
      success: true,
      timesCompleted: modification.metadata.timesCompleted,
      personalRecord: modification.metadata.personalRecord
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;