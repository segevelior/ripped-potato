const mongoose = require('mongoose');
const CalendarEvent = require('../models/CalendarEvent');
const WorkoutLog = require('../models/WorkoutLog');
const ExternalActivity = require('../models/ExternalActivity');
const Exercise = require('../models/Exercise');
const PredefinedWorkout = require('../models/PredefinedWorkout');
const StravaIntegrationService = require('../services/StravaIntegrationService');

/**
 * Calendar Consistency Job
 *
 * Ensures data consistency between CalendarEvent and its linked collections:
 * - WorkoutLog (from TrainNow)
 * - ExternalActivity (from Strava)
 * - PredefinedWorkout (workout library / Workouts tab)
 *
 * Tasks:
 * 1. Find WorkoutLogs without CalendarEvent and create them
 * 2. Find ExternalActivities without CalendarEvent and create them
 * 3. Find CalendarEvents with broken links (workoutLogId or externalActivityId pointing to non-existent docs) and delete them
 * 4. Find upcoming AI-scheduled workout events with no workoutTemplateId and back-link them to a (deduped) library template
 */

class CalendarConsistencyJob {
  constructor(logger = console) {
    this.logger = logger;
    this.stats = {
      workoutLogsProcessed: 0,
      workoutLogsFixed: 0,
      externalActivitiesProcessed: 0,
      externalActivitiesFixed: 0,
      orphanedCalendarEventsDeleted: 0,
      orphanWorkoutEventsLinked: 0,
      orphanTemplatesCreated: 0,
      orphanWorkoutEventsSkipped: 0,
      errors: []
    };
  }

