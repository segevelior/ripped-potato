const CalendarEvent = require('../models/CalendarEvent');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const Exercise = require('../models/Exercise');

// Calendar events only reference workouts — they never carry their own
// exercise list. Clients that still send bare exercises (chat ActionButtons,
// custom WorkoutModal builds, legacy API callers) get a real library template
// materialized here so the event can link it.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resolve an exercise name to an id the user can see (commons + their own);
// create a minimal user-owned exercise when nothing matches. Unlike the
// nightly consistency job we cannot skip unresolved names — the embedded
// copy on the event is gone, so the template is the only record.
const resolveOrCreateExercise = async (userId, exerciseName) => {
  const match = await Exercise.findOne({
    name: new RegExp(`^${escapeRegex(exerciseName)}$`, 'i'),
    $or: [{ isCommon: true }, { createdBy: userId }]
  })
    .select('_id')
    .lean();
  if (match) return match._id;

  const created = await Exercise.create({
    name: exerciseName,
    muscles: ['full body'],
    discipline: ['strength'],
    isCommon: false,
    createdBy: userId
  });
  return created._id;
};

const buildBlocks = async (userId, exercises) => {
  const blockExercises = [];
  for (const ex of exercises) {
    if (!ex.exerciseName) continue;
    const exerciseId = ex.exerciseId || (await resolveOrCreateExercise(userId, ex.exerciseName));
    blockExercises.push({
      exercise_id: exerciseId,
      exercise_name: ex.exerciseName,
      volume: `${ex.targetSets || 3}x${ex.targetReps || 10}`,
      rest: '60s',
      notes: ex.notes || ''
    });
  }
  return [{ name: 'Main Workout', exercises: blockExercises }];
};

// Create a user-owned template from a bare-exercises event payload and
// return its id, or null when there is nothing to materialize.
const ensureTemplateForCustomEvent = async (userId, eventData) => {
  const exercises = eventData.workoutDetails?.exercises;
  if (!exercises?.length) return null;

  const name = (eventData.title || 'Workout')
    .replace(/\s*\([A-Z][a-z]{2} \d{1,2}\)\s*$/, '')
    .trim() || 'Workout';

  const blocks = await buildBlocks(userId, exercises);
  if (!blocks[0].exercises.length) return null;

  const template = await PredefinedWorkout.create({
    name,
    goal: '',
    primary_disciplines: [eventData.workoutDetails?.type || 'strength'],
    estimated_duration: eventData.workoutDetails?.estimatedDuration || 45,
    difficulty_level: 'intermediate',
    blocks,
    tags: ['user-created'],
    isCommon: false,
    createdBy: userId
  });
  return template._id;
};

// A template is shared when editing it in place would change something the
// user didn't ask to change: the common library, another user's workout, or
// other calendar events still pointing at it.
const isTemplateShared = async (userId, template, excludeEventId) => {
  if (template.isCommon) return true;
  if (template.createdBy && String(template.createdBy) !== String(userId)) return true;
  const otherRefs = await CalendarEvent.countDocuments({
    workoutTemplateId: template._id,
    _id: { $ne: excludeEventId },
    status: { $nin: ['cancelled'] }
  });
  return otherRefs > 0;
};

// Copy-on-write for per-event exercise edits: shared template → clone with
// the new exercises and relink the event; exclusively-owned template → edit
// its blocks in place. Returns the template id the event should reference.
const applyExercisesCopyOnWrite = async (userId, event, exercises) => {
  const blocks = await buildBlocks(userId, exercises);
  if (!blocks[0].exercises.length) return event.workoutTemplateId || null;

  const template = event.workoutTemplateId
    ? await PredefinedWorkout.findById(event.workoutTemplateId)
    : null;

  if (!template) {
    return ensureTemplateForCustomEvent(userId, {
      title: event.title,
      workoutDetails: { ...(event.workoutDetails || {}), exercises }
    });
  }

  if (await isTemplateShared(userId, template, event._id)) {
    const clone = await PredefinedWorkout.create({
      name: template.name,
      goal: template.goal || '',
      primary_disciplines: template.primary_disciplines,
      estimated_duration: template.estimated_duration,
      difficulty_level: template.difficulty_level,
      blocks,
      tags: [...new Set([...(template.tags || []), 'ai-generated', 'customized'])],
      isCommon: false,
      createdBy: userId
    });
    return clone._id;
  }

  template.blocks = blocks;
  await template.save();
  return template._id;
};

module.exports = { ensureTemplateForCustomEvent, applyExercisesCopyOnWrite };
