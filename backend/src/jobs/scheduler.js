const CalendarConsistencyJob = require('./calendarConsistencyJob');

/**
 * Job Scheduler
 *
 * Runs background jobs at specified intervals.
 * Uses setInterval for simplicity (no external dependencies).
 */

class JobScheduler {
  constructor(logger = console) {
    this.logger = logger;
    this.intervals = [];
    this.isRunning = false;
  }

  /**
   * Start the scheduler with all configured jobs
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('[JobScheduler] Scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('[JobScheduler] Starting job scheduler...');

    // Calendar Consistency Job - runs every 6 hours
    const calendarConsistencyInterval = this.scheduleJob(
      'CalendarConsistency',
      async () => {
        const job = new CalendarConsistencyJob(this.logger);
        return await job.run();
      },
      6 * 60 * 60 * 1000, // 6 hours in milliseconds
      true // Run immediately on startup
    );
    this.intervals.push(calendarConsistencyInterval);

    this.logger.info('[JobScheduler] Scheduler started successfully');
  }

  /**
   * Schedule a job to run at a specified interval
   * @param {string} name - Job name for logging
   * @param {Function} jobFn - Async function to execute
   * @param {number} intervalMs - Interval in milliseconds
   * @param {boolean} runOnStart - Whether to run immediately on startup
   * @returns {Object} Interval reference
   */
  scheduleJob(name, jobFn, intervalMs, runOnStart = false) {
    this.logger.info(`[JobScheduler] Scheduling job: ${name} (every ${intervalMs / 1000 / 60} minutes)`);

    // Run immediately if requested (with a small delay to allow server to fully start)
    if (runOnStart) {
      setTimeout(async () => {
        this.logger.info(`[JobScheduler] Running initial execution of: ${name}`);
        try {
          const result = await jobFn();
          this.logger.info(`[JobScheduler] Initial execution of ${name} completed`, {
            success: result?.success,
            duration: result?.duration
          });
        } catch (error) {
          this.logger.error(`[JobScheduler] Initial execution of ${name} failed`, {
            error: error.message
          });
        }
      }, 30000); // 30 second delay after startup
    }

    // Schedule recurring execution
    const interval = setInterval(async () => {
      this.logger.info(`[JobScheduler] Running scheduled job: ${name}`);
      try {
        const result = await jobFn();
        this.logger.info(`[JobScheduler] Job ${name} completed`, {
          success: result?.success,
          duration: result?.duration
        });
      } catch (error) {
        this.logger.error(`[JobScheduler] Job ${name} failed`, {
          error: error.message
        });
      }
    }, intervalMs);

    return { name, interval };
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn('[JobScheduler] Scheduler is not running');
      return;
    }

    this.logger.info('[JobScheduler] Stopping job scheduler...');

    this.intervals.forEach(({ name, interval }) => {
      clearInterval(interval);
      this.logger.info(`[JobScheduler] Stopped job: ${name}`);
    });

    this.intervals = [];
    this.isRunning = false;
    this.logger.info('[JobScheduler] Scheduler stopped');
  }
}

// Export singleton instance
const scheduler = new JobScheduler();
module.exports = scheduler;
