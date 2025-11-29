const mongoose = require('mongoose');
const CalendarEvent = require('../models/CalendarEvent');
const WorkoutLog = require('../models/WorkoutLog');
const ExternalActivity = require('../models/ExternalActivity');
const StravaIntegrationService = require('../services/StravaIntegrationService');

/**
 * Calendar Consistency Job
 *
 * Ensures data consistency between CalendarEvent and its linked collections:
 * - WorkoutLog (from TrainNow)
 * - ExternalActivity (from Strava)
 *
 * Tasks:
 * 1. Find WorkoutLogs without CalendarEvent and create them
 * 2. Find ExternalActivities without CalendarEvent and create them
 * 3. Find CalendarEvents with broken links (workoutLogId or externalActivityId pointing to non-existent docs) and delete them
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
        errors: []
      };

      // Run all consistency checks
      await this.syncWorkoutLogs();
      await this.syncExternalActivities();
      await this.cleanupOrphanedCalendarEvents();

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
        errors: []
      };

      await this.syncWorkoutLogsForUser(userId);
      await this.syncExternalActivitiesForUser(userId);
      await this.cleanupOrphanedCalendarEventsForUser(userId);

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
