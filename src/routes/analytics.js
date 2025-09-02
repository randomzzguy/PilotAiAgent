const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const pool = require('../database/connection');
const { requireAuth, requireLinkedInConnection } = require('../middleware/auth');
const { logAPIUsage } = require('../middleware/logging');
const analyticsService = require('../services/analytics');
const linkedinAPI = require('../services/linkedinAPI');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for analytics endpoints
const analyticsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many analytics requests, please try again later.'
  }
});

// Apply rate limiting to all analytics routes
router.use(analyticsRateLimit);

// Apply authentication and logging to all routes
router.use(requireAuth);
router.use(logAPIUsage);

/**
 * @route GET /api/analytics/dashboard
 * @desc Get comprehensive analytics dashboard data
 * @access Private
 */
router.get('/dashboard',
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
      const filters = { period, from, to };

      const dashboardData = await analyticsService.getUserDashboard(req.user.userId, filters);

      logger.analytics('Dashboard data retrieved', {
        userId: req.user.userId,
        period: dashboardData.period
      });

      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      logger.error('Failed to get dashboard analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard analytics'
      });
    }
  }
);

/**
 * @route GET /api/analytics/competitive
 * @desc Get competitive analysis data
 * @access Private
 */
router.get('/competitive',
  [
    query('industry').optional().isString(),
    query('period').optional().isIn(['week', 'month', 'quarter', 'year'])
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

      const { industry, period = 'month' } = req.query;
      const filters = { industry, period };

      const competitiveData = await analyticsService.getCompetitiveAnalysis(req.user.userId, filters);

      res.json({
        success: true,
        data: competitiveData
      });
    } catch (error) {
      logger.error('Failed to get competitive analysis:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve competitive analysis'
      });
    }
  }
);

/**
 * @route GET /api/analytics/roi
 * @desc Get ROI analysis data
 * @access Private
 */
router.get('/roi',
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year'])
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

      const { period = 'month' } = req.query;
      const filters = { period };

      const roiData = await analyticsService.getROIAnalysis(req.user.userId, filters);

      res.json({
        success: true,
        data: roiData
      });
    } catch (error) {
      logger.error('Failed to get ROI analysis:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve ROI analysis'
      });
    }
  }
);

/**
 * @route GET /api/analytics/report
 * @desc Generate comprehensive analytics report
 * @access Private
 */
router.get('/report',
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year']),
    query('format').optional().isIn(['json', 'summary'])
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

      const { period = 'month', format = 'json' } = req.query;
      const filters = { period, format };

      const reportData = await analyticsService.generateReport(req.user.userId, filters);

      res.json({
        success: true,
        data: reportData
      });
    } catch (error) {
      logger.error('Failed to generate analytics report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate analytics report'
      });
    }
  }
);

/**
 * @route POST /api/analytics/track/:postId
 * @desc Track post performance metrics
 * @access Private
 */
router.post('/track/:postId',
  [
    param('postId').isUUID(),
    body('metrics').isObject(),
    body('metrics.likes').optional().isInt({ min: 0 }),
    body('metrics.comments').optional().isInt({ min: 0 }),
    body('metrics.shares').optional().isInt({ min: 0 }),
    body('metrics.views').optional().isInt({ min: 0 }),
    body('metrics.clicks').optional().isInt({ min: 0 }),
    body('metrics.impressions').optional().isInt({ min: 0 }),
    body('metrics.reach').optional().isInt({ min: 0 })
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

      const { postId } = req.params;
      const { metrics } = req.body;

      await analyticsService.trackPostPerformance(postId, metrics);

      logger.analytics('Post performance tracked', {
        userId: req.user.userId,
        postId,
        metrics
      });

      res.json({
        success: true,
        message: 'Post performance tracked successfully'
      });
    } catch (error) {
      logger.error('Failed to track post performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to track post performance'
      });
    }
  }
);

/**
 * @route GET /api/analytics/best-times
 * @desc Get best posting times analysis
 * @access Private
 */
router.get('/best-times',
  [
    query('period').optional().isIn(['week', 'month', 'quarter', 'year'])
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

      const { period = 'month' } = req.query;
      const filters = { period };

      const bestTimes = await analyticsService.getBestPostingTimes(req.user.userId, filters);

      res.json({
        success: true,
        data: bestTimes
      });
    } catch (error) {
      logger.error('Failed to get best posting times:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve best posting times'
      });
    }
  }
);

