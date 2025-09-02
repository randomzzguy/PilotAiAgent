const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { pool } = require('../database/init');
const scheduler = require('../services/scheduler');
const logger = require('../utils/logger');
const { auth, requireLinkedInConnection, checkPlanLimits, logAPIUsage } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and logging to all routes
router.use(auth);
router.use(logAPIUsage);

/**
 * @route GET /api/scheduling/posts
 * @desc Get user's scheduled posts
 * @access Private
 */
router.get('/posts',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('status').optional().isIn(['pending', 'posted', 'failed', 'cancelled']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const offset = (page - 1) * limit;
      const { status, from, to } = req.query;

      const client = await pool.connect();
      try {
        let query = `
          SELECT sp.*, gc.title, gc.content_type, gc.hashtags,
                 ct.title as topic_title, ct.industry
          FROM scheduled_posts sp
          LEFT JOIN generated_content gc ON gc.id = sp.content_id
          LEFT JOIN content_topics ct ON ct.id = gc.topic_id
          WHERE sp.user_id = $1
        `;
        const params = [req.user.userId];
        let paramCount = 2;

        if (status) {
          query += ` AND sp.status = $${paramCount++}`;
          params.push(status);
        }

        if (from) {
          query += ` AND sp.scheduled_for >= $${paramCount++}`;
          params.push(from);
        }

        if (to) {
          query += ` AND sp.scheduled_for <= $${paramCount++}`;
          params.push(to);
        }

        query += `
          ORDER BY sp.scheduled_for ASC
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM scheduled_posts WHERE user_id = $1';
        const countParams = [req.user.userId];
        let countParamIndex = 2;

        if (status) {
          countQuery += ` AND status = $${countParamIndex++}`;
          countParams.push(status);
        }
        if (from) {
          countQuery += ` AND scheduled_for >= $${countParamIndex++}`;
          countParams.push(from);
        }
        if (to) {
          countQuery += ` AND scheduled_for <= $${countParamIndex++}`;
          countParams.push(to);
        }

        const countResult = await client.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
          success: true,
          data: {
            posts: result.rows,
            pagination: {
              page,
              limit,
              total: totalCount,
              pages: Math.ceil(totalCount / limit)
            }
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get scheduled posts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve scheduled posts'
      });
    }
  }
);

/**
 * @route GET /api/scheduling/posts/:id
 * @desc Get specific scheduled post details
 * @access Private
 */
router.get('/posts/:id',
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid post ID'
        });
      }

      const postId = req.params.id;

      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT sp.*, gc.title, gc.content_text, gc.content_type, gc.hashtags,
                 ct.title as topic_title, ct.description as topic_description,
                 ct.industry, ct.target_audience
          FROM scheduled_posts sp
          LEFT JOIN generated_content gc ON gc.id = sp.content_id
          LEFT JOIN content_topics ct ON ct.id = gc.topic_id
          WHERE sp.id = $1 AND sp.user_id = $2
        `, [postId, req.user.userId]);

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Scheduled post not found'
          });
        }

        const post = result.rows[0];

        // Parse content_text if it's a JSON string
        if (post.content_text) {
          post.content_data = typeof post.content_text === 'string'
            ? JSON.parse(post.content_text)
            : post.content_text;
          delete post.content_text;
        }

        res.json({
          success: true,
          data: { post }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get scheduled post:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve scheduled post'
      });
    }
  }
);

/**
 * @route PUT /api/scheduling/posts/:id
 * @desc Update scheduled post
 * @access Private
 */
