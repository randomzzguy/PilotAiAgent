const cron = require('node-cron');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { pool } = require('../database/init');
const linkedinAPI = require('./linkedinAPI');
const contentGenerator = require('./contentGenerator');

class ContentScheduler {
  constructor() {
    this.timezone = process.env.TIMEZONE || 'Asia/Dubai';
    this.optimalTimes = {
      morning: process.env.OPTIMAL_TIME_MORNING || '08:30',
      afternoon: process.env.OPTIMAL_TIME_AFTERNOON || '13:00',
      evening: process.env.OPTIMAL_TIME_EVENING || '20:30'
    };
    this.isRunning = false;
    this.scheduledJobs = new Map();
  }

  /**
   * Initialize the scheduler
   */
  async initialize() {
    try {
      logger.info('Initializing content scheduler...');
      
      // Schedule optimal posting times check
      this.scheduleOptimalTimesCheck();
      
      // Schedule pending posts check
      this.schedulePendingPostsCheck();
      
      // Load existing scheduled posts
      await this.loadScheduledPosts();
      
      this.isRunning = true;
      logger.info('Content scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule optimal posting times check (runs every minute)
   */
  scheduleOptimalTimesCheck() {
    cron.schedule('* * * * *', async () => {
      try {
        await this.checkOptimalPostingTimes();
      } catch (error) {
        logger.error('Error in optimal times check:', error);
      }
    });
    
    logger.info('Optimal posting times check scheduled');
  }

  /**
   * Schedule pending posts check (runs every 5 minutes)
   */
  schedulePendingPostsCheck() {
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.processPendingPosts();
      } catch (error) {
        logger.error('Error in pending posts check:', error);
      }
    });
    
    logger.info('Pending posts check scheduled');
  }

  /**
   * Check if current time matches optimal posting times
   */
  async checkOptimalPostingTimes() {
    const now = moment().tz(this.timezone);
    const currentTime = now.format('HH:mm');
    const currentDay = now.format('dddd').toLowerCase();
    
    // Skip weekends for business content
    if (currentDay === 'saturday' || currentDay === 'sunday') {
      return;
    }

    // Check if current time matches any optimal time
    const isOptimalTime = Object.values(this.optimalTimes).includes(currentTime);
    
    if (isOptimalTime) {
      logger.scheduling('Optimal posting time detected', {
        time: currentTime,
        timezone: this.timezone
      });
      
      await this.triggerOptimalTimePosts(currentTime);
    }
  }

