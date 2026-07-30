const mongoose = require('mongoose');
const CalendarEvent = require('../models/CalendarEvent');
const SessionLog = require('../models/SessionLog');
const ExternalActivity = require('../models/ExternalActivity');
const Exercise = require('../models/Exercise');
const SessionTemplate = require('../models/SessionTemplate');
const StravaIntegrationService = require('../services/StravaIntegrationService');
const ActivityMatchingService = require('../services/activityMatchingService');

/**
 * Calendar Consistency Job
 *
 * Ensures data consistency between CalendarEvent and its linked collections:
 * - SessionLog (from TrainNow)
 * - ExternalActivity (from Strava)
 * - SessionTemplate (session template library / Sessions tab)
 *
 * Tasks:
 * 1. Find SessionLogs without CalendarEvent and create them
 * 2. Find ExternalActivities without CalendarEvent and create them
 * 3. Find CalendarEvents with broken links (sessionLogId or externalActivityId pointing to non-existent docs) and delete them
 * 4. Find upcoming AI-scheduled session events with no sessionTemplateId and back-link them to a (deduped) library template
 */

class CalendarConsistencyJob {
  constructor(logger = console) {
    this.logger = logger;
    this.stats = {
      sessionLogsProcessed: 0,
      sessionLogsFixed: 0,
      externalActivitiesProcessed: 0,
      externalActivitiesFixed: 0,
      orphanedCalendarEventsDeleted: 0,
      orphanSessionEventsLinked: 0,
      orphanTemplatesCreated: 0,
      orphanSessionEventsSkipped: 0,
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
        sessionLogsProcessed: 0,
        sessionLogsFixed: 0,
        externalActivitiesProcessed: 0,
        externalActivitiesFixed: 0,
        orphanedCalendarEventsDeleted: 0,
        orphanSessionEventsLinked: 0,
        orphanTemplatesCreated: 0,
        orphanSessionEventsSkipped: 0,
        errors: []
      };

      // Run all consistency checks
      await this.syncSessionLogs();
      await this.syncExternalActivities();
      await this.cleanupOrphanedCalendarEvents();
      await this.linkOrphanSessionEvents();

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
   * Find SessionLogs without CalendarEvent and create them
   */
  async syncSessionLogs() {
    this.logger.info('[CalendarConsistencyJob] Syncing SessionLogs...');

    try {
      // Find all SessionLogs that don't have a calendarEventId OR have one that doesn't exist
      const sessionLogs = await SessionLog.find({}).lean();

      for (const sessionLog of sessionLogs) {
        this.stats.sessionLogsProcessed++;

        try {
          // Check if this SessionLog has a valid CalendarEvent
          let needsCalendarEvent = false;

          if (!sessionLog.calendarEventId) {
            // No calendarEventId set
            needsCalendarEvent = true;
          } else {
            // Check if the CalendarEvent exists
            const existingEvent = await CalendarEvent.findById(sessionLog.calendarEventId);
            if (!existingEvent) {
              // CalendarEvent doesn't exist anymore
              needsCalendarEvent = true;
            }
          }

          // Also check if there's a CalendarEvent pointing to this SessionLog
          const linkedEvent = await CalendarEvent.findOne({ sessionLogId: sessionLog._id });

          if (!linkedEvent && needsCalendarEvent) {
            // Create CalendarEvent for this SessionLog
            const calendarEvent = await CalendarEvent.create({
              userId: sessionLog.userId,
              date: sessionLog.startedAt,
              title: sessionLog.title,
              type: 'session',
              status: sessionLog.completedAt ? 'completed' : 'in_progress',
              sessionLogId: sessionLog._id,
              sessionDetails: {
                discipline: sessionLog.discipline,
                durationMinutes: sessionLog.actualDuration,
                exercises: sessionLog.exercises?.map(ex => ({
                  exerciseId: ex.exerciseId,
                  exerciseName: ex.exerciseName,
                  sets: ex.sets
                }))
              },
              completedAt: sessionLog.completedAt
            });

            // Update the SessionLog with the calendarEventId
            await SessionLog.findByIdAndUpdate(sessionLog._id, {
              calendarEventId: calendarEvent._id
            });

            this.stats.sessionLogsFixed++;
            this.logger.info(`[CalendarConsistencyJob] Created CalendarEvent for SessionLog ${sessionLog._id}`);
          } else if (linkedEvent && !sessionLog.calendarEventId) {
            // CalendarEvent exists but SessionLog doesn't reference it - fix the link
            await SessionLog.findByIdAndUpdate(sessionLog._id, {
              calendarEventId: linkedEvent._id
            });
            this.stats.sessionLogsFixed++;
            this.logger.info(`[CalendarConsistencyJob] Fixed SessionLog ${sessionLog._id} link to CalendarEvent ${linkedEvent._id}`);
          }
        } catch (error) {
          this.logger.error(`[CalendarConsistencyJob] Error processing SessionLog ${sessionLog._id}`, {
            error: error.message
          });
          this.stats.errors.push({
            phase: 'sessionLogs',
            sessionLogId: sessionLog._id.toString(),
            error: error.message
          });
        }
      }

      this.logger.info(`[CalendarConsistencyJob] SessionLogs sync complete: ${this.stats.sessionLogsFixed}/${this.stats.sessionLogsProcessed} fixed`);
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] SessionLogs sync failed', { error: error.message });
      this.stats.errors.push({ phase: 'sessionLogs', error: error.message });
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
      // Find CalendarEvents that have sessionLogId but the SessionLog doesn't exist
      const eventsWithSessionLogId = await CalendarEvent.find({
        sessionLogId: { $exists: true, $ne: null }
      }).lean();

      for (const event of eventsWithSessionLogId) {
        const sessionLog = await SessionLog.findById(event.sessionLogId);
        if (!sessionLog) {
          if (event.externalActivityId) {
            // Strava evidence remains — keep the event, drop the dead link
            await CalendarEvent.updateOne({ _id: event._id }, { $unset: { sessionLogId: 1 } });
            this.logger.info(`[CalendarConsistencyJob] Unset dead SessionLog link on CalendarEvent ${event._id} (has externalActivityId)`);
          } else {
            await CalendarEvent.findByIdAndDelete(event._id);
            this.stats.orphanedCalendarEventsDeleted++;
            this.logger.info(`[CalendarConsistencyJob] Deleted orphaned CalendarEvent ${event._id} (SessionLog ${event.sessionLogId} not found)`);
          }
        }
      }

      // Find CalendarEvents that have externalActivityId but the ExternalActivity doesn't exist
      const eventsWithExternalActivityId = await CalendarEvent.find({
        externalActivityId: { $exists: true, $ne: null }
      }).lean();

      for (const event of eventsWithExternalActivityId) {
        const externalActivity = await ExternalActivity.findById(event.externalActivityId);
        if (!externalActivity) {
          // Mirrors are deleted; merged planned events survive with the link severed
          await ActivityMatchingService.unlinkOrDeleteStravaEvent(event, event.userId);
          this.stats.orphanedCalendarEventsDeleted++;
          this.logger.info(`[CalendarConsistencyJob] Cleaned Strava-linked CalendarEvent ${event._id} (ExternalActivity ${event.externalActivityId} not found)`);
        }
      }

      this.logger.info(`[CalendarConsistencyJob] Cleanup complete: ${this.stats.orphanedCalendarEventsDeleted} orphaned events deleted`);
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] Cleanup failed', { error: error.message });
      this.stats.errors.push({ phase: 'cleanup', error: error.message });
    }
  }

  /**
   * Find upcoming session/deload CalendarEvents that have embedded exercises
   * but no sessionTemplateId (historically created by the AI coach), create a
   * backing SessionTemplate, and link them.
   *
   * Deduped: orphans are grouped by (user, title-minus-date-suffix, exercise
   * prescription) and each group shares ONE template — a plan's repeated
   * weekly session gets a single library entry, not one per event. Idempotent
   * by construction: linked events no longer match the query. Past/completed
   * orphans are left alone (they render from embedded details and add no
   * Sessions-tab value).
   */
  async linkOrphanSessionEvents(userId = null) {
    this.logger.info('[CalendarConsistencyJob] Linking orphan session events...');

    try {
      // Start-of-day UTC: event dates are stored as midnight UTC, so plain
      // new Date() would exclude today's orphans.
      const startOfTodayUtc = new Date();
      startOfTodayUtc.setUTCHours(0, 0, 0, 0);

      const query = {
        type: { $in: ['session', 'deload'] },
        $or: [{ sessionTemplateId: { $exists: false } }, { sessionTemplateId: null }],
        status: 'scheduled',
        date: { $gte: startOfTodayUtc },
        'sessionDetails.exercises.0': { $exists: true }
      };
      if (userId) query.userId = userId;

      const orphans = await CalendarEvent.find(query).lean();

      const groups = new Map();
      for (const event of orphans) {
        const title = (event.title || 'Workout')
          .replace(/\s*\([A-Z][a-z]{2} \d{1,2}\)\s*$/, '')
          .trim() || 'Workout';
        const signature = (event.sessionDetails.exercises || [])
          .map((ex) => `${ex.exerciseName}|${ex.targetSets || ''}|${ex.targetReps || ''}`)
          .join(';');
        const key = `${event.userId}::${title}::${signature}`;
        if (!groups.has(key)) groups.set(key, { title, events: [] });
        groups.get(key).events.push(event);
      }

      for (const { title, events } of groups.values()) {
        try {
          const sample = events[0];
          const sourceExercises = sample.sessionDetails.exercises || [];
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
          // mangled version of the session in the Sessions tab — worse than
          // leaving the event unlinked.
          if (blockExercises.length !== sourceExercises.length) {
            this.stats.orphanSessionEventsSkipped += events.length;
            this.logger.info(
              `[CalendarConsistencyJob] Skipped ${events.length} orphan event(s) for "${title}": ` +
              `${sourceExercises.length - blockExercises.length}/${sourceExercises.length} exercises unresolved`
            );
            continue;
          }

          const template = await SessionTemplate.create({
            name: title,
            goal: '',
            primary_disciplines: [sample.sessionDetails.discipline || 'strength'],
            estimated_duration: sample.sessionDetails.estimatedDuration || 45,
            difficulty_level: 'intermediate',
            blocks: [{ name: 'Main Workout', exercises: blockExercises }],
            tags: ['ai-generated', 'backfill'],
            isCommon: false,
            createdBy: sample.userId
          });

          // Link the template and drop the embedded copy in one pass — the
          // template is now the only source of the planned exercises.
          await CalendarEvent.updateMany(
            { _id: { $in: events.map((e) => e._id) } },
            {
              $set: { sessionTemplateId: template._id },
              $unset: { 'sessionDetails.exercises': 1 }
            }
          );

          this.stats.orphanTemplatesCreated++;
          this.stats.orphanSessionEventsLinked += events.length;
          this.logger.info(
            `[CalendarConsistencyJob] Linked ${events.length} orphan event(s) to new template "${title}" (${template._id})`
          );
        } catch (error) {
          this.stats.errors.push({
            phase: 'orphanSessionEvents',
            title,
            error: error.message
          });
        }
      }

      this.logger.info(
        `[CalendarConsistencyJob] Orphan link complete: ${this.stats.orphanSessionEventsLinked} linked via ${this.stats.orphanTemplatesCreated} template(s), ${this.stats.orphanSessionEventsSkipped} skipped`
      );
    } catch (error) {
      this.logger.error('[CalendarConsistencyJob] Orphan session link failed', { error: error.message });
      this.stats.errors.push({ phase: 'orphanSessionEvents', error: error.message });
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
        sessionLogsProcessed: 0,
        sessionLogsFixed: 0,
        externalActivitiesProcessed: 0,
        externalActivitiesFixed: 0,
        orphanedCalendarEventsDeleted: 0,
        orphanSessionEventsLinked: 0,
        orphanTemplatesCreated: 0,
        orphanSessionEventsSkipped: 0,
        errors: []
      };

      await this.syncSessionLogsForUser(userId);
      await this.syncExternalActivitiesForUser(userId);
      await this.cleanupOrphanedCalendarEventsForUser(userId);
      await this.linkOrphanSessionEvents(userId);

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

  async syncSessionLogsForUser(userId) {
    const sessionLogs = await SessionLog.find({ userId }).lean();

    for (const sessionLog of sessionLogs) {
      this.stats.sessionLogsProcessed++;

      try {
        let needsCalendarEvent = false;

        if (!sessionLog.calendarEventId) {
          needsCalendarEvent = true;
        } else {
          const existingEvent = await CalendarEvent.findById(sessionLog.calendarEventId);
          if (!existingEvent) {
            needsCalendarEvent = true;
          }
        }

        const linkedEvent = await CalendarEvent.findOne({ sessionLogId: sessionLog._id });

        if (!linkedEvent && needsCalendarEvent) {
          const calendarEvent = await CalendarEvent.create({
            userId: sessionLog.userId,
            date: sessionLog.startedAt,
            title: sessionLog.title,
            type: 'session',
            status: sessionLog.completedAt ? 'completed' : 'in_progress',
            sessionLogId: sessionLog._id,
            sessionDetails: {
              discipline: sessionLog.discipline,
              durationMinutes: sessionLog.actualDuration,
              exercises: sessionLog.exercises?.map(ex => ({
                exerciseId: ex.exerciseId,
                exerciseName: ex.exerciseName,
                sets: ex.sets
              }))
            },
            completedAt: sessionLog.completedAt
          });

          await SessionLog.findByIdAndUpdate(sessionLog._id, {
            calendarEventId: calendarEvent._id
          });

          this.stats.sessionLogsFixed++;
        } else if (linkedEvent && !sessionLog.calendarEventId) {
          await SessionLog.findByIdAndUpdate(sessionLog._id, {
            calendarEventId: linkedEvent._id
          });
          this.stats.sessionLogsFixed++;
        }
      } catch (error) {
        this.stats.errors.push({
          phase: 'sessionLogs',
          sessionLogId: sessionLog._id.toString(),
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
    const eventsWithSessionLogId = await CalendarEvent.find({
      userId,
      sessionLogId: { $exists: true, $ne: null }
    }).lean();

    for (const event of eventsWithSessionLogId) {
      const sessionLog = await SessionLog.findById(event.sessionLogId);
      if (!sessionLog) {
        if (event.externalActivityId) {
          await CalendarEvent.updateOne({ _id: event._id }, { $unset: { sessionLogId: 1 } });
        } else {
          await CalendarEvent.findByIdAndDelete(event._id);
          this.stats.orphanedCalendarEventsDeleted++;
        }
      }
    }

    const eventsWithExternalActivityId = await CalendarEvent.find({
      userId,
      externalActivityId: { $exists: true, $ne: null }
    }).lean();

    for (const event of eventsWithExternalActivityId) {
      const externalActivity = await ExternalActivity.findById(event.externalActivityId);
      if (!externalActivity) {
        await ActivityMatchingService.unlinkOrDeleteStravaEvent(event, event.userId);
        this.stats.orphanedCalendarEventsDeleted++;
      }
    }
  }
}

module.exports = CalendarConsistencyJob;
