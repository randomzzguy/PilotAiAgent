const cron = require('node-cron');
const { pool } = require('../database/init');
const optimalTimingService = require('../services/optimalTiming');
const logger = require('../utils/logger');

/**
 * Optimal Timing Worker
 * Handles background tasks for optimal timing calculations and cache management
 */
class OptimalTimingWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
  }

  /**
   * Start all optimal timing background jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Optimal timing worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting optimal timing worker...');

    // Schedule optimal times cache refresh (daily at 2 AM)
    this.jobs.set('cache-refresh', cron.schedule('0 2 * * *', async () => {
      await this.refreshOptimalTimesCache();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Schedule performance analysis (weekly on Sunday at 3 AM)
    this.jobs.set('performance-analysis', cron.schedule('0 3 * * 0', async () => {
      await this.analyzeUserPerformance();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Schedule optimal times validation (every 6 hours)
    this.jobs.set('validation', cron.schedule('0 */6 * * *', async () => {
      await this.validateOptimalTimes();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Schedule cleanup of old cache entries (daily at 1 AM)
    this.jobs.set('cleanup', cron.schedule('0 1 * * *', async () => {
      await this.cleanupOldCacheEntries();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Schedule user insights update (every 4 hours)
    this.jobs.set('insights-update', cron.schedule('0 */4 * * *', async () => {
      await this.updateUserInsights();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    logger.info('Optimal timing worker started successfully');
    logger.info(`Scheduled ${this.jobs.size} background jobs`);
  }

  /**
   * Stop all optimal timing background jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Optimal timing worker is not running');
      return;
    }

    logger.info('Stopping optimal timing worker...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    });
    
    this.jobs.clear();
    this.isRunning = false;
    
    logger.info('Optimal timing worker stopped');
  }

  /**
   * Refresh optimal times cache for all active users
   */
  async refreshOptimalTimesCache() {
    const startTime = Date.now();
    logger.info('Starting optimal times cache refresh...');

    const client = await pool.connect();
    try {
      // Get all active users (posted in last 30 days)
      const activeUsers = await client.query(`
        SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
               COUNT(sp.id) as recent_posts
        FROM users u
        JOIN scheduled_posts sp ON sp.user_id = u.id
        WHERE sp.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND u.linkedin_access_token IS NOT NULL
        GROUP BY u.id, u.email, u.first_name, u.last_name
        HAVING COUNT(sp.id) >= 5
        ORDER BY recent_posts DESC
      `);

      logger.info(`Found ${activeUsers.rows.length} active users for cache refresh`);

      let successCount = 0;
      let errorCount = 0;

      // Process users in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < activeUsers.rows.length; i += batchSize) {
        const batch = activeUsers.rows.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (user) => {
            try {
              await optimalTimingService.updateOptimalTimesCache(user.id);
              successCount++;
              logger.debug(`Updated optimal times cache for user ${user.id}`);
            } catch (error) {
              errorCount++;
              logger.error(`Failed to update optimal times cache for user ${user.id}:`, error);
            }
          })
        );

        // Small delay between batches
        if (i + batchSize < activeUsers.rows.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Optimal times cache refresh completed in ${duration}ms`, {
        totalUsers: activeUsers.rows.length,
        successCount,
        errorCount,
        duration
      });

    } finally {
      client.release();
    }
  }

  /**
   * Analyze user performance and identify trends
   */
  async analyzeUserPerformance() {
    const startTime = Date.now();
    logger.info('Starting user performance analysis...');

    const client = await pool.connect();
    try {
      // Get users with significant posting activity
      const users = await client.query(`
        SELECT u.id, u.email,
               COUNT(sp.id) as total_posts,
               AVG(pa.engagement_rate) as avg_engagement_rate,
               MAX(sp.posted_at) as last_post_date
        FROM users u
        JOIN scheduled_posts sp ON sp.user_id = u.id
        LEFT JOIN post_analytics pa ON pa.scheduled_post_id = sp.id
        WHERE sp.status = 'posted'
        AND sp.posted_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY u.id, u.email
        HAVING COUNT(sp.id) >= 10
        ORDER BY avg_engagement_rate DESC NULLS LAST
      `);

      logger.info(`Analyzing performance for ${users.rows.length} users`);

      const insights = [];
      
      for (const user of users.rows) {
        try {
          // Get personalized optimal times
          const optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(user.id, 90);
          
          // Calculate performance metrics
          const performanceMetrics = await this.calculatePerformanceMetrics(user.id);
          
          insights.push({
            userId: user.id,
            email: user.email,
            totalPosts: user.total_posts,
            avgEngagementRate: parseFloat(user.avg_engagement_rate) || 0,
            lastPostDate: user.last_post_date,
            optimalTimesConfidence: optimalTimes.confidence,
            performanceMetrics,
            analyzedAt: new Date()
          });

        } catch (error) {
          logger.error(`Failed to analyze performance for user ${user.id}:`, error);
        }
      }

      // Store insights in database
      if (insights.length > 0) {
        await this.storePerformanceInsights(insights);
      }

      const duration = Date.now() - startTime;
      logger.info(`User performance analysis completed in ${duration}ms`, {
        usersAnalyzed: insights.length,
        duration
      });

    } finally {
      client.release();
    }
  }

  /**
   * Calculate detailed performance metrics for a user
   */
  async calculatePerformanceMetrics(userId) {
    const client = await pool.connect();
    try {
      // Get posting patterns
      const postingPatterns = await client.query(`
        SELECT 
          EXTRACT(HOUR FROM sp.posted_at) as hour,
          EXTRACT(DOW FROM sp.posted_at) as day_of_week,
          gc.content_type,
          AVG(pa.engagement_rate) as avg_engagement,
          COUNT(*) as post_count
        FROM scheduled_posts sp
        JOIN post_analytics pa ON pa.scheduled_post_id = sp.id
        LEFT JOIN generated_content gc ON gc.id = sp.content_id
        WHERE sp.user_id = $1
        AND sp.status = 'posted'
        AND sp.posted_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        AND pa.engagement_rate IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM sp.posted_at), EXTRACT(DOW FROM sp.posted_at), gc.content_type
        ORDER BY avg_engagement DESC
      `, [userId]);

      // Calculate consistency score
      const consistencyData = await client.query(`
        SELECT 
          DATE_TRUNC('week', sp.posted_at) as week,
          COUNT(*) as posts_per_week
        FROM scheduled_posts sp
        WHERE sp.user_id = $1
        AND sp.status = 'posted'
        AND sp.posted_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('week', sp.posted_at)
        ORDER BY week
      `, [userId]);

      const avgPostsPerWeek = consistencyData.rows.reduce((sum, week) => sum + parseInt(week.posts_per_week), 0) / consistencyData.rows.length;
      const consistencyScore = Math.min(avgPostsPerWeek / 5, 1); // Normalize to 0-1 scale

      // Find best performing content types
      const contentTypePerformance = {};
      postingPatterns.rows.forEach(row => {
        const contentType = row.content_type || 'text';
        if (!contentTypePerformance[contentType]) {
          contentTypePerformance[contentType] = {
            avgEngagement: 0,
            postCount: 0
          };
        }
        contentTypePerformance[contentType].avgEngagement += parseFloat(row.avg_engagement) || 0;
        contentTypePerformance[contentType].postCount += parseInt(row.post_count);
      });

      // Calculate final averages
      Object.keys(contentTypePerformance).forEach(type => {
        const data = contentTypePerformance[type];
        data.avgEngagement = data.avgEngagement / data.postCount;
      });

      return {
        consistencyScore,
        avgPostsPerWeek,
        contentTypePerformance,
        totalDataPoints: postingPatterns.rows.length,
        weeksCovered: consistencyData.rows.length
      };

    } finally {
      client.release();
    }
  }

  /**
   * Store performance insights in database
   */
  async storePerformanceInsights(insights) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const insight of insights) {
        await client.query(`
          INSERT INTO user_insights (
            user_id, insight_type, insight_data, confidence_score, created_at
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          insight.userId,
          'performance_analysis',
          JSON.stringify(insight),
          insight.optimalTimesConfidence === 'high' ? 0.9 : 
          insight.optimalTimesConfidence === 'medium' ? 0.7 : 0.5,
          new Date()
        ]);
      }

      await client.query('COMMIT');
      logger.info(`Stored ${insights.length} performance insights`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate optimal times accuracy and update confidence scores
   */
  async validateOptimalTimes() {
    const startTime = Date.now();
    logger.info('Starting optimal times validation...');

    const client = await pool.connect();
    try {
      // Get users with cached optimal times
      const cachedUsers = await client.query(`
        SELECT uot.user_id, uot.optimal_times_data, uot.updated_at,
               COUNT(sp.id) as recent_posts
        FROM user_optimal_times uot
        LEFT JOIN scheduled_posts sp ON sp.user_id = uot.user_id
          AND sp.posted_at >= uot.updated_at
          AND sp.status = 'posted'
        GROUP BY uot.user_id, uot.optimal_times_data, uot.updated_at
        HAVING COUNT(sp.id) >= 3
      `);

      logger.info(`Validating optimal times for ${cachedUsers.rows.length} users`);

      let validationCount = 0;
      
      for (const user of cachedUsers.rows) {
        try {
          // Get fresh optimal times
          const freshOptimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(user.user_id, 30);
          const cachedOptimalTimes = JSON.parse(user.optimal_times_data);

          // Compare confidence levels
          const confidenceImproved = this.compareConfidence(freshOptimalTimes.confidence, cachedOptimalTimes.confidence);
          
          if (confidenceImproved || this.shouldUpdateCache(user.updated_at)) {
            await optimalTimingService.updateOptimalTimesCache(user.user_id);
            validationCount++;
            logger.debug(`Updated optimal times cache for user ${user.user_id} (confidence: ${freshOptimalTimes.confidence})`);
          }

        } catch (error) {
          logger.error(`Failed to validate optimal times for user ${user.user_id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Optimal times validation completed in ${duration}ms`, {
        usersValidated: cachedUsers.rows.length,
        cacheUpdates: validationCount,
        duration
      });

    } finally {
      client.release();
    }
  }

  /**
   * Compare confidence levels
   */
  compareConfidence(newConfidence, oldConfidence) {
    const confidenceOrder = { 'low': 1, 'medium': 2, 'high': 3 };
    return confidenceOrder[newConfidence] > confidenceOrder[oldConfidence];
  }

  /**
   * Check if cache should be updated based on age
   */
  shouldUpdateCache(updatedAt) {
    const cacheAge = Date.now() - new Date(updatedAt).getTime();
    const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    return cacheAge > maxCacheAge;
  }

  /**
   * Clean up old cache entries
   */
  async cleanupOldCacheEntries() {
    const startTime = Date.now();
    logger.info('Starting cache cleanup...');

    const client = await pool.connect();
    try {
      // Delete cache entries older than 30 days
      const result = await client.query(`
        DELETE FROM user_optimal_times
        WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
      `);

      // Delete old user insights (keep last 90 days)
      const insightsResult = await client.query(`
        DELETE FROM user_insights
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        AND insight_type = 'performance_analysis'
      `);

      const duration = Date.now() - startTime;
      logger.info(`Cache cleanup completed in ${duration}ms`, {
        deletedCacheEntries: result.rowCount,
        deletedInsights: insightsResult.rowCount,
        duration
      });

    } finally {
      client.release();
    }
  }

  /**
   * Update user insights with latest optimal timing data
   */
  async updateUserInsights() {
    const startTime = Date.now();
    logger.info('Starting user insights update...');

    const client = await pool.connect();
    try {
      // Get users who need insights updates
      const users = await client.query(`
        SELECT DISTINCT u.id
        FROM users u
        JOIN scheduled_posts sp ON sp.user_id = u.id
        WHERE sp.posted_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND sp.status = 'posted'
        AND u.linkedin_access_token IS NOT NULL
      `);

      logger.info(`Updating insights for ${users.rows.length} users`);

      let updateCount = 0;
      
      for (const user of users.rows) {
        try {
          // Get next optimal posting time
          const nextOptimalTime = await optimalTimingService.getNextOptimalTime(user.id);
          
          if (nextOptimalTime) {
            // Store as insight
            await client.query(`
              INSERT INTO user_insights (
                user_id, insight_type, insight_data, confidence_score, created_at
              ) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (user_id, insight_type) 
              DO UPDATE SET 
                insight_data = $3,
                confidence_score = $4,
                created_at = $5
            `, [
              user.id,
              'next_optimal_time',
              JSON.stringify(nextOptimalTime),
              nextOptimalTime.confidence === 'high' ? 0.9 : 
              nextOptimalTime.confidence === 'medium' ? 0.7 : 0.5,
              new Date()
            ]);
            
            updateCount++;
          }

        } catch (error) {
          logger.error(`Failed to update insights for user ${user.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`User insights update completed in ${duration}ms`, {
        usersProcessed: users.rows.length,
        insightsUpdated: updateCount,
        duration
      });

    } finally {
      client.release();
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.keys())
    };
  }
}

// Create and export singleton instance
const optimalTimingWorker = new OptimalTimingWorker();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, stopping optimal timing worker...');
  optimalTimingWorker.stop();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, stopping optimal timing worker...');
  optimalTimingWorker.stop();
});

module.exports = optimalTimingWorker;