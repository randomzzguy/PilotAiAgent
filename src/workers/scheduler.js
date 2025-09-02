const cron = require('node-cron');
const logger = require('../../logger');
const scheduler = require('../services/scheduler');
const optimalTimingService = require('../services/optimalTiming');
const optimalTimingWorker = require('./optimalTimingWorker');
const db = require('../database/init');

/**
 * Dedicated scheduler worker process
 * Handles all scheduled content posting and optimization
 */
class SchedulerWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
    this.stats = {
      postsProcessed: 0,
      postsSuccessful: 0,
      postsFailed: 0,
      lastRun: null,
      uptime: Date.now()
    };
  }

  /**
   * Initialize the scheduler worker
   */
  async init() {
    try {
      logger.scheduler('Initializing scheduler worker...');
      
      // Initialize database connection
      await db.init();
      
      // Initialize scheduler service
      await scheduler.init();
      
      // Start optimal timing worker
      optimalTimingWorker.start();
      
      // Setup cron jobs
      this.setupCronJobs();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.isRunning = true;
      logger.scheduler('Scheduler worker initialized successfully');
      
      // Send ready signal to PM2
      if (process.send) {
        process.send('ready');
      }
      
    } catch (error) {
      logger.error('Failed to initialize scheduler worker:', error);
      process.exit(1);
    }
  }

  /**
   * Setup cron jobs for different scheduling tasks
   */
  setupCronJobs() {
    // Check for pending posts every minute
    this.jobs.set('checkPending', cron.schedule('* * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.processPendingPosts();
      } catch (error) {
        logger.error('Error in pending posts check:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Auto-schedule content for optimal times (every hour)
    this.jobs.set('autoSchedule', cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.autoScheduleContent();
      } catch (error) {
        logger.error('Error in auto-scheduling:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Check for optimal posting opportunities (every 15 minutes)
    this.jobs.set('optimalCheck', cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.checkOptimalPostingOpportunities();
      } catch (error) {
        logger.error('Error in optimal posting check:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Cleanup old analytics data (daily at 3 AM)
    this.jobs.set('cleanup', cron.schedule('0 3 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.cleanupOldData();
      } catch (error) {
        logger.error('Error in cleanup:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Health check and stats update (every 5 minutes)
    this.jobs.set('healthCheck', cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateHealthStats();
      } catch (error) {
        logger.error('Error in health check:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    logger.scheduler('Cron jobs setup completed');
  }

  /**
   * Process pending posts that are due for publishing
   */
  async processPendingPosts() {
    const startTime = Date.now();
    
    try {
      const pendingPosts = await scheduler.checkPendingPosts();
      
      if (pendingPosts.length === 0) {
        return;
      }

      logger.scheduler(`Processing ${pendingPosts.length} pending posts`);
      
      for (const post of pendingPosts) {
        try {
          await scheduler.executeScheduledPost(post.id);
          this.stats.postsSuccessful++;
          logger.scheduler(`Successfully posted: ${post.id}`);
        } catch (error) {
          this.stats.postsFailed++;
          logger.error(`Failed to post ${post.id}:`, error);
        }
        
        this.stats.postsProcessed++;
      }
      
      const duration = Date.now() - startTime;
      logger.scheduler(`Processed ${pendingPosts.length} posts in ${duration}ms`);
      
    } catch (error) {
      logger.error('Error processing pending posts:', error);
    }
    
    this.stats.lastRun = new Date();
  }

  /**
   * Auto-schedule content for optimal posting times
   */
  async autoScheduleContent() {
    try {
      const result = await scheduler.autoScheduleOptimalContent();
      
      if (result.scheduled > 0) {
        logger.scheduler(`Auto-scheduled ${result.scheduled} posts for optimal times`);
      }
      
    } catch (error) {
      logger.error('Error in auto-scheduling:', error);
    }
  }

  /**
   * Check for optimal posting opportunities using advanced timing analysis
   */
  async checkOptimalPostingOpportunities() {
    try {
      // Get users with pending content that could be optimally scheduled
      const users = await db.all(`
        SELECT DISTINCT u.id, u.email, COUNT(sp.id) as pending_count
        FROM users u
        JOIN scheduled_posts sp ON sp.user_id = u.id
        WHERE sp.status = 'pending'
        AND sp.scheduled_time > datetime('now')
        AND u.linkedin_access_token IS NOT NULL
        GROUP BY u.id, u.email
        HAVING COUNT(sp.id) > 0
      `);

      let optimizationCount = 0;

      for (const user of users) {
        try {
          // Get next optimal time for this user
          const nextOptimalTime = await optimalTimingService.getNextOptimalTime(user.id);
          
          if (nextOptimalTime && nextOptimalTime.confidence !== 'low') {
            // Check if we can reschedule any pending posts to this optimal time
            const rescheduled = await this.rescheduleToOptimalTime(user.id, nextOptimalTime);
            optimizationCount += rescheduled;
          }
        } catch (error) {
          logger.error(`Error optimizing posts for user ${user.id}:`, error);
        }
      }

      if (optimizationCount > 0) {
        logger.scheduler(`Optimized ${optimizationCount} posts for better timing`);
      }

    } catch (error) {
      logger.error('Error checking optimal posting opportunities:', error);
    }
  }

  /**
   * Reschedule posts to optimal times
   */
  async rescheduleToOptimalTime(userId, optimalTime) {
    try {
      // Get posts that could benefit from rescheduling
      const posts = await db.all(`
        SELECT id, scheduled_time, content_type
        FROM scheduled_posts
        WHERE user_id = ?
        AND status = 'pending'
        AND scheduled_time > datetime('now', '+1 hour')
        AND scheduled_time < datetime('now', '+7 days')
        ORDER BY scheduled_time ASC
        LIMIT 3
      `, [userId]);

      let rescheduledCount = 0;

      for (const post of posts) {
        // Check if the optimal time is significantly better than current time
        const currentTime = new Date(post.scheduled_time);
        const optimalDateTime = new Date(optimalTime.dateTime);
        
        // Only reschedule if optimal time is within reasonable range and different enough
        const timeDiff = Math.abs(optimalDateTime.getTime() - currentTime.getTime());
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff >= 2 && hoursDiff <= 48) {
          await db.run(`
            UPDATE scheduled_posts 
            SET scheduled_time = ?, 
                updated_at = datetime('now'),
                optimization_applied = 1
            WHERE id = ?
          `, [optimalDateTime.toISOString(), post.id]);
          
          rescheduledCount++;
          logger.scheduler(`Rescheduled post ${post.id} to optimal time: ${optimalDateTime.toISOString()}`);
        }
      }

      return rescheduledCount;
    } catch (error) {
      logger.error(`Error rescheduling posts for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Cleanup old data to maintain database performance
   */
  async cleanupOldData() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days of data
      
      // Cleanup old analytics data
      const analyticsResult = await db.run(`
        DELETE FROM post_analytics 
        WHERE created_at < ? AND post_id NOT IN (
          SELECT id FROM scheduled_posts WHERE status = 'posted' AND created_at > ?
        )
      `, [cutoffDate.toISOString(), cutoffDate.toISOString()]);
      
      // Cleanup old API usage logs
      const apiResult = await db.run(`
        DELETE FROM api_usage 
        WHERE created_at < ?
      `, [cutoffDate.toISOString()]);
      
      logger.scheduler(`Cleanup completed: ${analyticsResult.changes} analytics records, ${apiResult.changes} API logs removed`);
      
    } catch (error) {
      logger.error('Error in cleanup:', error);
    }
  }

  /**
   * Update health statistics and log system status
   */
  async updateHealthStats() {
    try {
      // Get database stats
      const dbStats = await db.get(`
        SELECT 
          (SELECT COUNT(*) FROM scheduled_posts WHERE status = 'pending') as pending_posts,
          (SELECT COUNT(*) FROM scheduled_posts WHERE status = 'posted' AND created_at > datetime('now', '-24 hours')) as posts_24h,
          (SELECT COUNT(*) FROM users WHERE linkedin_connected = 1) as connected_users
      `);
      
      // Calculate uptime
      const uptimeHours = Math.floor((Date.now() - this.stats.uptime) / (1000 * 60 * 60));
      
      // Log health stats
      logger.scheduler(`Health Check - Uptime: ${uptimeHours}h, Pending: ${dbStats.pending_posts}, Posted 24h: ${dbStats.posts_24h}, Connected Users: ${dbStats.connected_users}`);
      
      // Update process title for monitoring
      process.title = `linkedin-scheduler [${dbStats.pending_posts} pending]`;
      
    } catch (error) {
      logger.error('Error updating health stats:', error);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.scheduler(`Received ${signal}, shutting down gracefully...`);
      
      this.isRunning = false;
      
      // Stop optimal timing worker
      optimalTimingWorker.stop();
      
      // Stop all cron jobs
      for (const [name, job] of this.jobs) {
        job.stop();
        logger.scheduler(`Stopped cron job: ${name}`);
      }
      
      // Close database connection
      try {
        await db.close();
        logger.scheduler('Database connection closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }
      
      // Log final stats
      logger.scheduler(`Final stats - Processed: ${this.stats.postsProcessed}, Successful: ${this.stats.postsSuccessful}, Failed: ${this.stats.postsFailed}`);
      
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // PM2 reload
    
    // Handle PM2 graceful shutdown
    process.on('message', (msg) => {
      if (msg === 'shutdown') {
        shutdown('PM2_SHUTDOWN');
      }
    });
  }

  /**
   * Get current worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      uptime: Date.now() - this.stats.uptime
    };
  }
}

// Initialize and start the scheduler worker
const worker = new SchedulerWorker();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in scheduler worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection in scheduler worker:', reason);
  process.exit(1);
});

// Start the worker
worker.init().catch((error) => {
  logger.error('Failed to start scheduler worker:', error);
  process.exit(1);
});

// Export for testing
module.exports = worker;