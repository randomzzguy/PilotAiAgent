const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'linkedin_automation',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Database schema creation
const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        company_name VARCHAR(255),
        timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
        linkedin_connected BOOLEAN DEFAULT FALSE,
        linkedin_access_token TEXT,
        linkedin_refresh_token TEXT,
        linkedin_token_expires_at TIMESTAMP,
        linkedin_profile_id VARCHAR(255),
        subscription_plan VARCHAR(50) DEFAULT 'basic',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Content topics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        keywords TEXT[],
        target_audience VARCHAR(255),
        tone VARCHAR(50) DEFAULT 'professional',
        industry VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Content templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        template_type VARCHAR(50) NOT NULL, -- 'text', 'multi_image', 'video', 'poll', 'document'
        template_content JSONB NOT NULL,
        variables TEXT[],
        is_default BOOLEAN DEFAULT FALSE,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Generated content table
    await client.query(`
      CREATE TABLE IF NOT EXISTS generated_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        topic_id UUID REFERENCES content_topics(id) ON DELETE SET NULL,
        template_id UUID REFERENCES content_templates(id) ON DELETE SET NULL,
        content_type VARCHAR(50) NOT NULL,
        title VARCHAR(500),
        content_text TEXT NOT NULL,
        hashtags TEXT[],
        media_urls TEXT[],
        image_data JSONB,
        ai_prompt TEXT,
        ai_model VARCHAR(50),
        status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'approved', 'scheduled', 'posted', 'failed'
        approval_required BOOLEAN DEFAULT TRUE,
        approved_by UUID REFERENCES users(id),
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Scheduled posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content_id UUID REFERENCES generated_content(id) ON DELETE CASCADE,
        scheduled_time TIMESTAMP NOT NULL,
        timezone VARCHAR(50) DEFAULT 'Asia/Dubai',
        post_type VARCHAR(50) NOT NULL,
        linkedin_post_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'posting', 'posted', 'failed', 'cancelled'
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        posted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        scheduled_post_id UUID REFERENCES scheduled_posts(id) ON DELETE CASCADE,
        linkedin_post_id VARCHAR(255) NOT NULL,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        engagement_rate DECIMAL(5,2) DEFAULT 0,
        reach INTEGER DEFAULT 0,
        video_views INTEGER DEFAULT 0,
        follower_growth INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        posting_frequency INTEGER DEFAULT 3, -- posts per week
        optimal_times TIME[] DEFAULT '{08:30, 13:00, 20:30}',
        preferred_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Monday, 7=Sunday
        content_approval_required BOOLEAN DEFAULT TRUE,
        auto_hashtags BOOLEAN DEFAULT TRUE,
        max_hashtags INTEGER DEFAULT 10,
        brand_voice TEXT,
        excluded_topics TEXT[],
        notification_email BOOLEAN DEFAULT TRUE,
        notification_webhook VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // API usage tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER,
        response_time INTEGER,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Additional tables for analytics and reporting
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_date DATE NOT NULL UNIQUE,
        posts_published INTEGER DEFAULT 0,
        avg_likes DECIMAL(10,2) DEFAULT 0,
        avg_comments DECIMAL(10,2) DEFAULT 0,
        avg_shares DECIMAL(10,2) DEFAULT 0,
        avg_impressions DECIMAL(10,2) DEFAULT 0,
        avg_engagement_rate DECIMAL(5,2) DEFAULT 0,
        top_post_id UUID,
        top_post_engagement DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (top_post_id) REFERENCES scheduled_posts(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        best_posting_time TIME,
        best_content_type VARCHAR(50),
        avg_engagement_rate DECIMAL(5,2) DEFAULT 0,
        total_posts INTEGER DEFAULT 0,
        total_engagement INTEGER DEFAULT 0,
        recommendations JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_linkedin_profile ON users(linkedin_profile_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_content_user_id ON generated_content(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_content_status ON generated_content(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_scheduled_posts_time ON scheduled_posts(scheduled_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON post_analytics(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON post_analytics(linkedin_post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_insights_user ON user_insights(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_insights_updated ON user_insights(updated_at)');

    // Create updated_at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    const tables = ['users', 'content_topics', 'content_templates', 'generated_content', 'scheduled_posts', 'user_preferences', 'user_insights'];
    for (const table of tables) {
      await client.query(`
        DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
        CREATE TRIGGER update_${table}_updated_at
          BEFORE UPDATE ON ${table}
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `);
    }

    await client.query('COMMIT');
    logger.info('Database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating database tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Initialize database
const initializeDatabase = async () => {
  try {
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection established');

    // Create tables
    await createTables();
    
    logger.info('Database initialization completed');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

// Graceful shutdown
const closeDatabase = async () => {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};

module.exports = {
  pool,
  initializeDatabase,
  closeDatabase
};