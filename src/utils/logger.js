const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'linkedin-automation'
  },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Add specific logging methods for different contexts
logger.linkedin = (message, meta = {}) => {
  logger.info(message, { context: 'linkedin', ...meta });
};

logger.content = (message, meta = {}) => {
  logger.info(message, { context: 'content-generation', ...meta });
};

logger.scheduler = (message, meta = {}) => {
  logger.info(message, { context: 'scheduler', ...meta });
};

logger.analytics = (message, meta = {}) => {
  logger.info(message, { context: 'analytics', ...meta });
};

logger.auth = (message, meta = {}) => {
  logger.info(message, { context: 'authentication', ...meta });
};

logger.api = (message, meta = {}) => {
  logger.info(message, { context: 'api', ...meta });
};

// Performance logging
logger.performance = (operation, duration, meta = {}) => {
  logger.info(`Performance: ${operation} completed in ${duration}ms`, {
    context: 'performance',
    operation,
    duration,
    ...meta
  });
};

// Security logging
logger.security = (message, meta = {}) => {
  logger.warn(message, { context: 'security', ...meta });
};

module.exports = logger;