  /**
   * Run the full consistency check
   */
  async run() {
    this.logger.info('[CalendarConsistencyJob] Starting consistency check...');
    const startTime = Date.now();

    try {
      // Reset stats
      this.stats = {
        workoutLogsProcessed: 0,
        workoutLogsFixed: 0,
        externalActivitiesProcessed: 0,
        externalActivitiesFixed: 0,
        orphanedCalendarEventsDeleted: 0,
        orphanWorkoutEventsLinked: 0,
        orphanTemplatesCreated: 0,
        orphanWorkoutEventsSkipped: 0,
        errors: []
      };

      // Run all consistency checks
      await this.syncWorkoutLogs();
      await this.syncExternalActivities();
      await this.cleanupOrphanedCalendarEvents();
      await this.linkOrphanWorkoutEvents();

      const duration = Date.now() - startTime;
      this.logger.info('[CalendarConsistencyJob] Consistency check completed', {
        duration: `${duration}ms`,
        stats: this.stats
      });

      return {
        success: true,
        duration,
        stats: this.stats
      };
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] Job failed', { error: error.message });
      this.stats.errors.push({ phase: 'general', error: error.message });
      return {
        success: false,
        error: error.message,
        stats: this.stats
      };
    }
  }

  /**
   * Find WorkoutLogs without CalendarEvent and create them
   */
  async syncWorkoutLogs() {
    this.logger.info('[CalendarConsistencyJob] Syncing WorkoutLogs...');

    try {
      // Find all WorkoutLogs that don't have a calendarEventId OR have one that doesn't exist
      const workoutLogs = await WorkoutLog.find({}).lean();

      for (const workoutLog of workoutLogs) {
        this.stats.workoutLogsProcessed++;

        try {
          // Check if this WorkoutLog has a valid CalendarEvent
          let needsCalendarEvent = false;

          if (!workoutLog.calendarEventId) {
            // No calendarEventId set
            needsCalendarEvent = true;
          } else {
            // Check if the CalendarEvent exists
            const existingEvent = await CalendarEvent.findById(workoutLog.calendarEventId);
            if (!existingEvent) {
              // CalendarEvent doesn't exist anymore
              needsCalendarEvent = true;
            }
          }

          // Also check if there's a CalendarEvent pointing to this WorkoutLog
          const linkedEvent = await CalendarEvent.findOne({ workoutLogId: workoutLog._id });

          if (!linkedEvent && needsCalendarEvent) {
            // Create CalendarEvent for this WorkoutLog
            const calendarEvent = await CalendarEvent.create({
              userId: workoutLog.userId,
              date: workoutLog.startedAt,
              title: workoutLog.title,
              type: 'workout',
              status: workoutLog.completedAt ? 'completed' : 'in_progress',
              workoutLogId: workoutLog._id,
              workoutDetails: {
                type: workoutLog.type,
                durationMinutes: workoutLog.actualDuration,
                exercises: workoutLog.exercises?.map(ex => ({
                  exerciseId: ex.exerciseId,
                  exerciseName: ex.exerciseName,
                  sets: ex.sets
                }))
              },
              completedAt: workoutLog.completedAt
            });

            // Update the WorkoutLog with the calendarEventId
            await WorkoutLog.findByIdAndUpdate(workoutLog._id, {
              calendarEventId: calendarEvent._id
            });

            this.stats.workoutLogsFixed++;
            this.logger.info(`[CalendarConsistencyJob] Created CalendarEvent for WorkoutLog ${workoutLog._id}`);
          } else if (linkedEvent && !workoutLog.calendarEventId) {
            // CalendarEvent exists but WorkoutLog doesn't reference it - fix the link
            await WorkoutLog.findByIdAndUpdate(workoutLog._id, {
              calendarEventId: linkedEvent._id
            });
            this.stats.workoutLogsFixed++;
            this.logger.info(`[CalendarConsistencyJob] Fixed WorkoutLog ${workoutLog._id} link to CalendarEvent ${linkedEvent._id}`);
          }
        } catch (error) {
          this.logger.error(`[CalendarConsistencyJob] Error processing WorkoutLog ${workoutLog._id}`, {
            error: error.message
          });
          this.stats.errors.push({
            phase: 'workoutLogs',
            workoutLogId: workoutLog._id.toString(),
            error: error.message
          });
        }
      }

      this.logger.info(`[CalendarConsistencyJob] WorkoutLogs sync complete: ${this.stats.workoutLogsFixed}/${this.stats.workoutLogsProcessed} fixed`);
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] WorkoutLogs sync failed', { error: error.message });
      this.stats.errors.push({ phase: 'workoutLogs', error: error.message });
    }
  }

  /**
   * Find ExternalActivities without CalendarEvent and create them
   */
  async syncExternalActivities() {
    this.logger.info('[CalendarConsistencyJob] Syncing ExternalActivities...');

    try {
      // Find all ExternalActivities
      const externalActivities = await ExternalActivity.find({}).lean();

      for (const activity of externalActivities) {
        this.stats.externalActivitiesProcessed++;

        try {
          // Check if there's already a CalendarEvent for this ExternalActivity
          const existingEvent = await CalendarEvent.findOne({
            externalActivityId: activity._id
          });

          if (!existingEvent) {
            // Create CalendarEvent using the Strava service method
            await StravaIntegrationService.syncCalendarEvent(activity, activity.userId);
            this.stats.externalActivitiesFixed++;
            this.logger.info(`[CalendarConsistencyJob] Created CalendarEvent for ExternalActivity ${activity._id}`);
          }
        } catch (error) {
          this.logger.error(`[CalendarConsistencyJob] Error processing ExternalActivity ${activity._id}`, {
            error: error.message
          });
          this.stats.errors.push({
            phase: 'externalActivities',
            externalActivityId: activity._id.toString(),
            error: error.message
          });
        }
      }

      this.logger.info(`[CalendarConsistencyJob] ExternalActivities sync complete: ${this.stats.externalActivitiesFixed}/${this.stats.externalActivitiesProcessed} fixed`);
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] ExternalActivities sync failed', { error: error.message });
      this.stats.errors.push({ phase: 'externalActivities', error: error.message });
    }
  }

  /**
   * Find CalendarEvents with broken links and delete them
   */
  async cleanupOrphanedCalendarEvents() {
    this.logger.info('[CalendarConsistencyJob] Cleaning up orphaned CalendarEvents...');

    try {
      // Find CalendarEvents that have workoutLogId but the WorkoutLog doesn't exist
      const eventsWithWorkoutLogId = await CalendarEvent.find({
        workoutLogId: { $exists: true, $ne: null }
      }).lean();

      for (const event of eventsWithWorkoutLogId) {
        const workoutLog = await WorkoutLog.findById(event.workoutLogId);
        if (!workoutLog) {
          await CalendarEvent.findByIdAndDelete(event._id);
          this.stats.orphanedCalendarEventsDeleted++;
          this.logger.info(`[CalendarConsistencyJob] Deleted orphaned CalendarEvent ${event._id} (WorkoutLog ${event.workoutLogId} not found)`);
        }
      }

      // Find CalendarEvents that have externalActivityId but the ExternalActivity doesn't exist
      const eventsWithExternalActivityId = await CalendarEvent.find({
        externalActivityId: { $exists: true, $ne: null }
      }).lean();

      for (const event of eventsWithExternalActivityId) {
        const externalActivity = await ExternalActivity.findById(event.externalActivityId);
        if (!externalActivity) {
          await CalendarEvent.findByIdAndDelete(event._id);
          this.stats.orphanedCalendarEventsDeleted++;
          this.logger.info(`[CalendarConsistencyJob] Deleted orphaned CalendarEvent ${event._id} (ExternalActivity ${event.externalActivityId} not found)`);
        }
      }

      this.logger.info(`[CalendarConsistencyJob] Cleanup complete: ${this.stats.orphanedCalendarEventsDeleted} orphaned events deleted`);
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] Cleanup failed', { error: error.message });
      this.stats.errors.push({ phase: 'cleanup', error: error.message });
    }
  }

  /**
   * Find upcoming workout/deload CalendarEvents that have embedded exercises
   * but no workoutTemplateId (historically created by the AI coach), create a
   * backing PredefinedWorkout, and link them.
   *
   * Deduped: orphans are grouped by (user, title-minus-date-suffix, exercise
   * prescription) and each group shares ONE template — a plan's repeated
   * weekly session gets a single library entry, not one per event. Idempotent
   * by construction: linked events no longer match the query. Past/completed
   * orphans are left alone (they render from embedded details and add no
   * Workouts-tab value).
   */
  async linkOrphanWorkoutEvents(userId = null) {
    this.logger.info('[CalendarConsistencyJob] Linking orphan workout events...');

    try {
      // Start-of-day UTC: event dates are stored as midnight UTC, so plain
      // new Date() would exclude today's orphans.
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);

      const query = {
        type: { $in: ['workout', 'deload'] },
        $or: [{ workoutTemplateId: { $exists: false } }, { workoutTemplateId: null }],
        status: 'scheduled',
        date: { $gte: startOfTodayUtc },
        'workoutDetails.exercises.0': { $exists: true }
      };
      if (userId) query.userId = userId;

      const orphans = await CalendarEvent.find(query).lean();

      const groups = new Map();
      for (const event of orphans) {
        const title = (event.title || 'Workout')
          .replace(/\s*\([A-Z][a-z]{2} \d{1,2}\)\s*$/, '')
          .trim() || 'Workout';
        const signature = (event.workoutDetails.exercises || [])
          .map((ex) => `${ex.exerciseName}|${ex.targetSets || ''}|${ex.targetReps || ''}`)
          .join(';');
        const key = `${event.userId}::${title}::${signature}`;
        if (!groups.has(key)) groups.set(key, { title, events: [] });
        groups.get(key).events.push(event);
      }

      for (const { title, events } of groups.values()) {
        try {
          const sample = events[0];
          const sourceExercises = sample.workoutDetails.exercises || [];
          const blockExercises = [];
          for (const ex of sourceExercises) {
            let exerciseId = ex.exerciseId;
            if (!exerciseId && ex.exerciseName) {
              // blockExerciseSchema requires exercise_id — recover it by name,
              // scoped to exercises this user can see (commons + their own).
              const escaped = ex.exerciseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const match = await Exercise.findOne({
                name: new RegExp(`^${escaped}$`, 'i'),
                $or: [{ isCommon: true }, { createdBy: sample.userId }]
              })
                .select('_id')
                .lean();
              exerciseId = match?._id;
            }
            if (!exerciseId) continue;
            blockExercises.push({
              exercise_id: exerciseId,
              exercise_name: ex.exerciseName,
              volume: `${ex.targetSets || 3}x${ex.targetReps || 10}`,
              rest: '60s',
              notes: ex.notes || ''
            });
          }

          // All-or-nothing: a partially resolved template would show a
          // mangled version of the session in the Workouts tab — worse than
          // leaving the event unlinked.
          if (blockExercises.length !== sourceExercises.length) {
            this.stats.orphanWorkoutEventsSkipped += events.length;
            this.logger.info(
              `[CalendarConsistencyJob] Skipped ${events.length} orphan event(s) for "${title}": ` +
              `${sourceExercises.length - blockExercises.length}/${sourceExercises.length} exercises unresolved`
            );
            continue;
          }

          const template = await PredefinedWorkout.create({
            name: title,
            goal: '',
            primary_disciplines: [sample.workoutDetails.type || 'strength'],
            estimated_duration: sample.workoutDetails.estimatedDuration || 45,
            difficulty_level: 'intermediate',
            blocks: [{ name: 'Main Workout', exercises: blockExercises }],
            tags: ['ai-generated', 'backfill'],
            isCommon: false,
            createdBy: sample.userId
          });

          await CalendarEvent.updateMany(
            { _id: { $in: events.map((e) => e._id) } },
            { $set: { workoutTemplateId: template._id } }
          );

          this.stats.orphanTemplatesCreated++;
          this.stats.orphanWorkoutEventsLinked += events.length;
          this.logger.info(
            `[CalendarConsistencyJob] Linked ${events.length} orphan event(s) to new template "${title}" (${template._id})`
          );
        } catch (error) {
          this.stats.errors.push({
            phase: 'orphanWorkoutEvents',
            title,
            error: error.message
          });
        }
      }

      this.logger.info(
        `[CalendarConsistencyJob] Orphan link complete: ${this.stats.orphanWorkoutEventsLinked} linked via ${this.stats.orphanTemplatesCreated} template(s), ${this.stats.orphanWorkoutEventsSkipped} skipped`
      );
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] Orphan workout link failed', { error: error.message });
      this.stats.errors.push({ phase: 'orphanWorkoutEvents', error: error.message });
    }
  }

  /**
   * Run for a specific user only
   */
  async runForUser(userId) {
    this.logger.info(`[CalendarConsistencyJob] Running for user ${userId}...`);
    const startTime = Date.now();

    try {
      this.stats = {
        workoutLogsProcessed: 0,
        workoutLogsFixed: 0,
        externalActivitiesProcessed: 0,
        externalActivitiesFixed: 0,
        orphanedCalendarEventsDeleted: 0,
        orphanWorkoutEventsLinked: 0,
        orphanTemplatesCreated: 0,
        orphanWorkoutEventsSkipped: 0,
        errors: []
      };

      await this.syncWorkoutLogsForUser(userId);
      await this.syncExternalActivitiesForUser(userId);
      await this.cleanupOrphanedCalendarEventsForUser(userId);
      await this.linkOrphanWorkoutEvents(userId);

      const duration = Date.now() - startTime;
      this.logger.info(`[CalendarConsistencyJob] User ${userId} consistency check completed`, {
        duration: `${duration}ms`,
        stats: this.stats
      });

      return {
        success: true,
        duration,
        stats: this.stats
      };
    } catch (error) {
      this.logger.error(`[CalendarConsistencyJob] User ${userId} job failed`, { error: error.message });
      return {
        success: false,
        error: error.message,
        stats: this.stats
      };
    }
  }

  async syncWorkoutLogsForUser(userId) {
    const workoutLogs = await WorkoutLog.find({ userId }).lean();

    for (const workoutLog of workoutLogs) {
      this.stats.workoutLogsProcessed++;

      try {
        let needsCalendarEvent = false;

        if (!workoutLog.calendarEventId) {
          needsCalendarEvent = true;
        } else {
          const existingEvent = await CalendarEvent.findById(workoutLog.calendarEventId);
          if (!existingEvent) {
            needsCalendarEvent = true;
          }
        }

        const linkedEvent = await CalendarEvent.findOne({ workoutLogId: workoutLog._id });

        if (!linkedEvent && needsCalendarEvent) {
          const calendarEvent = await CalendarEvent.create({
            userId: workoutLog.userId,
            date: workoutLog.startedAt,
            title: workoutLog.title,
            type: 'workout',
            status: workoutLog.completedAt ? 'completed' : 'in_progress',
            workoutLogId: workoutLog._id,
            workoutDetails: {
              type: workoutLog.type,
              durationMinutes: workoutLog.actualDuration,
              exercises: workoutLog.exercises?.map(ex => ({
                exerciseId: ex.exerciseId,
                exerciseName: ex.exerciseName,
                sets: ex.sets
              }))
            },
            completedAt: workoutLog.completedAt
          });

          await WorkoutLog.findByIdAndUpdate(workoutLog._id, {
            calendarEventId: calendarEvent._id
          });

          this.stats.workoutLogsFixed++;
        } else if (linkedEvent && !workoutLog.calendarEventId) {
          await WorkoutLog.findByIdAndUpdate(workoutLog._id, {
            calendarEventId: linkedEvent._id
          });
          this.stats.workoutLogsFixed++;
        }
      } catch (error) {
        this.stats.errors.push({
          phase: 'workoutLogs',
          workoutLogId: workoutLog._id.toString(),
          error: error.message
        });
      }
    }
  }

  async syncExternalActivitiesForUser(userId) {
    const externalActivities = await ExternalActivity.find({ userId }).lean();

    for (const activity of externalActivities) {
      this.stats.externalActivitiesProcessed++;

      try {
        const existingEvent = await CalendarEvent.findOne({
          externalActivityId: activity._id
        });

        if (!existingEvent) {
          await StravaIntegrationService.syncCalendarEvent(activity, activity.userId);
          this.stats.externalActivitiesFixed++;
        }
      } catch (error) {
        this.stats.errors.push({
          phase: 'externalActivities',
          externalActivityId: activity._id.toString(),
          error: error.message
        });
      }
    }
  }

  async cleanupOrphanedCalendarEventsForUser(userId) {
    const eventsWithWorkoutLogId = await CalendarEvent.find({
      userId,
      workoutLogId: { $exists: true, $ne: null }
    }).lean();

    for (const event of eventsWithWorkoutLogId) {
      const workoutLog = await WorkoutLog.findById(event.workoutLogId);
      if (!workoutLog) {
        await CalendarEvent.findByIdAndDelete(event._id);
        this.stats.orphanedCalendarEventsDeleted++;
      }
    }

    const eventsWithExternalActivityId = await CalendarEvent.find({
      userId,
      externalActivityId: { $exists: true, $ne: null }
    }).lean();

    for (const event of eventsWithExternalActivityId) {
      const externalActivity = await ExternalActivity.findById(event.externalActivityId);
      if (!externalActivity) {
        await CalendarEvent.findByIdAndDelete(event._id);
        this.stats.orphanedCalendarEventsDeleted++;
      }
    }
  }
}

module.exports = CalendarConsistencyJob;
