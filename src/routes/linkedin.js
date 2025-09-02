const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { pool } = require('../database/init');
const linkedinAPI = require('../services/linkedinAPI');
const logger = require('../utils/logger');
const { auth, requireLinkedInConnection, logAPIUsage, checkPlanLimits } = require('../middleware/auth');

const router = express.Router();

// Apply authentication and logging to all routes
router.use(auth);
router.use(logAPIUsage);

/**
 * @route GET /api/linkedin/auth/url
 * @desc Get LinkedIn OAuth authorization URL
 * @access Private
 */
router.get('/auth/url', async (req, res) => {
  try {
    const authUrl = linkedinAPI.getAuthorizationUrl(req.user.userId);
    
    res.json({
      success: true,
      data: {
        authUrl,
        message: 'Visit this URL to authorize LinkedIn access'
      }
    });
  } catch (error) {
    logger.error('Failed to generate LinkedIn auth URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL'
    });
  }
});

/**
 * @route POST /api/linkedin/auth/callback
 * @desc Handle LinkedIn OAuth callback
 * @access Private
 */
router.post('/auth/callback',
  [
    body('code').notEmpty().withMessage('Authorization code is required'),
    body('state').optional().isString()
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

      const { code, state } = req.body;

      // Exchange code for access token
      const tokenData = await linkedinAPI.exchangeCodeForToken(code, state);
      
      // Get user profile to verify connection
      const profile = await linkedinAPI.getUserProfile(tokenData.access_token);
      
      // Store tokens in database
      await linkedinAPI.storeUserTokens(req.user.userId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope
      });

      logger.linkedin('LinkedIn account connected', {
        userId: req.user.userId,
        linkedinId: profile.id,
        profileName: `${profile.firstName} ${profile.lastName}`
      });

      res.json({
        success: true,
        message: 'LinkedIn account connected successfully',
        data: {
          profile: {
            id: profile.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            profilePicture: profile.profilePicture
          },
          connectedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('LinkedIn OAuth callback failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to connect LinkedIn account'
      });
    }
  }
);

/**
 * @route GET /api/linkedin/profile
 * @desc Get connected LinkedIn profile information
 * @access Private
 */