router.put('/posts/:id',
  [
    param('id').isUUID(),
    body('scheduledFor').optional().isISO8601(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('notes').optional().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const postId = req.params.id;
      const { scheduledFor, priority, notes } = req.body;

      const client = await pool.connect();
      try {
        // Check if post exists and is pending
        const postCheck = await client.query(
          'SELECT id, status, scheduled_for FROM scheduled_posts WHERE id = $1 AND user_id = $2',
          [postId, req.user.userId]
        );

        if (postCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Scheduled post not found'
          });
        }

        const currentPost = postCheck.rows[0];

        if (currentPost.status !== 'pending') {
          return res.status(400).json({
            success: false,
            message: 'Can only update pending scheduled posts'
          });
        }

        // Validate new scheduled time
        if (scheduledFor) {
          const newScheduledDate = new Date(scheduledFor);
          if (newScheduledDate <= new Date()) {
            return res.status(400).json({
              success: false,
              message: 'Scheduled time must be in the future'
            });
          }
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (scheduledFor !== undefined) {
          updates.push(`scheduled_for = $${paramCount++}`);
          values.push(scheduledFor);
        }

        if (priority !== undefined) {
          updates.push(`priority = $${paramCount++}`);
          values.push(priority);
        }

        if (notes !== undefined) {
          updates.push(`notes = $${paramCount++}`);
          values.push(notes);
        }

        if (updates.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No valid fields to update'
          });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(postId, req.user.userId);

        const result = await client.query(`
          UPDATE scheduled_posts 
          SET ${updates.join(', ')}
          WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
          RETURNING *
        `, values);

        const updatedPost = result.rows[0];

        // If scheduled time changed, update the cron job
        if (scheduledFor && scheduledFor !== currentPost.scheduled_for.toISOString()) {
          await scheduler.reschedulePost(postId, new Date(scheduledFor));
        }

        logger.scheduling('Scheduled post updated', {
          userId: req.user.userId,
          postId,
          changes: Object.keys(req.body)
        });

        res.json({
          success: true,
          message: 'Scheduled post updated successfully',
          data: { post: updatedPost }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update scheduled post:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update scheduled post'
      });
    }
  }
);

/**
 * @route DELETE /api/scheduling/posts/:id
 * @desc Cancel/delete scheduled post
 * @access Private
 */
router.delete('/posts/:id',
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid post ID'
        });
      }

      const postId = req.params.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if post exists and get its status
        const postCheck = await client.query(
          'SELECT id, status, content_id FROM scheduled_posts WHERE id = $1 AND user_id = $2',
          [postId, req.user.userId]
        );

        if (postCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: 'Scheduled post not found'
          });
        }

        const post = postCheck.rows[0];

        if (post.status === 'posted') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cannot cancel already posted content'
          });
        }

        // Update post status to cancelled
        await client.query(
          'UPDATE scheduled_posts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['cancelled', postId]
        );

        // Update content status back to approved if it was scheduled
        if (post.content_id) {
          await client.query(
            'UPDATE generated_content SET status = $1 WHERE id = $2',
            ['approved', post.content_id]
          );
        }

        await client.query('COMMIT');

        // Cancel the cron job
        await scheduler.cancelScheduledPost(postId);

        logger.scheduling('Scheduled post cancelled', {
          userId: req.user.userId,
          postId
        });

        res.json({
          success: true,
          message: 'Scheduled post cancelled successfully'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to cancel scheduled post:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel scheduled post'
      });
    }
  }
);

/**
 * @route POST /api/scheduling/auto-schedule
 * @desc Auto-schedule content for optimal times
 * @access Private
 */
router.post('/auto-schedule',
  requireLinkedInConnection,
  checkPlanLimits('daily_scheduled'),
  [
    body('topicIds').optional().isArray({ max: 10 }),
    body('topicIds.*').optional().isUUID(),
    body('contentTypes').optional().isArray({ max: 5 }),
    body('contentTypes.*').optional().isIn(['text', 'multi_image', 'video', 'poll', 'document']),
    body('timeSlots').optional().isArray({ max: 3 }),
    body('timeSlots.*').optional().isIn(['morning', 'afternoon', 'evening']),
    body('daysAhead').optional().isInt({ min: 1, max: 30 }),
    body('postsPerDay').optional().isInt({ min: 1, max: 5 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        topicIds = [],
        contentTypes = ['text', 'multi_image'],
        timeSlots = ['morning', 'afternoon'],
        daysAhead = 7,
        postsPerDay = 1
      } = req.body;

      const client = await pool.connect();
      try {
        // Get user's active topics if none specified
        let finalTopicIds = topicIds;
        if (finalTopicIds.length === 0) {
          const topicsResult = await client.query(
            'SELECT id FROM content_topics WHERE user_id = $1 AND is_active = true LIMIT 5',
            [req.user.userId]
          );
          finalTopicIds = topicsResult.rows.map(row => row.id);
        }

        if (finalTopicIds.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No active content topics found. Please create topics first.'
          });
        }

        // Generate and schedule content
        const scheduledPosts = await scheduler.autoGenerateAndSchedule(
          req.user.userId,
          {
            topicIds: finalTopicIds,
            contentTypes,
            timeSlots,
            daysAhead,
            postsPerDay
          }
        );

        logger.scheduling('Auto-scheduling completed', {
          userId: req.user.userId,
          scheduledCount: scheduledPosts.length,
          daysAhead,
          postsPerDay
        });

        res.status(201).json({
          success: true,
          message: `Successfully scheduled ${scheduledPosts.length} posts`,
          data: {
            scheduledPosts: scheduledPosts.map(post => ({
              id: post.id,
              scheduledFor: post.scheduled_for,
              contentType: post.content_type,
              topicTitle: post.topic_title
            }))
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Auto-scheduling failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to auto-schedule content'
      });
    }
  }
);

