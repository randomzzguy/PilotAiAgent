const request = require('supertest');
const app = require('../index');
const db = require('../src/database/init');
const logger = require('../logger');

describe('LinkedIn Automation System - Setup Tests', () => {
  let server;

  beforeAll(async () => {
    // Initialize database for testing
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = ':memory:'; // Use in-memory database for tests
    
    try {
      await db.init();
      logger.info('Test database initialized');
    } catch (error) {
      logger.error('Failed to initialize test database:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      await db.close();
      if (server) {
        server.close();
      }
    } catch (error) {
      logger.error('Error during test cleanup:', error);
    }
  });

  describe('Application Setup', () => {
    test('should start the application without errors', async () => {
      expect(app).toBeDefined();
    });

    test('should respond to health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database', 'connected');
    });

    test('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    test('should have CORS enabled', async () => {
      const response = await request(app)
        .options('/health')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    test('should have security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });
  });

  describe('Database Setup', () => {
    test('should have all required tables', async () => {
      const tables = [
        'users',
        'content_topics',
        'content_templates',
        'generated_content',
        'scheduled_posts',
        'post_analytics',
        'user_preferences',
        'api_usage',
        'daily_reports',
        'user_insights'
      ];

      for (const table of tables) {
        const result = await db.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `, [table]);
        
        expect(result).toBeDefined();
        expect(result.name).toBe(table);
      }
    });

    test('should have proper indexes', async () => {
      const indexes = await db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_%'
      `);

      expect(indexes.length).toBeGreaterThan(0);
      
      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_users_email');
      expect(indexNames).toContain('idx_scheduled_status');
      expect(indexNames).toContain('idx_analytics_post');
    });
  });

  describe('API Routes', () => {
    test('should have auth routes', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400); // Should fail validation but route should exist

      expect(response.body).toHaveProperty('error');
    });

    test('should have content routes', async () => {
      const response = await request(app)
        .get('/api/content/topics')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should have LinkedIn routes', async () => {
      const response = await request(app)
        .get('/api/linkedin/profile')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should have analytics routes', async () => {
      const response = await request(app)
        .get('/api/analytics/overview')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });

    test('should have scheduling routes', async () => {
      const response = await request(app)
        .get('/api/scheduling/posts')
        .expect(401); // Should require authentication

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Environment Configuration', () => {
    test('should have required environment variables', () => {
      const requiredEnvVars = [
        'NODE_ENV',
        'PORT'
      ];

      requiredEnvVars.forEach(envVar => {
        expect(process.env[envVar]).toBeDefined();
      });
    });

    test('should be in test environment', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });
  });

  describe('Logging System', () => {
    test('should have logger configured', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    test('should have specialized logging methods', () => {
      expect(typeof logger.linkedin).toBe('function');
      expect(typeof logger.content).toBe('function');
      expect(typeof logger.scheduler).toBe('function');
      expect(typeof logger.analytics).toBe('function');
      expect(typeof logger.auth).toBe('function');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to auth routes', async () => {
      const requests = [];
      
      // Make multiple requests quickly
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/auth/register')
            .send({})
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses (429)
      const rateLimited = responses.filter(res => res.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle large payloads', async () => {
      const largePayload = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({ data: largePayload })
        .expect(413); // Payload too large

      expect(response.body).toHaveProperty('error');
    });
  });
});