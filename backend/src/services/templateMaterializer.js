const CalendarEvent = require('../models/CalendarEvent');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const Exercise = require('../models/Exercise');
const Plan = require('../models/Plan');
const { flattenTemplateExercises } = require('../utils/volume');

// Month-anchored (mirrors ai-coach-service's dedup.py): only real scheduling
// date suffixes are stripped, not parentheticals like "(Set 5)".
const DATE_SUFFIX_RE = /\s*\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\)\s*$/;

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

// Identity of a workout's exercise content: the ordered prescription
// (normalized name, sets, reps). Mirrors ai-coach-service's
// exercise_content_signature — matching this means "the same session".
const normalizeExerciseName = (name) => (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
const contentSignature = (exercises) =>
  exercises
    .map((ex) => `${normalizeExerciseName(ex.exerciseName)}|${ex.targetSets ?? 3}|${ex.targetReps ?? 10}`)
    .join(';');
const normalizeTemplateName = (name) =>
  (name || '')
    .replace(DATE_SUFFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Reuse-first: an existing library workout (the user's own or a common one)
// whose exercise content exactly matches must be LINKED, never re-created.
// Name is only a tie-breaker among content matches (then common over private,
// then oldest) — same-named but adjusted content still gets its own template.
const findMatchingTemplate = async (userId, name, blockExercises) => {
  const signature = contentSignature(
    blockExercises.map((ex) => {
      const [sets, reps] = (ex.volume || '').split(/[xX]/).map((n) => parseInt(n, 10));
      return { exerciseName: ex.exercise_name, targetSets: sets || 3, targetReps: reps || 10 };
    })
  );
  if (!signature) return null;

  const candidates = await PredefinedWorkout.find({
    $or: [{ isCommon: true }, { createdBy: userId }]
  })
    .select('name blocks isCommon')
    .lean();

  const wantedName = normalizeTemplateName(name);
  const matches = candidates.filter(
    (t) => contentSignature(flattenTemplateExercises(t)) === signature
  );
  if (!matches.length) return null;

  matches.sort((a, b) =>
    (normalizeTemplateName(a.name) !== wantedName) - (normalizeTemplateName(b.name) !== wantedName) ||
    !a.isCommon - !b.isCommon ||
    String(a._id).localeCompare(String(b._id))
  );
  return matches[0];
};

// Create a user-owned template from a bare-exercises event payload and
// return its id, or null when there is nothing to materialize. Identical
// content reuses an existing library workout instead of minting a copy.
const ensureTemplateForCustomEvent = async (userId, eventData) => {
  const exercises = eventData.workoutDetails?.exercises;
  if (!exercises?.length) return null;

  const name = (eventData.title || 'Workout')
    .replace(DATE_SUFFIX_RE, '')
    .trim() || 'Workout';

  const blocks = await buildBlocks(userId, exercises);
  if (!blocks[0].exercises.length) return null;

  const existing = await findMatchingTemplate(userId, name, blocks[0].exercises);
  if (existing) return existing._id;

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
// user didn't ask to change: the common library, another user's workout,
// other calendar events still pointing at it, or a training plan that
// schedules it.
const isTemplateShared = async (userId, template, excludeEventId) => {
  if (template.isCommon) return true;
  if (template.createdBy && String(template.createdBy) !== String(userId)) return true;
  const otherRefs = await CalendarEvent.countDocuments({
    workoutTemplateId: template._id,
    _id: { $ne: excludeEventId },
    status: { $nin: ['cancelled'] }
  });
  if (otherRefs > 0) return true;
  const planRefs = await Plan.countDocuments({
    'weeks.workouts.predefinedWorkoutId': template._id
  });
  return planRefs > 0;
};

// Only templates minted as disposable per-event copies (by this materializer
// or the AI coach's scheduler) may be edited in place. A curated library
// workout that reuse-first linked to a single event must never be silently
// rewritten by a one-session edit — clone instead.
const MATERIALIZED_TAGS = ['user-created', 'ai-generated'];
const isMaterializedCopy = (template) =>
  (template.tags || []).some((t) => MATERIALIZED_TAGS.includes(t));

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

  if (!isMaterializedCopy(template) || await isTemplateShared(userId, template, event._id)) {
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

module.exports = {
  ensureTemplateForCustomEvent,
  applyExercisesCopyOnWrite,
  findMatchingTemplate,
  contentSignature,
  normalizeTemplateName
};