/**
 * @route GET /api/scheduling/optimal-times
 * @desc Get optimal posting times for Abu Dhabi
 * @access Private
 */
router.get('/optimal-times', async (req, res) => {
  try {
    const optimalTimes = {
      timezone: 'Asia/Dubai',
      weekdays: {
        morning: {
          time: '08:00',
          description: 'Peak professional engagement time in Abu Dhabi'
        },
        afternoon: {
          time: '13:30',
          description: 'Lunch break engagement window'
        },
        evening: {
          time: '19:00',
          description: 'After-work social media activity'
        }
      },
      weekends: {
        morning: {
          time: '10:00',
          description: 'Weekend leisure browsing time'
        },
        afternoon: {
          time: '15:00',
          description: 'Weekend afternoon engagement'
        },
        evening: {
          time: '20:00',
          description: 'Weekend evening social activity'
        }
      },
      specialConsiderations: [
        'During Ramadan, optimal times shift to 22:00-01:00 and 03:00-05:00',
        'UAE National Day and other holidays may affect engagement patterns',
        'Business content performs better on weekdays 08:00-17:00',
        'Personal/lifestyle content performs better on weekends'
      ]
    };

    // Get next few optimal posting times
    const nextOptimalTimes = [];
    const now = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      
      const isWeekend = date.getDay() === 5 || date.getDay() === 6; // Friday or Saturday in UAE
      const times = isWeekend ? optimalTimes.weekends : optimalTimes.weekdays;
      
      Object.entries(times).forEach(([slot, timeInfo]) => {
        const [hours, minutes] = timeInfo.time.split(':').map(Number);
        const scheduledTime = new Date(date);
        scheduledTime.setHours(hours, minutes, 0, 0);
        
        if (scheduledTime > now) {
          nextOptimalTimes.push({
            datetime: scheduledTime.toISOString(),
            slot,
            dayType: isWeekend ? 'weekend' : 'weekday',
            description: timeInfo.description
          });
        }
      });
    }

    // Sort by datetime and take next 10
    nextOptimalTimes.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    
    res.json({
      success: true,
      data: {
        optimalTimes,
        nextOptimalTimes: nextOptimalTimes.slice(0, 10)
      }
    });
  } catch (error) {
    logger.error('Failed to get optimal times:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve optimal times'
    });
  }
});

/**
 * @route GET /api/scheduling/stats
 * @desc Get scheduling statistics
 * @access Private
 */
router.get('/stats',
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { period = 'month', from, to } = req.query;

      // Calculate date range
      let startDate, endDate;
      if (from && to) {
        startDate = new Date(from);
        endDate = new Date(to);
      } else {
        endDate = new Date();
        startDate = new Date();
        
        switch (period) {
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          case 'quarter':
            startDate.setMonth(startDate.getMonth() - 3);
            break;
          case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        }
      }

      const client = await pool.connect();
      try {
        // Get overall stats
        const overallStats = await client.query(`
          SELECT 
            COUNT(*) as total_scheduled,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
            COUNT(CASE WHEN status = 'posted' THEN 1 END) as posted,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
            COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
          FROM scheduled_posts 
          WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
        `, [req.user.userId, startDate, endDate]);

        // Get posts by content type
        const contentTypeStats = await client.query(`
          SELECT gc.content_type, COUNT(*) as count
          FROM scheduled_posts sp
          LEFT JOIN generated_content gc ON gc.id = sp.content_id
          WHERE sp.user_id = $1 AND sp.created_at BETWEEN $2 AND $3
          GROUP BY gc.content_type
          ORDER BY count DESC
        `, [req.user.userId, startDate, endDate]);

        // Get posts by time slot
        const timeSlotStats = await client.query(`
          SELECT 
            CASE 
              WHEN EXTRACT(HOUR FROM scheduled_for) BETWEEN 6 AND 11 THEN 'morning'
              WHEN EXTRACT(HOUR FROM scheduled_for) BETWEEN 12 AND 17 THEN 'afternoon'
              WHEN EXTRACT(HOUR FROM scheduled_for) BETWEEN 18 AND 23 THEN 'evening'
              ELSE 'night'
            END as time_slot,
            COUNT(*) as count
          FROM scheduled_posts 
          WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
          GROUP BY time_slot
          ORDER BY count DESC
        `, [req.user.userId, startDate, endDate]);

        // Get daily posting pattern
        const dailyPattern = await client.query(`
          SELECT 
            DATE(scheduled_for) as post_date,
            COUNT(*) as posts_count
          FROM scheduled_posts 
          WHERE user_id = $1 AND scheduled_for BETWEEN $2 AND $3
          GROUP BY DATE(scheduled_for)
          ORDER BY post_date
        `, [req.user.userId, startDate, endDate]);

        // Get upcoming posts count
        const upcomingPosts = await client.query(`
          SELECT COUNT(*) as count
          FROM scheduled_posts 
          WHERE user_id = $1 AND status = 'pending' AND scheduled_for > NOW()
        `, [req.user.userId]);

        res.json({
          success: true,
          data: {
            period: {
              from: startDate.toISOString(),
              to: endDate.toISOString(),
              type: period
            },
            overall: overallStats.rows[0],
            contentTypes: contentTypeStats.rows,
            timeSlots: timeSlotStats.rows,
            dailyPattern: dailyPattern.rows,
            upcomingPosts: parseInt(upcomingPosts.rows[0].count)
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get scheduling stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve scheduling statistics'
      });
    }
  }
);

