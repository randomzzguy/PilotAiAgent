const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { pool } = require('../database/init');
const contentGenerator = require('../services/contentGenerator');
const scheduler = require('../services/scheduler');
const logger = require('../utils/logger');
const { auth, checkPlanLimits, logAPIUsage } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and logging to all routes
router.use(auth);
router.use(logAPIUsage);

/**
 * @route GET /api/content/topics
 * @desc Get user's content topics
 * @access Private
 */
router.get('/topics',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim().isLength({ max: 100 })
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
      const search = req.query.search;

      const client = await pool.connect();
      try {
        let query = `
          SELECT ct.*, 
                 COUNT(gc.id) as content_count,
                 MAX(gc.created_at) as last_content_generated
          FROM content_topics ct
          LEFT JOIN generated_content gc ON gc.topic_id = ct.id
          WHERE ct.user_id = $1
        `;
        const params = [req.user.userId];
        let paramCount = 2;

        if (search) {
          query += ` AND (ct.title ILIKE $${paramCount} OR ct.description ILIKE $${paramCount})`;
          params.push(`%${search}%`);
          paramCount++;
        }

        query += `
          GROUP BY ct.id
          ORDER BY ct.created_at DESC
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM content_topics WHERE user_id = $1';
        const countParams = [req.user.userId];
        
        if (search) {
          countQuery += ' AND (title ILIKE $2 OR description ILIKE $2)';
          countParams.push(`%${search}%`);
        }
        
        const countResult = await client.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
          success: true,
          data: {
            topics: result.rows,
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
      logger.error('Failed to get content topics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve content topics'
      });
    }
  }
);

/**
 * @route POST /api/content/topics
 * @desc Create a new content topic
 * @access Private
 */
router.post('/topics',
  [
    body('title').trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('keywords').optional().isArray({ max: 20 }),
    body('keywords.*').optional().trim().isLength({ min: 1, max: 50 }),
    body('targetAudience').optional().trim().isLength({ max: 200 }),
    body('industry').optional().trim().isLength({ max: 100 }),
    body('isActive').optional().isBoolean()
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
        title,
        description,
        keywords = [],
        targetAudience,
        industry,
        isActive = true
      } = req.body;

      const client = await pool.connect();
      try {
        const result = await client.query(`
          INSERT INTO content_topics (
            user_id, title, description, keywords, target_audience, industry, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [req.user.userId, title, description, keywords, targetAudience, industry, isActive]);

        const topic = result.rows[0];

        logger.content('Content topic created', {
          userId: req.user.userId,
          topicId: topic.id,
          title
        });

        res.status(201).json({
          success: true,
          message: 'Content topic created successfully',
          data: { topic }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create content topic:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create content topic'
      });
    }
  }
);

/**
 * @route PUT /api/content/topics/:id
 * @desc Update a content topic
 * @access Private
 */
router.put('/topics/:id',
  [
    param('id').isUUID(),
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('keywords').optional().isArray({ max: 20 }),
    body('keywords.*').optional().trim().isLength({ min: 1, max: 50 }),
    body('targetAudience').optional().trim().isLength({ max: 200 }),
    body('industry').optional().trim().isLength({ max: 100 }),
    body('isActive').optional().isBoolean()
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

      const topicId = req.params.id;
      const updates = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic update query
      Object.keys(req.body).forEach(key => {
        const dbField = {
          title: 'title',
          description: 'description',
          keywords: 'keywords',
          targetAudience: 'target_audience',
          industry: 'industry',
          isActive: 'is_active'
        }[key];

        if (dbField && req.body[key] !== undefined) {
          updates.push(`${dbField} = $${paramCount++}`);
          values.push(req.body[key]);
        }
      });

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(topicId, req.user.userId);

      const client = await pool.connect();
      try {
        const result = await client.query(`
          UPDATE content_topics 
          SET ${updates.join(', ')}
          WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
          RETURNING *
        `, values);

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Content topic not found'
          });
        }

        const topic = result.rows[0];

        logger.content('Content topic updated', {
          userId: req.user.userId,
          topicId: topic.id
        });

        res.json({
          success: true,
          message: 'Content topic updated successfully',
          data: { topic }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update content topic:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update content topic'
      });
    }
  }
);

/**
 * @route DELETE /api/content/topics/:id
 * @desc Delete a content topic
 * @access Private
 */
router.delete('/topics/:id',
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topic ID'
        });
      }

      const topicId = req.params.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if topic has generated content
        const contentCheck = await client.query(
          'SELECT COUNT(*) FROM generated_content WHERE topic_id = $1',
          [topicId]
        );

        if (parseInt(contentCheck.rows[0].count) > 0) {
          // Soft delete - mark as inactive instead of deleting
          const result = await client.query(`
            UPDATE content_topics 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
            RETURNING *
          `, [topicId, req.user.userId]);

          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
              success: false,
              message: 'Content topic not found'
            });
          }

          await client.query('COMMIT');

          res.json({
            success: true,
            message: 'Content topic deactivated (has associated content)'
          });
        } else {
          // Hard delete - no associated content
          const result = await client.query(
            'DELETE FROM content_topics WHERE id = $1 AND user_id = $2 RETURNING id',
            [topicId, req.user.userId]
          );

          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
              success: false,
              message: 'Content topic not found'
            });
          }

          await client.query('COMMIT');

          res.json({
            success: true,
            message: 'Content topic deleted successfully'
          });
        }

        logger.content('Content topic deleted/deactivated', {
          userId: req.user.userId,
          topicId
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to delete content topic:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete content topic'
      });
    }
  }
);