router.get('/profile', requireLinkedInConnection, async (req, res) => {
  try {
    const profile = await linkedinAPI.getUserProfile(req.user.userId);
    
    res.json({
      success: true,
      data: {
        profile: {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          headline: profile.headline,
          profilePicture: profile.profilePicture,
          industry: profile.industry,
          location: profile.location,
          connections: profile.numConnections
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get LinkedIn profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve LinkedIn profile'
    });
  }
});

/**
 * @route POST /api/linkedin/post
 * @desc Create and publish a LinkedIn post
 * @access Private
 */
router.post('/post',
  requireLinkedInConnection,
  checkPlanLimits('posts'),
  [
    body('contentId').optional().isUUID().withMessage('Invalid content ID'),
    body('content').optional().isObject().withMessage('Content must be an object'),
    body('contentType').isIn(['text', 'image', 'video', 'poll', 'document']).withMessage('Invalid content type'),
    body('visibility').optional().isIn(['PUBLIC', 'CONNECTIONS']).withMessage('Invalid visibility setting')
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

      const { contentId, content, contentType, visibility = 'PUBLIC' } = req.body;

      let postContent;
      let generatedContentId = contentId;

      if (contentId) {
        // Use existing generated content
        const client = await pool.connect();
        try {
          const contentResult = await client.query(
            'SELECT * FROM generated_content WHERE id = $1 AND user_id = $2',
            [contentId, req.user.userId]
          );

          if (contentResult.rows.length === 0) {
            return res.status(404).json({
              success: false,
              message: 'Content not found'
            });
          }

          const contentData = contentResult.rows[0];
          postContent = {
            type: contentData.content_type,
            data: typeof contentData.content_text === 'string' 
              ? JSON.parse(contentData.content_text) 
              : contentData.content_text
          };
        } finally {
          client.release();
        }
      } else if (content) {
        // Use provided content directly
        postContent = {
          type: contentType,
          data: content
        };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Either contentId or content must be provided'
        });
      }

      // Create post on LinkedIn
      let postResult;
      switch (postContent.type) {
        case 'text':
          postResult = await linkedinAPI.createTextPost(
            req.user.userId,
            postContent.data.text,
            visibility
          );
          break;
        case 'image':
          postResult = await linkedinAPI.createImagePost(
            req.user.userId,
            postContent.data.text,
            postContent.data.images,
            visibility
          );
          break;
        case 'poll':
          postResult = await linkedinAPI.createPollPost(
            req.user.userId,
            postContent.data.question,
            postContent.data.options,
            postContent.data.duration || 7,
            visibility
          );
          break;
        default:
          return res.status(400).json({
            success: false,
            message: `Content type '${postContent.type}' not yet supported for direct posting`
          });
      }

      // Store analytics record
      const client = await pool.connect();
      try {
        const analyticsResult = await client.query(`
          INSERT INTO analytics (
            id, user_id, content_id, linkedin_post_id, 
            likes, comments, shares, impressions
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, 0, 0, 0, 0
          ) RETURNING id
        `, [req.user.userId, generatedContentId, postResult.id]);

        // Update scheduled post if it exists
        if (generatedContentId) {
          await client.query(`
            UPDATE scheduled_posts 
            SET 
              status = 'posted',
              posted_at = CURRENT_TIMESTAMP,
              linkedin_post_id = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE content_id = $2 AND user_id = $3 AND status = 'scheduled'
          `, [postResult.id, generatedContentId, req.user.userId]);
        }

        logger.linkedin('Post published successfully', {
          userId: req.user.userId,
          contentId: generatedContentId,
          linkedinPostId: postResult.id,
          contentType: postContent.type
        });

        res.json({
          success: true,
          message: 'Post published successfully',
          data: {
            linkedinPostId: postResult.id,
            analyticsId: analyticsResult.rows[0].id,
            publishedAt: new Date().toISOString(),
            visibility,
            contentType: postContent.type
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to publish LinkedIn post:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to publish post'
      });
    }
  }
);

/**
 * @route GET /api/linkedin/posts
 * @desc Get user's LinkedIn posts with analytics
 * @access Private
 */
router.get('/posts',
  requireLinkedInConnection,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('from').optional().isISO8601().withMessage('Invalid from date'),
    query('to').optional().isISO8601().withMessage('Invalid to date')
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
        limit = 20, 
        offset = 0, 
        from, 
        to 
      } = req.query;

      const client = await pool.connect();
      try {
        let whereClause = 'WHERE a.user_id = $1';
        let params = [req.user.userId];
        let paramIndex = 2;

        if (from) {
          whereClause += ` AND a.created_at >= $${paramIndex}`;
          params.push(new Date(from));
          paramIndex++;
        }

        if (to) {
          whereClause += ` AND a.created_at <= $${paramIndex}`;
          params.push(new Date(to));
          paramIndex++;
        }

        const postsResult = await client.query(`
          SELECT 
            a.*,
            gc.title,
            gc.content_type,
            gc.hashtags,
            ct.title as topic_title,
            sp.scheduled_for,
            sp.posted_at,
            (
              CASE 
                WHEN COALESCE(a.impressions, 0) > 0 
                THEN ((COALESCE(a.likes, 0) + COALESCE(a.comments, 0) + COALESCE(a.shares, 0)) * 100.0 / a.impressions)
                ELSE 0 
              END
            ) as engagement_rate
          FROM analytics a
          LEFT JOIN generated_content gc ON gc.id = a.content_id
          LEFT JOIN content_topics ct ON ct.id = gc.topic_id
          LEFT JOIN scheduled_posts sp ON sp.content_id = gc.id
          ${whereClause}
          ORDER BY a.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, [...params, limit, offset]);

        const totalResult = await client.query(`
          SELECT COUNT(*) as total
          FROM analytics a
          ${whereClause}
        `, params.slice(0, -2)); // Remove limit and offset from params

        const posts = postsResult.rows.map(row => ({
          id: row.id,
          linkedinPostId: row.linkedin_post_id,
          title: row.title,
          contentType: row.content_type,
          hashtags: row.hashtags,
          topicTitle: row.topic_title,
          metrics: {
            likes: row.likes || 0,
            comments: row.comments || 0,
            shares: row.shares || 0,
            impressions: row.impressions || 0,
            engagementRate: parseFloat(row.engagement_rate) || 0,
            clickThroughRate: row.click_through_rate || 0
          },
          scheduledFor: row.scheduled_for,
          postedAt: row.posted_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));

        res.json({
          success: true,
          data: {
            posts,
            pagination: {
              total: parseInt(totalResult.rows[0].total),
              limit: parseInt(limit),
              offset: parseInt(offset),
              hasMore: parseInt(offset) + parseInt(limit) < parseInt(totalResult.rows[0].total)
            }
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get LinkedIn posts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve LinkedIn posts'
      });
    }
  }
);

/**
 * @route GET /api/linkedin/posts/:id/analytics
 * @desc Get detailed analytics for a specific LinkedIn post
 * @access Private
 */
router.get('/posts/:id/analytics',
  requireLinkedInConnection,
  [param('id').notEmpty().withMessage('Post ID is required')],
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

      const linkedinPostId = req.params.id;

      // Fetch fresh analytics from LinkedIn
      const freshAnalytics = await linkedinAPI.getPostAnalytics(
        req.user.userId,
        linkedinPostId
      );

      // Update analytics in database
      const client = await pool.connect();
      try {
        const updateResult = await client.query(`
          UPDATE analytics 
          SET 
            likes = $1,
            comments = $2,
            shares = $3,
            impressions = $4,
            click_through_rate = $5,
            updated_at = CURRENT_TIMESTAMP
          WHERE linkedin_post_id = $6 AND user_id = $7
          RETURNING *
        `, [
          freshAnalytics.likes,
          freshAnalytics.comments,
          freshAnalytics.shares,
          freshAnalytics.impressions,
          freshAnalytics.clickThroughRate,
          linkedinPostId,
          req.user.userId
        ]);

        if (updateResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Post not found'
          });
        }

        const analytics = updateResult.rows[0];
        const engagementRate = analytics.impressions > 0 
          ? ((analytics.likes + analytics.comments + analytics.shares) * 100 / analytics.impressions)
          : 0;

        res.json({
          success: true,
          data: {
            linkedinPostId,
            metrics: {
              likes: analytics.likes || 0,
              comments: analytics.comments || 0,
              shares: analytics.shares || 0,
              impressions: analytics.impressions || 0,
              engagementRate: parseFloat(engagementRate.toFixed(2)),
              clickThroughRate: analytics.click_through_rate || 0
            },
            lastUpdated: analytics.updated_at
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get post analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve post analytics'
      });
    }
  }
);

/**
 * @route POST /api/linkedin/upload/image
 * @desc Upload image for LinkedIn posts
 * @access Private
 */
router.post('/upload/image',
  requireLinkedInConnection,
  checkPlanLimits('uploads'),
  [
    body('imageUrl').optional().isURL().withMessage('Invalid image URL'),
    body('imageBase64').optional().isString().withMessage('Invalid base64 image data'),
    body('filename').optional().isString().withMessage('Filename must be a string')
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

      const { imageUrl, imageBase64, filename } = req.body;

      if (!imageUrl && !imageBase64) {
        return res.status(400).json({
          success: false,
          message: 'Either imageUrl or imageBase64 must be provided'
        });
      }

      let uploadResult;
      if (imageUrl) {
        uploadResult = await linkedinAPI.uploadImageFromUrl(
          req.user.userId,
          imageUrl,
          filename
        );
      } else {
        uploadResult = await linkedinAPI.uploadImageFromBase64(
          req.user.userId,
          imageBase64,
          filename || 'image.jpg'
        );
      }

      logger.linkedin('Image uploaded successfully', {
        userId: req.user.userId,
        assetId: uploadResult.asset,
        filename: filename || 'image.jpg'
      });

      res.json({
        success: true,
        message: 'Image uploaded successfully',
        data: {
          assetId: uploadResult.asset,
          uploadUrl: uploadResult.uploadUrl,
          filename: filename || 'image.jpg',
          uploadedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to upload image:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload image'
      });
    }
  }
);

/**
 * @route DELETE /api/linkedin/auth/disconnect
 * @desc Disconnect LinkedIn account
 * @access Private
 */
router.delete('/auth/disconnect', requireLinkedInConnection, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      // Remove LinkedIn tokens
      await client.query(
        'DELETE FROM linkedin_tokens WHERE user_id = $1',
        [req.user.userId]
      );

      // Cancel all scheduled posts
      await client.query(`
        UPDATE scheduled_posts 
        SET 
          status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'scheduled'
      `, [req.user.userId]);

      logger.linkedin('LinkedIn account disconnected', {
        userId: req.user.userId
      });

      res.json({
        success: true,
        message: 'LinkedIn account disconnected successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to disconnect LinkedIn account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect LinkedIn account'
    });
  }
});

/**
 * @route GET /api/linkedin/connection/status
 * @desc Check LinkedIn connection status
 * @access Private
 */
router.get('/connection/status', async (req, res) => {
  try {
    const isConnected = await linkedinAPI.validateAccessToken(req.user.userId);
    
    let profile = null;
    if (isConnected) {
      try {
        profile = await linkedinAPI.getUserProfile(req.user.userId);
      } catch (error) {
        logger.warning('Failed to fetch profile for connected account:', error);
      }
    }

    res.json({
      success: true,
      data: {
        isConnected,
        profile: profile ? {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          profilePicture: profile.profilePicture
        } : null,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to check LinkedIn connection status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check connection status'
    });
  }
});

/**
 * @route GET /api/linkedin/insights
 * @desc Get LinkedIn posting insights and recommendations
 * @access Private
 */
router.get('/insights', requireLinkedInConnection, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      // Get posting patterns
      const postingPatterns = await client.query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          EXTRACT(DOW FROM created_at) as day_of_week,
          COUNT(*) as post_count,
          AVG(
            CASE 
              WHEN COALESCE(impressions, 0) > 0 
              THEN ((COALESCE(likes, 0) + COALESCE(comments, 0) + COALESCE(shares, 0)) * 100.0 / impressions)
              ELSE 0 
            END
          ) as avg_engagement_rate
        FROM analytics 
        WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM created_at), EXTRACT(DOW FROM created_at)
        HAVING COUNT(*) >= 2
        ORDER BY avg_engagement_rate DESC
      `, [req.user.userId]);

      // Get content type performance
      const contentPerformance = await client.query(`
        SELECT 
          gc.content_type,
          COUNT(*) as post_count,
          AVG(
            CASE 
              WHEN COALESCE(a.impressions, 0) > 0 
              THEN ((COALESCE(a.likes, 0) + COALESCE(a.comments, 0) + COALESCE(a.shares, 0)) * 100.0 / a.impressions)
              ELSE 0 
            END
          ) as avg_engagement_rate,
          AVG(COALESCE(a.impressions, 0)) as avg_impressions
        FROM analytics a
        LEFT JOIN generated_content gc ON gc.id = a.content_id
        WHERE a.user_id = $1 AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY gc.content_type
        ORDER BY avg_engagement_rate DESC
      `, [req.user.userId]);

      // Generate recommendations
      const recommendations = [];
      
      if (postingPatterns.rows.length > 0) {
        const bestTime = postingPatterns.rows[0];
        recommendations.push({
          type: 'timing',
          title: 'Optimal Posting Time',
          description: `Your posts perform best on ${getDayName(bestTime.day_of_week)} at ${formatHour(bestTime.hour)}`,
          priority: 'high',
          data: {
            dayOfWeek: bestTime.day_of_week,
            hour: bestTime.hour,
            engagementRate: parseFloat(bestTime.avg_engagement_rate)
          }
        });
      }

      if (contentPerformance.rows.length > 0) {
        const bestContentType = contentPerformance.rows[0];
        recommendations.push({
          type: 'content',
          title: 'Best Performing Content Type',
          description: `${bestContentType.content_type} posts generate the highest engagement`,
          priority: 'medium',
          data: {
            contentType: bestContentType.content_type,
            engagementRate: parseFloat(bestContentType.avg_engagement_rate),
            avgImpressions: parseFloat(bestContentType.avg_impressions)
          }
        });
      }

      // Add general recommendations based on Abu Dhabi research
      recommendations.push({
        type: 'timing',
        title: 'Abu Dhabi Optimal Times',
        description: 'Based on regional data, post between 8-10 AM or 6-8 PM GST for maximum reach',
        priority: 'medium',
        data: {
          timezone: 'GST',
          morningSlot: '8:00-10:00',
          eveningSlot: '18:00-20:00'
        }
      });

      res.json({
        success: true,
        data: {
          postingPatterns: postingPatterns.rows.map(row => ({
            hour: parseInt(row.hour),
            dayOfWeek: parseInt(row.day_of_week),
            postCount: parseInt(row.post_count),
            avgEngagementRate: parseFloat(row.avg_engagement_rate) || 0
          })),
          contentPerformance: contentPerformance.rows.map(row => ({
            contentType: row.content_type,
            postCount: parseInt(row.post_count),
            avgEngagementRate: parseFloat(row.avg_engagement_rate) || 0,
            avgImpressions: parseFloat(row.avg_impressions) || 0
          })),
          recommendations,
          generatedAt: new Date().toISOString()
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to get LinkedIn insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve LinkedIn insights'
    });
  }
});

// Helper functions
function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

function formatHour(hour) {
  const h = parseInt(hour);
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

module.exports = router;