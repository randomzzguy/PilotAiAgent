const express = require('express');
const router = express.Router();
const optimalTimingService = require('../services/optimalTiming');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { body, query, validationResult } = require('express-validator');

/**
 * @route GET /api/optimal-timing/personalized
 * @desc Get personalized optimal posting times for the authenticated user
 * @access Private
 */
router.get('/personalized', 
  authenticateToken,
  [
    query('daysBack').optional().isInt({ min: 7, max: 365 }).withMessage('Days back must be between 7 and 365'),
    query('refresh').optional().isBoolean().withMessage('Refresh must be a boolean')
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

      const userId = req.user.id;
      const daysBack = parseInt(req.query.daysBack) || 90;
      const refresh = req.query.refresh === 'true';

      let optimalTimes;
      
      if (refresh) {
        // Force refresh - get new data
        optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(userId, daysBack);
        await optimalTimingService.updateOptimalTimesCache(userId);
      } else {
        // Try to get cached data first
        optimalTimes = await optimalTimingService.getCachedOptimalTimes(userId);
        if (!optimalTimes) {
          optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(userId, daysBack);
          await optimalTimingService.updateOptimalTimesCache(userId);
        }
      }

      res.json({
        success: true,
        data: {
          optimalTimes,
          analysisParams: {
            daysBack,
            userId,
            generatedAt: new Date().toISOString()
          }
        }
      });

    } catch (error) {
      logger.error('Error getting personalized optimal times:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get personalized optimal times',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/optimal-timing/next
 * @desc Get the next optimal posting time for a user
 * @access Private
 */
router.get('/next',
  authenticateToken,
  [
    query('contentType').optional().isIn(['text', 'image', 'video', 'article', 'poll', 'multi_image']).withMessage('Invalid content type'),
    query('timeSlot').optional().isIn(['morning', 'midday', 'afternoon', 'evening', 'night']).withMessage('Invalid time slot')
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

      const userId = req.user.id;
      const contentType = req.query.contentType;
      const timeSlot = req.query.timeSlot;

      const nextOptimalTime = await optimalTimingService.getNextOptimalTime(userId, contentType, timeSlot);

      if (!nextOptimalTime) {
        return res.status(404).json({
          success: false,
          message: 'No optimal time found for the specified criteria'
        });
      }

      res.json({
        success: true,
        data: {
          nextOptimalTime,
          requestParams: {
            contentType,
            timeSlot,
            userId
          }
        }
      });

    } catch (error) {
      logger.error('Error getting next optimal time:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get next optimal time',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/optimal-timing/schedule
 * @desc Get optimal times for a period (for bulk scheduling)
 * @access Private
 */
router.get('/schedule',
  authenticateToken,
  [
    query('daysAhead').optional().isInt({ min: 1, max: 30 }).withMessage('Days ahead must be between 1 and 30'),
    query('postsPerDay').optional().isInt({ min: 1, max: 5 }).withMessage('Posts per day must be between 1 and 5')
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

      const userId = req.user.id;
      const daysAhead = parseInt(req.query.daysAhead) || 7;
      const postsPerDay = parseInt(req.query.postsPerDay) || 1;

      const schedule = await optimalTimingService.getOptimalTimesForPeriod(userId, daysAhead, postsPerDay);

      res.json({
        success: true,
        data: {
          schedule,
          summary: {
            totalSlots: schedule.length,
            daysAhead,
            postsPerDay,
            averageScore: schedule.reduce((sum, slot) => sum + slot.score, 0) / schedule.length
          }
        }
      });

    } catch (error) {
      logger.error('Error getting optimal schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get optimal schedule',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/optimal-timing/regional
 * @desc Get regional optimal times (Abu Dhabi specific)
 * @access Private
 */
router.get('/regional',
  authenticateToken,
  async (req, res) => {
    try {
      const regionalTimes = optimalTimingService.getRegionalOptimalTimes();

      res.json({
        success: true,
        data: {
          regionalTimes,
          region: 'Abu Dhabi, UAE',
          timezone: 'Asia/Dubai'
        }
      });

    } catch (error) {
      logger.error('Error getting regional optimal times:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get regional optimal times',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route POST /api/optimal-timing/refresh-cache
 * @desc Refresh the optimal times cache for the authenticated user
 * @access Private
 */
router.post('/refresh-cache',
  authenticateToken,
  [
    body('daysBack').optional().isInt({ min: 7, max: 365 }).withMessage('Days back must be between 7 and 365')
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

      const userId = req.user.id;
      const daysBack = req.body.daysBack || 90;

      // Recalculate optimal times
      const optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(userId, daysBack);
      
      // Update cache
      await optimalTimingService.updateOptimalTimesCache(userId);

      res.json({
        success: true,
        message: 'Optimal times cache refreshed successfully',
        data: {
          optimalTimes,
          refreshedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error refreshing optimal times cache:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh optimal times cache',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/optimal-timing/recommendations
 * @desc Get smart posting recommendations based on content and timing
 * @access Private
 */
router.get('/recommendations',
  authenticateToken,
  [
    query('contentType').optional().isIn(['text', 'image', 'video', 'article', 'poll', 'multi_image']).withMessage('Invalid content type'),
    query('urgency').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid urgency level'),
    query('targetAudience').optional().isIn(['business', 'general', 'professional']).withMessage('Invalid target audience')
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

      const userId = req.user.id;
      const contentType = req.query.contentType;
      const urgency = req.query.urgency || 'medium';
      const targetAudience = req.query.targetAudience || 'professional';

      // Get personalized optimal times
      const optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(userId);
      
      // Generate recommendations based on parameters
      const recommendations = [];

      // Immediate posting recommendation
      if (urgency === 'high') {
        recommendations.push({
          type: 'immediate',
          datetime: new Date(),
          reason: 'High urgency content should be posted immediately',
          score: 0.6,
          confidence: 'medium'
        });
      }

      // Next optimal time recommendation
      const nextOptimal = await optimalTimingService.getNextOptimalTime(userId, contentType);
      if (nextOptimal) {
        recommendations.push({
          type: 'optimal',
          datetime: nextOptimal.datetime,
          reason: `Best time based on your ${nextOptimal.confidence} confidence historical data`,
          score: nextOptimal.score,
          confidence: nextOptimal.confidence,
          timeSlot: nextOptimal.timeSlot,
          dayType: nextOptimal.dayType
        });
      }

      // Content-specific recommendation
      if (contentType && optimalTimes.contentSpecific[contentType]) {
        const contentSpecific = optimalTimes.contentSpecific[contentType];
        const nextContentTime = await optimalTimingService.getNextOptimalTime(userId, contentType);
        
        if (nextContentTime) {
          recommendations.push({
            type: 'content-specific',
            datetime: nextContentTime.datetime,
            reason: `Optimized specifically for ${contentType} content`,
            score: contentSpecific.score,
            confidence: contentSpecific.confidence,
            contentType
          });
        }
      }

      // Audience-specific recommendations
      if (targetAudience === 'business') {
        const businessHours = await optimalTimingService.getNextOptimalTime(userId, null, 'midday');
        if (businessHours) {
          recommendations.push({
            type: 'audience-specific',
            datetime: businessHours.datetime,
            reason: 'Business hours timing for professional audience',
            score: businessHours.score * 0.9, // Slightly lower score for audience targeting
            confidence: 'medium',
            targetAudience: 'business'
          });
        }
      }

      // Sort recommendations by score
      recommendations.sort((a, b) => b.score - a.score);

      res.json({
        success: true,
        data: {
          recommendations: recommendations.slice(0, 5), // Top 5 recommendations
          requestParams: {
            contentType,
            urgency,
            targetAudience
          },
          metadata: {
            totalRecommendations: recommendations.length,
            optimalTimesConfidence: optimalTimes.confidence,
            generatedAt: new Date().toISOString()
          }
        }
      });

    } catch (error) {
      logger.error('Error getting posting recommendations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get posting recommendations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /api/optimal-timing/analytics
 * @desc Get analytics about user's posting patterns and optimal times performance
 * @access Private
 */
router.get('/analytics',
  authenticateToken,
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period')
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

      const userId = req.user.id;
      const period = req.query.period || '30d';
      
      // Convert period to days
      const periodDays = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
        '1y': 365
      }[period];

      // Get optimal times with analytics
      const optimalTimes = await optimalTimingService.getPersonalizedOptimalTimes(userId, periodDays);
      
      // Get cached data for comparison
      const cachedTimes = await optimalTimingService.getCachedOptimalTimes(userId);
      
      const analytics = {
        currentOptimalTimes: optimalTimes,
        cachedOptimalTimes: cachedTimes,
        period: period,
        periodDays: periodDays,
        confidence: optimalTimes.confidence,
        hasContentSpecificData: Object.keys(optimalTimes.contentSpecific || {}).length > 0,
        contentTypes: Object.keys(optimalTimes.contentSpecific || {}),
        specialPeriod: optimalTimes.specialPeriod || null,
        lastUpdated: cachedTimes ? new Date().toISOString() : null,
        recommendations: {
          shouldRefreshCache: !cachedTimes || optimalTimes.confidence !== cachedTimes.confidence,
          dataQuality: optimalTimes.confidence,
          suggestedActions: []
        }
      };

      // Add recommendations based on data quality
      if (optimalTimes.confidence === 'low') {
        analytics.recommendations.suggestedActions.push(
          'Post more content to improve optimal timing accuracy',
          'Consider using regional optimal times as fallback'
        );
      } else if (optimalTimes.confidence === 'medium') {
        analytics.recommendations.suggestedActions.push(
          'Continue posting consistently to improve timing precision'
        );
      } else {
        analytics.recommendations.suggestedActions.push(
          'Your optimal times are highly accurate - stick to the recommended schedule'
        );
      }

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Error getting optimal timing analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get optimal timing analytics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;