/**
 * @route POST /api/content/generate
 * @desc Generate new content
 * @access Private
 */
router.post('/generate',
  checkPlanLimits('monthly_posts'),
  [
    body('topicId').isUUID(),
    body('contentType').isIn(['text', 'multi_image', 'video', 'poll', 'document']),
    body('customPrompt').optional().trim().isLength({ max: 2000 }),
    body('variations').optional().isInt({ min: 1, max: 5 }),
    body('includeImage').optional().isBoolean()
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

      const { topicId, contentType, customPrompt, variations = 1, includeImage = false } = req.body;

      // Verify topic belongs to user
      const client = await pool.connect();
      try {
        const topicCheck = await client.query(
          'SELECT id FROM content_topics WHERE id = $1 AND user_id = $2 AND is_active = true',
          [topicId, req.user.userId]
        );

        if (topicCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Content topic not found or inactive'
          });
        }
      } finally {
        client.release();
      }

      let generatedContent;
      
      if (variations > 1) {
        // Generate multiple variations
        generatedContent = await contentGenerator.generateMultipleVariations(
          req.user.userId,
          topicId,
          contentType,
          variations,
          includeImage
        );
      } else {
        // Generate single content
        generatedContent = await contentGenerator.generateContent(
          req.user.userId,
          topicId,
          contentType,
          customPrompt,
          includeImage
        );
      }

      logger.content('Content generated successfully', {
        userId: req.user.userId,
        topicId,
        contentType,
        variations: Array.isArray(generatedContent) ? generatedContent.length : 1
      });

      res.status(201).json({
        success: true,
        message: 'Content generated successfully',
        data: {
          content: generatedContent
        }
      });
    } catch (error) {
      logger.error('Content generation failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate content'
      });
    }
  }
);

/**
 * @route GET /api/content/generated
 * @desc Get user's generated content
 * @access Private
 */