  /**
   * Trigger posts scheduled for optimal times
   */
  async triggerOptimalTimePosts(optimalTime) {
    const client = await pool.connect();
    try {
      // Get users with auto-posting enabled for this time
      const result = await client.query(`
        SELECT DISTINCT sp.user_id, sp.id as scheduled_post_id, sp.content_id, sp.post_type
        FROM scheduled_posts sp
        JOIN user_preferences up ON up.user_id = sp.user_id
        WHERE sp.status = 'pending'
        AND sp.optimal_time = $1
        AND up.auto_posting = true
        AND sp.scheduled_for <= CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      `, [optimalTime]);

      for (const row of result.rows) {
        try {
          await this.executeScheduledPost(row.scheduled_post_id);
        } catch (error) {
          logger.error(`Failed to execute scheduled post ${row.scheduled_post_id}:`, error);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Process pending posts that are due
   */
  async processPendingPosts() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, user_id, content_id, scheduled_for, post_type
        FROM scheduled_posts
        WHERE status = 'pending'
        AND scheduled_for <= CURRENT_TIMESTAMP
        ORDER BY scheduled_for ASC
        LIMIT 10
      `);

      for (const post of result.rows) {
        try {
          await this.executeScheduledPost(post.id);
        } catch (error) {
          logger.error(`Failed to execute pending post ${post.id}:`, error);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Execute a scheduled post
   */
  async executeScheduledPost(scheduledPostId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get scheduled post details
      const postResult = await client.query(`
        SELECT sp.*, gc.content_text, gc.content_type, gc.hashtags
        FROM scheduled_posts sp
        JOIN generated_content gc ON gc.id = sp.content_id
        WHERE sp.id = $1 AND sp.status = 'pending'
      `, [scheduledPostId]);

      if (postResult.rows.length === 0) {
        logger.warning('Scheduled post not found or already processed', { scheduledPostId });
        return;
      }

      const scheduledPost = postResult.rows[0];
      
      // Check if user has valid LinkedIn connection
      const hasConnection = await linkedinAPI.hasValidConnection(scheduledPost.user_id);
      if (!hasConnection) {
        await this.markPostAsFailed(client, scheduledPostId, 'No valid LinkedIn connection');
        await client.query('COMMIT');
        return;
      }

      // Prepare content for posting
      const content = this.prepareContentForPosting(scheduledPost);
      
      // Post to LinkedIn
      const postResult = await linkedinAPI.postContent(scheduledPost.user_id, content);
      
      // Update scheduled post status
      await client.query(`
        UPDATE scheduled_posts
        SET status = 'posted',
            posted_at = CURRENT_TIMESTAMP,
            linkedin_post_id = $1,
            linkedin_post_url = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [postResult.id, postResult.url, scheduledPostId]);

      // Log analytics entry
      await client.query(`
        INSERT INTO post_analytics (user_id, linkedin_post_id, scheduled_post_id, post_type)
        VALUES ($1, $2, $3, $4)
      `, [scheduledPost.user_id, postResult.id, scheduledPostId, scheduledPost.post_type]);

      await client.query('COMMIT');
      
      logger.scheduling('Scheduled post executed successfully', {
        scheduledPostId,
        userId: scheduledPost.user_id,
        linkedinPostId: postResult.id
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      await this.markPostAsFailed(client, scheduledPostId, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Prepare content for LinkedIn posting
   */
  prepareContentForPosting(scheduledPost) {
    const contentData = JSON.parse(scheduledPost.content_text);
    
    const baseContent = {
      type: scheduledPost.content_type,
      text: contentData.content_text || contentData.text || ''
    };

    // Add hashtags if available
    if (contentData.hashtags && contentData.hashtags.length > 0) {
      baseContent.text += '\n\n' + contentData.hashtags.join(' ');
    }

    // Add type-specific content
    switch (scheduledPost.content_type) {
      case 'multi_image':
        baseContent.images = contentData.media_urls || [];
        baseContent.imageDescription = contentData.imageDescription || '';
        baseContent.imageTitle = contentData.imageTitle || '';
        break;
      case 'poll':
        baseContent.question = contentData.poll?.question || '';
        baseContent.options = contentData.poll?.options || [];
        break;
      case 'video':
        baseContent.videoUrl = contentData.media_urls?.[0] || '';
        baseContent.videoDescription = contentData.videoDescription || '';
        break;
    }

    return baseContent;
  }

  /**
   * Mark post as failed
   */
  async markPostAsFailed(client, scheduledPostId, errorMessage) {
    await client.query(`
      UPDATE scheduled_posts
      SET status = 'failed',
          error_message = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [errorMessage, scheduledPostId]);
  }

  /**
   * Schedule a new post
   */
  async schedulePost(userId, contentId, scheduledFor, postType = 'immediate', optimalTime = null) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO scheduled_posts (
          user_id, content_id, scheduled_for, post_type, optimal_time, status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING id
      `, [userId, contentId, scheduledFor, postType, optimalTime]);

      const scheduledPostId = result.rows[0].id;
      
      logger.scheduling('Post scheduled successfully', {
        scheduledPostId,
        userId,
        contentId,
        scheduledFor,
        postType
      });

      return scheduledPostId;
    } finally {
      client.release();
    }
  }

  /**
   * Schedule post for next optimal time
   */
  async scheduleForOptimalTime(userId, contentId, timeSlot = 'morning') {
    const optimalTime = this.optimalTimes[timeSlot];
    if (!optimalTime) {
      throw new Error(`Invalid time slot: ${timeSlot}`);
    }

    const scheduledFor = this.getNextOptimalDateTime(optimalTime);
    
    return await this.schedulePost(userId, contentId, scheduledFor, 'optimal', optimalTime);
  }

  /**
   * Get next optimal date/time
   */
  getNextOptimalDateTime(optimalTime) {
    const now = moment().tz(this.timezone);
    const [hours, minutes] = optimalTime.split(':').map(Number);
    
    let nextTime = now.clone().hours(hours).minutes(minutes).seconds(0).milliseconds(0);
    
    // If the time has passed today, schedule for tomorrow
    if (nextTime.isSameOrBefore(now)) {
      nextTime.add(1, 'day');
    }
    
    // Skip weekends
    while (nextTime.day() === 0 || nextTime.day() === 6) {
      nextTime.add(1, 'day');
    }
    
    return nextTime.toDate();
  }

  /**
   * Auto-generate and schedule content for user
   */
  async autoGenerateAndSchedule(userId, topicId, contentType = 'text', timeSlot = 'morning') {
    try {
      // Generate content
      const generatedContent = await contentGenerator.generateContent(userId, topicId, contentType);
      
      // Schedule for optimal time
      const scheduledPostId = await this.scheduleForOptimalTime(userId, generatedContent.id, timeSlot);
      
      logger.scheduling('Auto-generated content scheduled', {
        userId,
        contentId: generatedContent.id,
        scheduledPostId,
        timeSlot
      });
      
      return {
        contentId: generatedContent.id,
        scheduledPostId,
        scheduledFor: this.getNextOptimalDateTime(this.optimalTimes[timeSlot])
      };
    } catch (error) {
      logger.error('Failed to auto-generate and schedule content:', error);
      throw error;
    }
  }

  /**
   * Load existing scheduled posts on startup
   */
  async loadScheduledPosts() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, user_id, scheduled_for, post_type
        FROM scheduled_posts
        WHERE status = 'pending'
        AND scheduled_for > CURRENT_TIMESTAMP
      `);

      logger.info(`Loaded ${result.rows.length} pending scheduled posts`);
    } finally {
      client.release();
    }
  }

  /**
   * Get user's scheduled posts
   */
  async getUserScheduledPosts(userId, limit = 50) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT sp.*, gc.title, gc.content_type, ct.title as topic_title
        FROM scheduled_posts sp
        JOIN generated_content gc ON gc.id = sp.content_id
        LEFT JOIN content_topics ct ON ct.id = gc.topic_id
        WHERE sp.user_id = $1
        ORDER BY sp.scheduled_for DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel scheduled post
   */
  async cancelScheduledPost(userId, scheduledPostId) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        UPDATE scheduled_posts
        SET status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND status = 'pending'
        RETURNING id
      `, [scheduledPostId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Scheduled post not found or cannot be cancelled');
      }

      logger.scheduling('Scheduled post cancelled', {
        scheduledPostId,
        userId
      });

      return true;
    } finally {
      client.release();
    }
  }

  /**
   * Update scheduled post time
   */
  async updateScheduledPostTime(userId, scheduledPostId, newScheduledFor) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        UPDATE scheduled_posts
        SET scheduled_for = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3 AND status = 'pending'
        RETURNING id
      `, [newScheduledFor, scheduledPostId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Scheduled post not found or cannot be updated');
      }

      logger.scheduling('Scheduled post time updated', {
        scheduledPostId,
        userId,
        newScheduledFor
      });

      return true;
    } finally {
      client.release();
    }
  }

  /**
   * Get scheduling statistics
   */
  async getSchedulingStats(userId, days = 30) {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          status,
          COUNT(*) as count,
          post_type
        FROM scheduled_posts
        WHERE user_id = $1
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
        GROUP BY status, post_type
        ORDER BY status, post_type
      `, [userId]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.isRunning = false;
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs.clear();
    logger.info('Content scheduler stopped');
  }
}

module.exports = new ContentScheduler();