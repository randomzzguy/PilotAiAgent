const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { pool } = require('../database/init');
const linkedinAPI = require('../services/linkedinAPI');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', 
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
    body('firstName').trim().isLength({ min: 1, max: 50 }),
    body('lastName').trim().isLength({ min: 1, max: 50 }),
    body('companyName').optional().trim().isLength({ max: 100 })
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, password, firstName, lastName, companyName } = req.body;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check if user already exists
        const existingUser = await client.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'User already exists with this email'
          });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const userResult = await client.query(`
          INSERT INTO users (email, password_hash, first_name, last_name, company_name, timezone)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, first_name, last_name, company_name, created_at
        `, [email, hashedPassword, firstName, lastName, companyName, 'Asia/Dubai']);

        const user = userResult.rows[0];

        // Create default user preferences
        await client.query(`
          INSERT INTO user_preferences (user_id, tone, auto_posting, auto_hashtags, max_hashtags)
          VALUES ($1, 'professional', false, true, 10)
        `, [user.id]);

        await client.query('COMMIT');

        // Generate JWT token
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        logger.auth('User registered successfully', {
          userId: user.id,
          email: user.email
        });

        res.status(201).json({
          success: true,
          message: 'User registered successfully',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
              companyName: user.company_name,
              createdAt: user.created_at
            },
            token
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Registration failed:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.'
      });
    }
  }
);

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const { email, password } = req.body;

      const client = await pool.connect();
      try {
        // Get user
        const userResult = await client.query(`
          SELECT id, email, password_hash, first_name, last_name, company_name, 
                 is_active, created_at, last_login
          FROM users 
          WHERE email = $1
        `, [email]);

        if (userResult.rows.length === 0) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        const user = userResult.rows[0];

        // Check if user is active
        if (!user.is_active) {
          return res.status(401).json({
            success: false,
            message: 'Account is deactivated. Please contact support.'
          });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        // Update last login
        await client.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );

        // Generate JWT token
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        logger.auth('User logged in successfully', {
          userId: user.id,
          email: user.email
        });

        res.json({
          success: true,
          message: 'Login successful',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
              companyName: user.company_name,
              lastLogin: user.last_login
            },
            token
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Login failed:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed. Please try again.'
      });
    }
  }
);

/**
 * @route GET /api/auth/linkedin/authorize
 * @desc Get LinkedIn authorization URL
 * @access Private
 */
router.get('/linkedin/authorize', auth, async (req, res) => {
  try {
    const state = jwt.sign(
      { userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const authUrl = linkedinAPI.getAuthorizationUrl(state);

    logger.auth('LinkedIn authorization URL generated', {
      userId: req.user.userId
    });

    res.json({
      success: true,
      data: {
        authorizationUrl: authUrl
      }
    });
  } catch (error) {
    logger.error('Failed to generate LinkedIn authorization URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL'
    });
  }
});

/**
 * @route POST /api/auth/linkedin/callback
 * @desc Handle LinkedIn OAuth callback
 * @access Private
 */
router.post('/linkedin/callback',
  auth,
  [
    body('code').notEmpty(),
    body('state').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid callback parameters'
        });
      }

      const { code, state } = req.body;

      // Verify state parameter
      try {
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        if (decoded.userId !== req.user.userId) {
          return res.status(400).json({
            success: false,
            message: 'Invalid state parameter'
          });
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired state parameter'
        });
      }

      // Exchange code for access token
      const tokenData = await linkedinAPI.getAccessToken(code);
      
      // Get user profile
      const profile = await linkedinAPI.getUserProfile(tokenData.access_token);
      
      // Store credentials
      await linkedinAPI.storeUserCredentials(
        req.user.userId,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in
      );

      // Update user profile with LinkedIn info
      const client = await pool.connect();
      try {
        await client.query(`
          UPDATE users 
          SET linkedin_id = $1, linkedin_profile_url = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [profile.id, `https://www.linkedin.com/in/${profile.id}`, req.user.userId]);
      } finally {
        client.release();
      }

      logger.auth('LinkedIn account connected successfully', {
        userId: req.user.userId,
        linkedinId: profile.id
      });

      res.json({
        success: true,
        message: 'LinkedIn account connected successfully',
        data: {
          profile: {
            id: profile.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email
          }
        }
      });
    } catch (error) {
      logger.error('LinkedIn callback failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to connect LinkedIn account'
      });
    }
  }
);