router.get('/generated',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('status').optional().isIn(['draft', 'approved', 'scheduled', 'posted']),
    query('contentType').optional().isIn(['text', 'multi_image', 'video', 'poll', 'document']),
    query('topicId').optional().isUUID()
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
      const { status, contentType, topicId } = req.query;

      const client = await pool.connect();
      try {
        let query = `
          SELECT gc.*, ct.title as topic_title, ct.industry,
                 sp.id as scheduled_post_id, sp.scheduled_for, sp.status as schedule_status
          FROM generated_content gc
          LEFT JOIN content_topics ct ON ct.id = gc.topic_id
          LEFT JOIN scheduled_posts sp ON sp.content_id = gc.id
          WHERE gc.user_id = $1
        `;
        const params = [req.user.userId];
        let paramCount = 2;

        if (status) {
          query += ` AND gc.status = $${paramCount++}`;
          params.push(status);
        }

        if (contentType) {
          query += ` AND gc.content_type = $${paramCount++}`;
          params.push(contentType);
        }

        if (topicId) {
          query += ` AND gc.topic_id = $${paramCount++}`;
          params.push(topicId);
        }

        query += `
          ORDER BY gc.created_at DESC
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        params.push(limit, offset);

        const result = await client.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM generated_content WHERE user_id = $1';
        const countParams = [req.user.userId];
        let countParamIndex = 2;

        if (status) {
          countQuery += ` AND status = $${countParamIndex++}`;
          countParams.push(status);
        }
        if (contentType) {
          countQuery += ` AND content_type = $${countParamIndex++}`;
          countParams.push(contentType);
        }
        if (topicId) {
          countQuery += ` AND topic_id = $${countParamIndex++}`;
          countParams.push(topicId);
        }

        const countResult = await client.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        // Parse content_text JSON for each item
        const content = result.rows.map(row => ({
          ...row,
          content_data: typeof row.content_text === 'string' 
            ? JSON.parse(row.content_text) 
            : row.content_text
        }));

        res.json({
          success: true,
          data: {
            content,
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
      logger.error('Failed to get generated content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve generated content'
      });
    }
  }
);

/**
 * @route PUT /api/content/generated/:id
 * @desc Update generated content
 * @access Private
 */
router.put('/generated/:id',
  [
    param('id').isUUID(),
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('content').optional().isObject(),
    body('hashtags').optional().isArray({ max: 20 }),
    body('hashtags.*').optional().trim().isLength({ min: 1, max: 50 }),
    body('status').optional().isIn(['draft', 'approved', 'scheduled', 'posted'])
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

      const contentId = req.params.id;
      const { title, content, hashtags, status } = req.body;

      const client = await pool.connect();
      try {
        // Verify content belongs to user
        const contentCheck = await client.query(
          'SELECT id, status FROM generated_content WHERE id = $1 AND user_id = $2',
          [contentId, req.user.userId]
        );

        if (contentCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Content not found'
          });
        }

        const currentContent = contentCheck.rows[0];

        // Prevent editing posted content
        if (currentContent.status === 'posted') {
          return res.status(400).json({
            success: false,
            message: 'Cannot edit posted content'
          });
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (title !== undefined) {
          updates.push(`title = $${paramCount++}`);
          values.push(title);
        }

        if (content !== undefined) {
          updates.push(`content_text = $${paramCount++}`);
          values.push(JSON.stringify(content));
        }

        if (hashtags !== undefined) {
          updates.push(`hashtags = $${paramCount++}`);
          values.push(hashtags);
        }

        if (status !== undefined) {
          updates.push(`status = $${paramCount++}`);
          values.push(status);
        }

        if (updates.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No valid fields to update'
          });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(contentId, req.user.userId);

        const result = await client.query(`
          UPDATE generated_content 
          SET ${updates.join(', ')}
          WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
          RETURNING *
        `, values);

        const updatedContent = result.rows[0];

        logger.content('Generated content updated', {
          userId: req.user.userId,
          contentId
        });

        res.json({
          success: true,
          message: 'Content updated successfully',
          data: {
            content: {
              ...updatedContent,
              content_data: typeof updatedContent.content_text === 'string'
                ? JSON.parse(updatedContent.content_text)
                : updatedContent.content_text
            }
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update generated content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update content'
      });
    }
  }
);

/**
 * @route DELETE /api/content/generated/:id
 * @desc Delete generated content
 * @access Private
 */
router.delete('/generated/:id',
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid content ID'
        });
      }

      const contentId = req.params.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if content is scheduled or posted
        const statusCheck = await client.query(`
          SELECT gc.status, sp.id as scheduled_id
          FROM generated_content gc
          LEFT JOIN scheduled_posts sp ON sp.content_id = gc.id AND sp.status = 'pending'
          WHERE gc.id = $1 AND gc.user_id = $2
        `, [contentId, req.user.userId]);

        if (statusCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            message: 'Content not found'
          });
        }

        const contentData = statusCheck.rows[0];

        if (contentData.status === 'posted') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cannot delete posted content'
          });
        }

        if (contentData.scheduled_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Cannot delete content with pending scheduled posts. Cancel the scheduled post first.'
          });
        }

        // Delete the content
        await client.query(
          'DELETE FROM generated_content WHERE id = $1 AND user_id = $2',
          [contentId, req.user.userId]
        );

        await client.query('COMMIT');

        logger.content('Generated content deleted', {
          userId: req.user.userId,
          contentId
        });

        res.json({
          success: true,
          message: 'Content deleted successfully'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to delete generated content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete content'
      });
    }
  }
);

/**
 * @route POST /api/content/schedule
 * @desc Schedule content for posting
 * @access Private
 */
router.post('/schedule',
  checkPlanLimits('daily_scheduled'),
  [
    body('contentId').isUUID(),
    body('scheduledFor').optional().isISO8601(),
    body('timeSlot').optional().isIn(['morning', 'afternoon', 'evening']),
    body('postType').optional().isIn(['immediate', 'optimal'])
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

      const { contentId, scheduledFor, timeSlot = 'morning', postType = 'optimal' } = req.body;

      // Verify content belongs to user and is approved
      const client = await pool.connect();
      try {
        const contentCheck = await client.query(`
          SELECT id, status FROM generated_content 
          WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'approved')
        `, [contentId, req.user.userId]);

        if (contentCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Content not found or not available for scheduling'
          });
        }

        let scheduledPostId;

        if (postType === 'optimal') {
          // Schedule for next optimal time
          scheduledPostId = await scheduler.scheduleForOptimalTime(
            req.user.userId,
            contentId,
            timeSlot
          );
        } else {
          // Schedule for specific time
          if (!scheduledFor) {
            return res.status(400).json({
              success: false,
              message: 'scheduledFor is required for immediate scheduling'
            });
          }

          const scheduledDate = new Date(scheduledFor);
          if (scheduledDate <= new Date()) {
            return res.status(400).json({
              success: false,
              message: 'Scheduled time must be in the future'
            });
          }

          scheduledPostId = await scheduler.schedulePost(
            req.user.userId,
            contentId,
            scheduledDate,
            'immediate'
          );
        }

        // Update content status
        await client.query(
          'UPDATE generated_content SET status = $1 WHERE id = $2',
          ['scheduled', contentId]
        );

        logger.content('Content scheduled successfully', {
          userId: req.user.userId,
          contentId,
          scheduledPostId,
          postType,
          timeSlot
        });

        res.status(201).json({
          success: true,
          message: 'Content scheduled successfully',
          data: {
            scheduledPostId,
            scheduledFor: postType === 'optimal' 
              ? scheduler.getNextOptimalDateTime(scheduler.optimalTimes[timeSlot])
              : scheduledFor
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to schedule content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to schedule content'
      });
    }
  }
);

module.exports = router;