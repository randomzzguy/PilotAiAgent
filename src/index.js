const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const { initializeDatabase } = require('./database/init');
const { startScheduler } = require('./services/scheduler');

// Import routes
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const schedulingRoutes = require('./routes/scheduling');
const analyticsRoutes = require('./routes/analytics');
const linkedinRoutes = require('./routes/linkedin');
const optimalTimingRoutes = require('./routes/optimalTiming');
const contentTemplatesRoutes = require('./routes/contentTemplates');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'LinkedIn Automation System',
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/optimal-timing', optimalTimingRoutes);
app.use('/api/content-templates', contentTemplatesRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Initialize application
async function startServer() {
  try {
    // Skip database initialization for now (can be enabled later)
    // await initializeDatabase();
    logger.info('Database initialization skipped (development mode)');

    // Skip scheduler for now (requires database)
    // startScheduler();
    logger.info('Content scheduler skipped (development mode)');

    // Start server
    app.listen(PORT, () => {
      logger.info(`LinkedIn Automation System running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the application
startServer();

module.exports = app;