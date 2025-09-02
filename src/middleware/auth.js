const jwt = require('jsonwebtoken');
const { pool } = require('../database/init');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is active
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Account is deactivated.'
        });
      }

      // Add user info to request
      req.user = {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      };

      next();
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.security('Invalid JWT token attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        error: error.message
      });
      
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      logger.security('Expired JWT token attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token expired.'
      });
    }

    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info to request if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT id, email, first_name, last_name, is_active FROM users WHERE id = $1',
          [decoded.userId]
        );

        if (result.rows.length > 0 && result.rows[0].is_active) {
          const user = result.rows[0];
          req.user = {
            userId: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name
          };
        }
      } finally {
        client.release();
      }
    } catch (tokenError) {
      // Invalid or expired token - continue without user info
      logger.warning('Invalid token in optional auth:', tokenError.message);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    next(); // Continue without authentication
  }
};

/**
 * Admin authentication middleware
 * Requires user to be authenticated and have admin role
 */
const adminAuth = async (req, res, next) => {
  try {
    // First run regular auth
    await new Promise((resolve, reject) => {
      auth(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Check if user has admin role
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [req.user.userId]
      );

      if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        logger.security('Unauthorized admin access attempt', {
          userId: req.user.userId,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      next();
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.status) {
      // Error from auth middleware
      return res.status(error.status).json(error.response);
    }
    
    logger.error('Admin authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin authentication.'
    });
  }
};

/**
 * Rate limiting middleware for authenticated users
 * Provides higher limits for authenticated users
 */
const authenticatedRateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.user ? `user_${req.user.userId}` : `ip_${req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key).filter(time => time > windowStart);
    
    if (userRequests.length >= maxRequests) {
      logger.security('Rate limit exceeded', {
        key,
        requestCount: userRequests.length,
        maxRequests,
        ip: req.ip
      });
      
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    userRequests.push(now);
    requests.set(key, userRequests);
    
    next();
  };
};

/**
 * Middleware to check LinkedIn connection
 * Ensures user has a valid LinkedIn connection before proceeding
 */
const requireLinkedInConnection = async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT ult.access_token, ult.expires_at
        FROM user_linkedin_tokens ult
        WHERE ult.user_id = $1 AND ult.expires_at > CURRENT_TIMESTAMP
      `, [req.user.userId]);

      if (result.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'LinkedIn account not connected or token expired. Please reconnect your LinkedIn account.',
          code: 'LINKEDIN_NOT_CONNECTED'
        });
      }

      // Add LinkedIn token to request for use in subsequent operations
      req.linkedinToken = result.rows[0].access_token;
      
      next();
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('LinkedIn connection check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify LinkedIn connection.'
    });
  }
};

/**
 * Middleware to log API usage
 * Tracks API endpoint usage for analytics and monitoring
 */
const logAPIUsage = async (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.json to capture response
  const originalJson = res.json;
  let responseData = null;
  
  res.json = function(data) {
    responseData = data;
    return originalJson.call(this, data);
  };
  
  // Override res.end to log after response
  const originalEnd = res.end;
  res.end = async function(...args) {
    const responseTime = Date.now() - startTime;
    
    // Log API usage
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          INSERT INTO api_usage_logs (
            user_id, endpoint, method, status_code, response_time, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          req.user?.userId || null,
          req.route?.path || req.path,
          req.method,
          res.statusCode,
          responseTime,
          JSON.stringify({
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            success: responseData?.success || res.statusCode < 400
          })
        ]);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to log API usage:', error);
    }
    
    return originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Middleware to validate user subscription/plan limits
 * Checks if user has exceeded their plan limits
 */
const checkPlanLimits = (limitType) => {
  return async (req, res, next) => {
    try {
      const client = await pool.connect();
      try {
        // Get user's current usage and plan limits
        const result = await client.query(`
          SELECT 
            COUNT(CASE WHEN gc.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as monthly_posts,
            COUNT(CASE WHEN sp.created_at >= CURRENT_DATE THEN 1 END) as daily_scheduled
          FROM users u
          LEFT JOIN generated_content gc ON gc.user_id = u.id
          LEFT JOIN scheduled_posts sp ON sp.user_id = u.id
          WHERE u.id = $1
          GROUP BY u.id
        `, [req.user.userId]);

        const usage = result.rows[0] || { monthly_posts: 0, daily_scheduled: 0 };
        
        // Define plan limits (can be moved to database/config)
        const limits = {
          free: { monthly_posts: 10, daily_scheduled: 3 },
          basic: { monthly_posts: 50, daily_scheduled: 10 },
          premium: { monthly_posts: 200, daily_scheduled: 50 },
          enterprise: { monthly_posts: -1, daily_scheduled: -1 } // unlimited
        };
        
        const userPlan = 'free'; // Default plan - should be fetched from user data
        const planLimits = limits[userPlan];
        
        if (limitType === 'monthly_posts' && planLimits.monthly_posts !== -1) {
          if (usage.monthly_posts >= planLimits.monthly_posts) {
            return res.status(403).json({
              success: false,
              message: 'Monthly post limit exceeded. Please upgrade your plan.',
              code: 'LIMIT_EXCEEDED',
              data: {
                current: usage.monthly_posts,
                limit: planLimits.monthly_posts,
                plan: userPlan
              }
            });
          }
        }
        
        if (limitType === 'daily_scheduled' && planLimits.daily_scheduled !== -1) {
          if (usage.daily_scheduled >= planLimits.daily_scheduled) {
            return res.status(403).json({
              success: false,
              message: 'Daily scheduling limit exceeded. Please upgrade your plan.',
              code: 'LIMIT_EXCEEDED',
              data: {
                current: usage.daily_scheduled,
                limit: planLimits.daily_scheduled,
                plan: userPlan
              }
            });
          }
        }
        
        next();
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Plan limits check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify plan limits.'
      });
    }
  };
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  authenticatedRateLimit,
  requireLinkedInConnection,
  logAPIUsage,
  checkPlanLimits
};