const cron = require('node-cron');
const logger = require('../../logger');
const linkedinAPI = require('../services/linkedinAPI');
const db = require('../database/init');

/**
 * Dedicated analytics worker process
 * Handles background analytics collection and processing
 */
class AnalyticsWorker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
    this.stats = {
      analyticsUpdated: 0,
      analyticsErrors: 0,
      lastRun: null,
      uptime: Date.now()
    };
  }

  /**
   * Initialize the analytics worker
   */
  async init() {
    try {
      logger.analytics('Initializing analytics worker...');
      
      // Initialize database connection
      await db.init();
      
      // Setup cron jobs
      this.setupCronJobs();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.isRunning = true;
      logger.analytics('Analytics worker initialized successfully');
      
      // Send ready signal to PM2
      if (process.send) {
        process.send('ready');
      }
      
    } catch (error) {
      logger.error('Failed to initialize analytics worker:', error);
      process.exit(1);
    }
  }

  /**
   * Setup cron jobs for analytics tasks
   */
  setupCronJobs() {
    // Update analytics for recent posts every 30 minutes
    this.jobs.set('updateRecent', cron.schedule('*/30 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateRecentPostAnalytics();
      } catch (error) {
        logger.error('Error updating recent analytics:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Full analytics refresh for all posts (every 6 hours)
    this.jobs.set('fullRefresh', cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.fullAnalyticsRefresh();
      } catch (error) {
        logger.error('Error in full analytics refresh:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Generate analytics reports (daily at 1 AM)
    this.jobs.set('generateReports', cron.schedule('0 1 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.generateDailyReports();
      } catch (error) {
        logger.error('Error generating reports:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Update user insights and recommendations (daily at 2 AM)
    this.jobs.set('updateInsights', cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.updateUserInsights();
      } catch (error) {
        logger.error('Error updating insights:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Asia/Dubai'
    }));

    // Health check (every 10 minutes)
    this.jobs.set('healthCheck', cron.schedule('*/10 * * * *', async () => {
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

    logger.analytics('Analytics cron jobs setup completed');
  }

  /**
   * Update analytics for posts from the last 48 hours
   */
  async updateRecentPostAnalytics() {
    const startTime = Date.now();
    
    try {
      // Get posts from last 48 hours that need analytics updates
      const recentPosts = await db.all(`
        SELECT sp.*, u.linkedin_access_token, u.linkedin_token_expires
        FROM scheduled_posts sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.status = 'posted' 
        AND sp.posted_at > datetime('now', '-48 hours')
        AND u.linkedin_access_token IS NOT NULL
        AND u.linkedin_token_expires > datetime('now')
        ORDER BY sp.posted_at DESC
      `);

      if (recentPosts.length === 0) {
        logger.analytics('No recent posts found for analytics update');
        return;
      }

      logger.analytics(`Updating analytics for ${recentPosts.length} recent posts`);
      
      for (const post of recentPosts) {
        try {
          if (post.linkedin_post_id) {
            const analytics = await linkedinAPI.getPostAnalytics(
              post.linkedin_access_token,
              post.linkedin_post_id
            );
            
            await this.saveAnalytics(post.id, analytics);
            this.stats.analyticsUpdated++;
            
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          this.stats.analyticsErrors++;
          logger.error(`Failed to update analytics for post ${post.id}:`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.analytics(`Updated analytics for ${recentPosts.length} posts in ${duration}ms`);
      
    } catch (error) {
      logger.error('Error updating recent post analytics:', error);
    }
    
    this.stats.lastRun = new Date();
  }

  /**
   * Full analytics refresh for all posted content
   */
  async fullAnalyticsRefresh() {
    try {
      // Get all posted content from last 30 days
      const allPosts = await db.all(`
        SELECT sp.*, u.linkedin_access_token, u.linkedin_token_expires
        FROM scheduled_posts sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.status = 'posted' 
        AND sp.posted_at > datetime('now', '-30 days')
        AND u.linkedin_access_token IS NOT NULL
        AND u.linkedin_token_expires > datetime('now')
        ORDER BY sp.posted_at DESC
      `);

      logger.analytics(`Starting full analytics refresh for ${allPosts.length} posts`);
      
      let batchCount = 0;
      const batchSize = 10;
      
      for (let i = 0; i < allPosts.length; i += batchSize) {
        const batch = allPosts.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (post) => {
          try {
            if (post.linkedin_post_id) {
              const analytics = await linkedinAPI.getPostAnalytics(
                post.linkedin_access_token,
                post.linkedin_post_id
              );
              
              await this.saveAnalytics(post.id, analytics);
              this.stats.analyticsUpdated++;
            }
          } catch (error) {
            this.stats.analyticsErrors++;
            logger.error(`Failed to refresh analytics for post ${post.id}:`, error);
          }
        }));
        
        batchCount++;
        logger.analytics(`Processed batch ${batchCount}/${Math.ceil(allPosts.length / batchSize)}`);
        
        // Delay between batches to respect rate limits
        if (i + batchSize < allPosts.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      logger.analytics(`Full analytics refresh completed for ${allPosts.length} posts`);
      
    } catch (error) {
      logger.error('Error in full analytics refresh:', error);
    }
  }

  /**
   * Generate daily analytics reports
   */
  async generateDailyReports() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Generate summary report for yesterday
      const dailyStats = await db.get(`
        SELECT 
          COUNT(*) as posts_published,
          AVG(CAST(pa.likes as REAL)) as avg_likes,
          AVG(CAST(pa.comments as REAL)) as avg_comments,
          AVG(CAST(pa.shares as REAL)) as avg_shares,
          AVG(CAST(pa.impressions as REAL)) as avg_impressions,
          AVG(CAST(pa.engagement_rate as REAL)) as avg_engagement_rate
        FROM scheduled_posts sp
        LEFT JOIN post_analytics pa ON sp.id = pa.post_id
        WHERE DATE(sp.posted_at) = ?
        AND sp.status = 'posted'
      `, [yesterdayStr]);
      
      // Get top performing post
      const topPost = await db.get(`
        SELECT sp.*, pa.*, gc.content_preview
        FROM scheduled_posts sp
        LEFT JOIN post_analytics pa ON sp.id = pa.post_id
        LEFT JOIN generated_content gc ON sp.content_id = gc.id
        WHERE DATE(sp.posted_at) = ?
        AND sp.status = 'posted'
        ORDER BY CAST(pa.engagement_rate as REAL) DESC
        LIMIT 1
      `, [yesterdayStr]);
      
      // Store daily report
      await db.run(`
        INSERT OR REPLACE INTO daily_reports (
          report_date, posts_published, avg_likes, avg_comments, 
          avg_shares, avg_impressions, avg_engagement_rate,
          top_post_id, top_post_engagement, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        yesterdayStr,
        dailyStats.posts_published || 0,
        dailyStats.avg_likes || 0,
        dailyStats.avg_comments || 0,
        dailyStats.avg_shares || 0,
        dailyStats.avg_impressions || 0,
        dailyStats.avg_engagement_rate || 0,
        topPost?.id || null,
        topPost?.engagement_rate || 0,
        new Date().toISOString()
      ]);
      
      logger.analytics(`Daily report generated for ${yesterdayStr}: ${dailyStats.posts_published} posts, ${dailyStats.avg_engagement_rate?.toFixed(2)}% avg engagement`);
      
    } catch (error) {
      logger.error('Error generating daily reports:', error);
    }
  }

  /**
   * Update user insights and recommendations
   */
  async updateUserInsights() {
    try {
      const users = await db.all(`
        SELECT DISTINCT u.id, u.email
        FROM users u
        JOIN scheduled_posts sp ON u.id = sp.user_id
        WHERE u.linkedin_connected = 1
        AND sp.status = 'posted'
        AND sp.posted_at > datetime('now', '-30 days')
      `);
      
      for (const user of users) {
        try {
          // Calculate user-specific insights
          const insights = await this.calculateUserInsights(user.id);
          
          // Store insights
          await db.run(`
            INSERT OR REPLACE INTO user_insights (
              user_id, best_posting_time, best_content_type,
              avg_engagement_rate, total_posts, total_engagement,
              recommendations, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            user.id,
            insights.bestPostingTime,
            insights.bestContentType,
            insights.avgEngagementRate,
            insights.totalPosts,
            insights.totalEngagement,
            JSON.stringify(insights.recommendations),
            new Date().toISOString()
          ]);
          
        } catch (error) {
          logger.error(`Failed to update insights for user ${user.id}:`, error);
        }
      }
      
      logger.analytics(`Updated insights for ${users.length} users`);
      
    } catch (error) {
      logger.error('Error updating user insights:', error);
    }
  }

  /**
   * Calculate insights for a specific user
   */
  async calculateUserInsights(userId) {
    // Get user's posting performance
    const performance = await db.all(`
      SELECT 
        sp.*,
        pa.likes, pa.comments, pa.shares, pa.impressions, pa.engagement_rate,
        gc.content_type,
        strftime('%H', sp.posted_at) as posting_hour
      FROM scheduled_posts sp
      LEFT JOIN post_analytics pa ON sp.id = pa.post_id
      LEFT JOIN generated_content gc ON sp.content_id = gc.id
      WHERE sp.user_id = ?
      AND sp.status = 'posted'
      AND sp.posted_at > datetime('now', '-30 days')
      ORDER BY sp.posted_at DESC
    `, [userId]);
    
    if (performance.length === 0) {
      return {
        bestPostingTime: '09:00',
        bestContentType: 'text',
        avgEngagementRate: 0,
        totalPosts: 0,
        totalEngagement: 0,
        recommendations: []
      };
    }
    
    // Calculate best posting time
    const hourlyPerformance = {};
    const contentTypePerformance = {};
    
    let totalEngagement = 0;
    let totalEngagementRate = 0;
    
    performance.forEach(post => {
      const hour = post.posting_hour;
      const contentType = post.content_type || 'text';
      const engagementRate = parseFloat(post.engagement_rate) || 0;
      const engagement = (parseInt(post.likes) || 0) + (parseInt(post.comments) || 0) + (parseInt(post.shares) || 0);
      
      // Track hourly performance
      if (!hourlyPerformance[hour]) {
        hourlyPerformance[hour] = { total: 0, count: 0 };
      }
      hourlyPerformance[hour].total += engagementRate;
      hourlyPerformance[hour].count += 1;
      
      // Track content type performance
      if (!contentTypePerformance[contentType]) {
        contentTypePerformance[contentType] = { total: 0, count: 0 };
      }
      contentTypePerformance[contentType].total += engagementRate;
      contentTypePerformance[contentType].count += 1;
      
      totalEngagement += engagement;
      totalEngagementRate += engagementRate;
    });
    
    // Find best posting time
    let bestHour = '09';
    let bestHourAvg = 0;
    Object.entries(hourlyPerformance).forEach(([hour, data]) => {
      const avg = data.total / data.count;
      if (avg > bestHourAvg) {
        bestHourAvg = avg;
        bestHour = hour;
      }
    });
    
    // Find best content type
    let bestContentType = 'text';
    let bestContentAvg = 0;
    Object.entries(contentTypePerformance).forEach(([type, data]) => {
      const avg = data.total / data.count;
      if (avg > bestContentAvg) {
        bestContentAvg = avg;
        bestContentType = type;
      }
    });
    
    // Generate recommendations
    const recommendations = [];
    const avgEngagementRate = totalEngagementRate / performance.length;
    
    if (avgEngagementRate < 2) {
      recommendations.push('Consider using more engaging content formats like polls or multi-image posts');
    }
    
    if (performance.length < 10) {
      recommendations.push('Increase posting frequency to build audience engagement');
    }
    
    recommendations.push(`Your best performing time is ${bestHour}:00 - consider scheduling more posts around this time`);
    recommendations.push(`${bestContentType} posts perform best for you - consider creating more of this content type`);
    
    return {
      bestPostingTime: `${bestHour}:00`,
      bestContentType,
      avgEngagementRate,
      totalPosts: performance.length,
      totalEngagement,
      recommendations
    };
  }

  /**
   * Save analytics data to database
   */
  async saveAnalytics(postId, analytics) {
    await db.run(`
      INSERT OR REPLACE INTO post_analytics (
        post_id, likes, comments, shares, impressions, 
        engagement_rate, click_through_rate, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      postId,
      analytics.likes || 0,
      analytics.comments || 0,
      analytics.shares || 0,
      analytics.impressions || 0,
      analytics.engagementRate || 0,
      analytics.clickThroughRate || 0,
      new Date().toISOString()
    ]);
  }

  /**
   * Update health statistics
   */
  async updateHealthStats() {
    try {
      const dbStats = await db.get(`
        SELECT 
          (SELECT COUNT(*) FROM post_analytics WHERE updated_at > datetime('now', '-1 hour')) as recent_updates,
          (SELECT COUNT(*) FROM scheduled_posts WHERE status = 'posted' AND posted_at > datetime('now', '-24 hours')) as posts_24h
      `);
      
      const uptimeHours = Math.floor((Date.now() - this.stats.uptime) / (1000 * 60 * 60));
      
      logger.analytics(`Health Check - Uptime: ${uptimeHours}h, Recent Updates: ${dbStats.recent_updates}, Posts 24h: ${dbStats.posts_24h}`);
      
      process.title = `linkedin-analytics [${dbStats.recent_updates} updates]`;
      
    } catch (error) {
      logger.error('Error updating health stats:', error);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.analytics(`Received ${signal}, shutting down gracefully...`);
      
      this.isRunning = false;
      
      // Stop all cron jobs
      for (const [name, job] of this.jobs) {
        job.stop();
        logger.analytics(`Stopped cron job: ${name}`);
      }
      
      // Close database connection
      try {
        await db.close();
        logger.analytics('Database connection closed');
      } catch (error) {
        logger.error('Error closing database:', error);
      }
      
      logger.analytics(`Final stats - Updated: ${this.stats.analyticsUpdated}, Errors: ${this.stats.analyticsErrors}`);
      
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2'));
    
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

// Initialize and start the analytics worker
const worker = new AnalyticsWorker();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in analytics worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection in analytics worker:', reason);
  process.exit(1);
});

// Start the worker
worker.init().catch((error) => {
  logger.error('Failed to start analytics worker:', error);
  process.exit(1);
});

// Export for testing
module.exports = worker;