/**
 * @route POST /api/scheduling/bulk-action
 * @desc Perform bulk actions on scheduled posts
 * @access Private
 */
router.post('/bulk-action',
  [
    body('action').isIn(['cancel', 'reschedule', 'change_priority']),
    body('postIds').isArray({ min: 1, max: 50 }),
    body('postIds.*').isUUID(),
    body('newScheduledFor').optional().isISO8601(),
    body('newPriority').optional().isIn(['low', 'medium', 'high'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { action, postIds, newScheduledFor, newPriority } = req.body;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Verify all posts belong to user and are pending
        const postsCheck = await client.query(`
          SELECT id, status FROM scheduled_posts 
          WHERE id = ANY($1) AND user_id = $2
        `, [postIds, req.user.userId]);

        if (postsCheck.rows.length !== postIds.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Some posts not found or do not belong to user'
          });
        }

        const nonPendingPosts = postsCheck.rows.filter(post => post.status !== 'pending');
        if (nonPendingPosts.length > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Can only perform bulk actions on pending posts'
          });
        }

        let updateQuery;
        let updateParams;
        let successMessage;

        switch (action) {
          case 'cancel':
            updateQuery = `
              UPDATE scheduled_posts 
              SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
              WHERE id = ANY($1) AND user_id = $2
            `;
            updateParams = [postIds, req.user.userId];
            successMessage = 'Posts cancelled successfully';
            break;

          case 'reschedule':
            if (!newScheduledFor) {
              await client.query('ROLLBACK');
              return res.status(400).json({
                success: false,
                message: 'newScheduledFor is required for reschedule action'
              });
            }

            const newDate = new Date(newScheduledFor);
            if (newDate <= new Date()) {
              await client.query('ROLLBACK');
              return res.status(400).json({
                success: false,
                message: 'New scheduled time must be in the future'
              });
            }

            updateQuery = `
              UPDATE scheduled_posts 
              SET scheduled_for = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ANY($2) AND user_id = $3
            `;
            updateParams = [newScheduledFor, postIds, req.user.userId];
            successMessage = 'Posts rescheduled successfully';
            break;

          case 'change_priority':
            if (!newPriority) {
              await client.query('ROLLBACK');
              return res.status(400).json({
                success: false,
                message: 'newPriority is required for change_priority action'
              });
            }

            updateQuery = `
              UPDATE scheduled_posts 
              SET priority = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ANY($2) AND user_id = $3
            `;
            updateParams = [newPriority, postIds, req.user.userId];
            successMessage = 'Post priorities updated successfully';
            break;
        }

        await client.query(updateQuery, updateParams);
        await client.query('COMMIT');

        // Handle scheduler updates for cancelled/rescheduled posts
        if (action === 'cancel') {
          for (const postId of postIds) {
            await scheduler.cancelScheduledPost(postId);
          }
        } else if (action === 'reschedule') {
          for (const postId of postIds) {
            await scheduler.reschedulePost(postId, new Date(newScheduledFor));
          }
        }

        logger.scheduling('Bulk action performed', {
          userId: req.user.userId,
          action,
          postCount: postIds.length
        });

        res.json({
          success: true,
          message: successMessage,
          data: {
            affectedPosts: postIds.length
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Bulk action failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform bulk action'
      });
    }
  }
);

module.exports = router;