/**
 * @route DELETE /api/auth/linkedin/disconnect
 * @desc Disconnect LinkedIn account
 * @access Private
 */
router.delete('/linkedin/disconnect', auth, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove LinkedIn tokens
      await client.query(
        'DELETE FROM user_linkedin_tokens WHERE user_id = $1',
        [req.user.userId]
      );

      // Clear LinkedIn info from user profile
      await client.query(`
        UPDATE users 
        SET linkedin_id = NULL, linkedin_profile_url = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [req.user.userId]);

      await client.query('COMMIT');

      logger.auth('LinkedIn account disconnected', {
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
 * @route GET /api/auth/linkedin/status
 * @desc Check LinkedIn connection status
 * @access Private
 */
router.get('/linkedin/status', auth, async (req, res) => {
  try {
    const hasConnection = await linkedinAPI.hasValidConnection(req.user.userId);
    
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT u.linkedin_id, u.linkedin_profile_url, ult.expires_at
        FROM users u
        LEFT JOIN user_linkedin_tokens ult ON ult.user_id = u.id
        WHERE u.id = $1
      `, [req.user.userId]);

      const userData = result.rows[0];

      res.json({
        success: true,
        data: {
          connected: hasConnection,
          linkedinId: userData?.linkedin_id || null,
          profileUrl: userData?.linkedin_profile_url || null,
          expiresAt: userData?.expires_at || null
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to check LinkedIn status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check LinkedIn connection status'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', auth, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.company_name, 
               u.timezone, u.linkedin_id, u.linkedin_profile_url, u.created_at, u.last_login,
               up.tone, up.brand_voice, up.auto_posting, up.auto_hashtags, up.max_hashtags
        FROM users u
        LEFT JOIN user_preferences up ON up.user_id = u.id
        WHERE u.id = $1
      `, [req.user.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            companyName: user.company_name,
            timezone: user.timezone,
            linkedinId: user.linkedin_id,
            linkedinProfileUrl: user.linkedin_profile_url,
            createdAt: user.created_at,
            lastLogin: user.last_login,
            preferences: {
              tone: user.tone,
              brandVoice: user.brand_voice,
              autoPosting: user.auto_posting,
              autoHashtags: user.auto_hashtags,
              maxHashtags: user.max_hashtags
            }
          }
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to get user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile',
  auth,
  [
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
    body('companyName').optional().trim().isLength({ max: 100 }),
    body('timezone').optional().isIn(['Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar'])
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

      const { firstName, lastName, companyName, timezone } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (firstName !== undefined) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(firstName);
      }
      if (lastName !== undefined) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(lastName);
      }
      if (companyName !== undefined) {
        updates.push(`company_name = $${paramCount++}`);
        values.push(companyName);
      }
      if (timezone !== undefined) {
        updates.push(`timezone = $${paramCount++}`);
        values.push(timezone);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(req.user.userId);

      const client = await pool.connect();
      try {
        const result = await client.query(`
          UPDATE users 
          SET ${updates.join(', ')}
          WHERE id = $${paramCount}
          RETURNING id, email, first_name, last_name, company_name, timezone
        `, values);

        const user = result.rows[0];

        logger.auth('User profile updated', {
          userId: req.user.userId
        });

        res.json({
          success: true,
          message: 'Profile updated successfully',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
              companyName: user.company_name,
              timezone: user.timezone
            }
          }
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  }
);

module.exports = router;