/**
 * @route GET /api/analytics/realtime
 * @desc Get real-time analytics data
 * @access Private
 */
router.get('/realtime',
  async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        // Get recent posts with their latest metrics
        const recentPosts = await client.query(`
          SELECT 
            sp.id,
            sp.title,
            sp.content_type,
            sp.posted_at,
            pa.likes,
            pa.comments,
            pa.shares,
            pa.impressions,
            pa.updated_at as last_updated,
            (
              CASE 
                WHEN COALESCE(pa.impressions, 0) > 0 
                THEN ((COALESCE(pa.likes, 0) + COALESCE(pa.comments, 0) + COALESCE(pa.shares, 0)) * 100.0 / pa.impressions)
                ELSE 0 
              END
            ) as engagement_rate
          FROM scheduled_posts sp
          LEFT JOIN post_analytics pa ON pa.post_id = sp.id
          WHERE sp.user_id = $1 
            AND sp.status = 'posted'
            AND sp.posted_at >= NOW() - INTERVAL '24 hours'
          ORDER BY sp.posted_at DESC
          LIMIT 10
        `, [req.user.userId]);

        // Get hourly engagement for the last 24 hours
        const hourlyEngagement = await client.query(`
          SELECT 
            DATE_TRUNC('hour', pa.updated_at) as hour,
            AVG(
              CASE 
                WHEN COALESCE(pa.impressions, 0) > 0 
                THEN ((COALESCE(pa.likes, 0) + COALESCE(pa.comments, 0) + COALESCE(pa.shares, 0)) * 100.0 / pa.impressions)
                ELSE 0 
              END
            ) as avg_engagement_rate,
            SUM(COALESCE(pa.likes, 0)) as total_likes,
            SUM(COALESCE(pa.comments, 0)) as total_comments,
            SUM(COALESCE(pa.shares, 0)) as total_shares
          FROM post_analytics pa
          JOIN scheduled_posts sp ON sp.id = pa.post_id
          WHERE sp.user_id = $1 
            AND pa.updated_at >= NOW() - INTERVAL '24 hours'
          GROUP BY DATE_TRUNC('hour', pa.updated_at)
          ORDER BY hour DESC
        `, [req.user.userId]);

        res.json({
          success: true,
          data: {
            recentPosts: recentPosts.rows,
            hourlyTrends: hourlyEngagement.rows,
            lastUpdated: new Date().toISOString()
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get real-time analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve real-time analytics'
      });
    }
  }
);

/**
 * @route GET /api/analytics/export
 * @desc Export analytics data
 * @access Private
 */
router.get('/export',
  [
    query('format').isIn(['json', 'csv']),
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

      const { format, period = 'month', from, to } = req.query;
      const filters = { period, from, to };

      const dashboardData = await analyticsService.getUserDashboard(req.user.userId, filters);

      if (format === 'csv') {
        // Convert to CSV format
        const csvData = convertToCSV(dashboardData);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvData);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}-${new Date().toISOString().split('T')[0]}.json"`);
        res.json({
          success: true,
          data: dashboardData,
          exportedAt: new Date().toISOString()
        });
      }

      logger.analytics('Analytics data exported', {
        userId: req.user.userId,
        format,
        period
      });
    } catch (error) {
      logger.error('Failed to export analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export analytics data'
      });
    }
  }
);

/**
 * Helper function to convert analytics data to CSV
 */
function convertToCSV(data) {
  const headers = [
    'Date',
    'Total Posts',
    'Avg Engagement Rate',
    'Total Likes',
    'Total Comments',
    'Total Shares',
    'Total Impressions',
    'Best Performing Content Type'
  ];

  const rows = [];
  rows.push(headers.join(','));

  // Add overview data
  const overview = data.overview;
  rows.push([
    data.period.from.split('T')[0],
    overview.totalPosts,
    overview.avgEngagementRate.toFixed(2),
    overview.totalLikes,
    overview.totalComments,
    overview.totalShares,
    overview.totalImpressions,
    data.contentPerformance.byType[0]?.type || 'N/A'
  ].join(','));

  return rows.join('\n');
}

module.exports = router;