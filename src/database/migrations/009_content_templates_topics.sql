-- Migration: Add content templates and topic management tables
-- Created: 2024-01-31
-- Description: This migration creates tables for managing content templates, topics, and their relationships

-- Content Topics Table
CREATE TABLE IF NOT EXISTS content_topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    keywords TEXT[], -- Array of related keywords
    target_audience VARCHAR(100),
    industry VARCHAR(50),
    trending_score DECIMAL(3,2) DEFAULT 0.0 CHECK (trending_score >= 0 AND trending_score <= 1),
    engagement_potential DECIMAL(3,2) DEFAULT 0.5 CHECK (engagement_potential >= 0 AND engagement_potential <= 1),
    seasonal_relevance JSONB, -- {"months": [1,2,3], "events": ["ramadan", "eid"]}
    abu_dhabi_relevance DECIMAL(3,2) DEFAULT 0.5 CHECK (abu_dhabi_relevance >= 0 AND abu_dhabi_relevance <= 1),
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Content Templates Table
CREATE TABLE IF NOT EXISTS content_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL DEFAULT 'text', -- text, image, video, carousel, poll
    content_structure JSONB NOT NULL, -- Template structure with placeholders
    variables JSONB, -- Available variables and their types
    style_guidelines JSONB, -- Tone, voice, formatting rules
    target_audience VARCHAR(100),
    industry VARCHAR(50),
    content_category VARCHAR(50), -- educational, promotional, inspirational, news, etc.
    estimated_engagement DECIMAL(3,2) DEFAULT 0.5,
    difficulty_level VARCHAR(20) DEFAULT 'medium', -- easy, medium, hard
    time_to_create INTEGER DEFAULT 15, -- minutes
    is_premium BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(3,2) DEFAULT 0.0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Template-Topic Relationships
CREATE TABLE IF NOT EXISTS template_topics (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES content_templates(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES content_topics(id) ON DELETE CASCADE,
    relevance_score DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, topic_id)
);

-- User Template Preferences
CREATE TABLE IF NOT EXISTS user_template_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES content_templates(id) ON DELETE CASCADE,
    preference_score DECIMAL(3,2) DEFAULT 0.5,
    last_used TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    customizations JSONB, -- User-specific template modifications
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, template_id)
);

-- Topic Trends Tracking
CREATE TABLE IF NOT EXISTS topic_trends (
    id SERIAL PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES content_topics(id) ON DELETE CASCADE,
    trend_date DATE NOT NULL,
    search_volume INTEGER DEFAULT 0,
    social_mentions INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5,2) DEFAULT 0.0,
    sentiment_score DECIMAL(3,2) DEFAULT 0.5, -- 0 = negative, 0.5 = neutral, 1 = positive
    regional_relevance DECIMAL(3,2) DEFAULT 0.5,
    data_source VARCHAR(50), -- google_trends, social_media, news, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(topic_id, trend_date, data_source)
);

-- Content Generation History
CREATE TABLE IF NOT EXISTS content_generation_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES content_templates(id) ON DELETE SET NULL,
    topic_id INTEGER REFERENCES content_topics(id) ON DELETE SET NULL,
    generated_content_id INTEGER REFERENCES generated_content(id) ON DELETE CASCADE,
    generation_parameters JSONB, -- Parameters used for generation
    generation_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_content_topics_category ON content_topics(category);
CREATE INDEX IF NOT EXISTS idx_content_topics_industry ON content_topics(industry);
CREATE INDEX IF NOT EXISTS idx_content_topics_trending ON content_topics(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_topics_active ON content_topics(is_active);
CREATE INDEX IF NOT EXISTS idx_content_topics_keywords ON content_topics USING GIN(keywords);

CREATE INDEX IF NOT EXISTS idx_content_templates_type ON content_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_content_templates_category ON content_templates(content_category);
CREATE INDEX IF NOT EXISTS idx_content_templates_audience ON content_templates(target_audience);
CREATE INDEX IF NOT EXISTS idx_content_templates_active ON content_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_content_templates_engagement ON content_templates(estimated_engagement DESC);
CREATE INDEX IF NOT EXISTS idx_content_templates_usage ON content_templates(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_template_topics_template ON template_topics(template_id);
CREATE INDEX IF NOT EXISTS idx_template_topics_topic ON template_topics(topic_id);
CREATE INDEX IF NOT EXISTS idx_template_topics_relevance ON template_topics(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_user_template_prefs_user ON user_template_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_template_prefs_template ON user_template_preferences(template_id);
CREATE INDEX IF NOT EXISTS idx_user_template_prefs_score ON user_template_preferences(preference_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_template_prefs_usage ON user_template_preferences(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_topic_trends_topic ON topic_trends(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_trends_date ON topic_trends(trend_date DESC);
CREATE INDEX IF NOT EXISTS idx_topic_trends_engagement ON topic_trends(engagement_rate DESC);

CREATE INDEX IF NOT EXISTS idx_content_gen_history_user ON content_generation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_content_gen_history_template ON content_generation_history(template_id);
CREATE INDEX IF NOT EXISTS idx_content_gen_history_topic ON content_generation_history(topic_id);
CREATE INDEX IF NOT EXISTS idx_content_gen_history_created ON content_generation_history(created_at DESC);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_content_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_content_topics_updated_at
    BEFORE UPDATE ON content_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_content_topics_updated_at();

CREATE OR REPLACE FUNCTION update_content_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_content_templates_updated_at
    BEFORE UPDATE ON content_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_content_templates_updated_at();

CREATE OR REPLACE FUNCTION update_user_template_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_template_preferences_updated_at
    BEFORE UPDATE ON user_template_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_template_preferences_updated_at();

-- Add comments for documentation
COMMENT ON TABLE content_topics IS 'Stores content topics and their metadata for content generation';
COMMENT ON TABLE content_templates IS 'Stores reusable content templates with structure and guidelines';
COMMENT ON TABLE template_topics IS 'Many-to-many relationship between templates and topics';
COMMENT ON TABLE user_template_preferences IS 'Tracks user preferences and usage patterns for templates';
COMMENT ON TABLE topic_trends IS 'Tracks trending data for topics over time';
COMMENT ON TABLE content_generation_history IS 'Logs content generation attempts and results';

-- Insert default content topics for Abu Dhabi market
INSERT INTO content_topics (name, description, category, keywords, target_audience, industry, abu_dhabi_relevance, seasonal_relevance) VALUES
('UAE Business Growth', 'Topics related to business development and growth in the UAE', 'business', ARRAY['UAE', 'business', 'growth', 'entrepreneurship', 'startup'], 'entrepreneurs', 'business', 0.9, '{"months": [1,2,3,9,10,11], "events": ["new_year", "business_season"]}'),
('Abu Dhabi Innovation', 'Innovation and technology developments in Abu Dhabi', 'technology', ARRAY['Abu Dhabi', 'innovation', 'technology', 'smart city', 'AI'], 'professionals', 'technology', 1.0, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('Ramadan Business Tips', 'Business advice and tips during Ramadan', 'business', ARRAY['Ramadan', 'business', 'productivity', 'work-life balance'], 'professionals', 'general', 0.8, '{"months": [3,4], "events": ["ramadan"]}'),
('UAE Leadership', 'Leadership insights and stories from UAE business leaders', 'leadership', ARRAY['leadership', 'UAE', 'management', 'success stories'], 'executives', 'business', 0.9, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('Digital Transformation UAE', 'Digital transformation initiatives in the UAE', 'technology', ARRAY['digital transformation', 'UAE', 'technology', 'automation'], 'professionals', 'technology', 0.8, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('Sustainability Abu Dhabi', 'Sustainability and green initiatives in Abu Dhabi', 'sustainability', ARRAY['sustainability', 'green energy', 'Abu Dhabi', 'environment'], 'professionals', 'energy', 0.9, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('UAE Economic Insights', 'Economic trends and insights about the UAE market', 'economics', ARRAY['UAE economy', 'market trends', 'investment', 'finance'], 'investors', 'finance', 0.8, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('Cultural Diversity UAE', 'Celebrating cultural diversity and inclusion in the UAE workplace', 'culture', ARRAY['diversity', 'inclusion', 'UAE culture', 'workplace'], 'professionals', 'general', 0.7, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('Future of Work UAE', 'Future workplace trends and remote work in the UAE', 'workplace', ARRAY['future of work', 'remote work', 'UAE', 'workplace trends'], 'professionals', 'general', 0.6, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}'),
('UAE Success Stories', 'Inspiring success stories from UAE entrepreneurs and professionals', 'inspiration', ARRAY['success stories', 'UAE', 'entrepreneurship', 'motivation'], 'entrepreneurs', 'general', 0.8, '{"months": [1,2,3,4,5,6,7,8,9,10,11,12]}');

-- Insert default content templates
INSERT INTO content_templates (name, description, template_type, content_structure, variables, style_guidelines, target_audience, content_category, estimated_engagement) VALUES
('Business Insight Post', 'Share valuable business insights and tips', 'text', 
 '{"structure": "💡 {insight_title}\n\n{main_content}\n\n✅ Key takeaway: {key_takeaway}\n\n{call_to_action}\n\n{hashtags}", "placeholders": ["insight_title", "main_content", "key_takeaway", "call_to_action", "hashtags"]}',
 '{"insight_title": {"type": "string", "max_length": 100}, "main_content": {"type": "text", "max_length": 800}, "key_takeaway": {"type": "string", "max_length": 200}, "call_to_action": {"type": "string", "max_length": 100}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "professional", "voice": "authoritative", "emoji_usage": "moderate", "hashtag_count": "3-5"}',
 'professionals', 'educational', 0.7),

('Success Story Template', 'Share inspiring success stories', 'text',
 '{"structure": "🌟 {story_title}\n\n{story_intro}\n\n📈 The journey:\n{journey_details}\n\n💪 Key lessons learned:\n{lessons}\n\n{inspiration_message}\n\n{hashtags}", "placeholders": ["story_title", "story_intro", "journey_details", "lessons", "inspiration_message", "hashtags"]}',
 '{"story_title": {"type": "string", "max_length": 120}, "story_intro": {"type": "text", "max_length": 300}, "journey_details": {"type": "text", "max_length": 500}, "lessons": {"type": "text", "max_length": 400}, "inspiration_message": {"type": "string", "max_length": 200}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "inspirational", "voice": "motivational", "emoji_usage": "high", "hashtag_count": "4-6"}',
 'entrepreneurs', 'inspirational', 0.8),

('Industry News Update', 'Share relevant industry news and updates', 'text',
 '{"structure": "📰 {news_headline}\n\n{news_summary}\n\n🔍 Why this matters:\n{analysis}\n\n💭 What are your thoughts on this development?\n\n{hashtags}", "placeholders": ["news_headline", "news_summary", "analysis", "hashtags"]}',
 '{"news_headline": {"type": "string", "max_length": 150}, "news_summary": {"type": "text", "max_length": 600}, "analysis": {"type": "text", "max_length": 400}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "informative", "voice": "analytical", "emoji_usage": "low", "hashtag_count": "3-5"}',
 'professionals', 'news', 0.6),

('Question & Engagement', 'Pose thought-provoking questions to drive engagement', 'text',
 '{"structure": "🤔 {question_intro}\n\n{main_question}\n\n{context_or_example}\n\n👇 Share your thoughts in the comments!\n\n{hashtags}", "placeholders": ["question_intro", "main_question", "context_or_example", "hashtags"]}',
 '{"question_intro": {"type": "string", "max_length": 200}, "main_question": {"type": "string", "max_length": 300}, "context_or_example": {"type": "text", "max_length": 400}, "hashtags": {"type": "array", "max_items": 4}}',
 '{"tone": "conversational", "voice": "engaging", "emoji_usage": "moderate", "hashtag_count": "2-4"}',
 'general', 'engagement', 0.9),

('Tips & Advice', 'Share practical tips and actionable advice', 'text',
 '{"structure": "💡 {tips_title}\n\n{intro_text}\n\n{tip_1}\n{tip_2}\n{tip_3}\n{tip_4}\n{tip_5}\n\n{conclusion}\n\n{hashtags}", "placeholders": ["tips_title", "intro_text", "tip_1", "tip_2", "tip_3", "tip_4", "tip_5", "conclusion", "hashtags"]}',
 '{"tips_title": {"type": "string", "max_length": 100}, "intro_text": {"type": "text", "max_length": 200}, "tip_1": {"type": "string", "max_length": 150}, "tip_2": {"type": "string", "max_length": 150}, "tip_3": {"type": "string", "max_length": 150}, "tip_4": {"type": "string", "max_length": 150}, "tip_5": {"type": "string", "max_length": 150}, "conclusion": {"type": "text", "max_length": 200}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "helpful", "voice": "advisory", "emoji_usage": "moderate", "hashtag_count": "3-5"}',
 'professionals', 'educational', 0.7),

('Company Update', 'Share company news and updates', 'text',
 '{"structure": "🚀 {update_title}\n\n{update_details}\n\n{impact_or_benefits}\n\n{future_plans}\n\n{call_to_action}\n\n{hashtags}", "placeholders": ["update_title", "update_details", "impact_or_benefits", "future_plans", "call_to_action", "hashtags"]}',
 '{"update_title": {"type": "string", "max_length": 120}, "update_details": {"type": "text", "max_length": 500}, "impact_or_benefits": {"type": "text", "max_length": 300}, "future_plans": {"type": "text", "max_length": 200}, "call_to_action": {"type": "string", "max_length": 100}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "professional", "voice": "corporate", "emoji_usage": "low", "hashtag_count": "3-5"}',
 'general', 'promotional', 0.5),

('Event Announcement', 'Announce upcoming events or webinars', 'text',
 '{"structure": "📅 {event_title}\n\n{event_description}\n\n📍 When: {event_date_time}\n🌐 Where: {event_location}\n\n{key_highlights}\n\n{registration_info}\n\n{hashtags}", "placeholders": ["event_title", "event_description", "event_date_time", "event_location", "key_highlights", "registration_info", "hashtags"]}',
 '{"event_title": {"type": "string", "max_length": 100}, "event_description": {"type": "text", "max_length": 400}, "event_date_time": {"type": "string", "max_length": 100}, "event_location": {"type": "string", "max_length": 100}, "key_highlights": {"type": "text", "max_length": 300}, "registration_info": {"type": "text", "max_length": 200}, "hashtags": {"type": "array", "max_items": 5}}',
 '{"tone": "exciting", "voice": "promotional", "emoji_usage": "high", "hashtag_count": "4-6"}',
 'professionals', 'promotional', 0.6),

('Quote & Reflection', 'Share inspirational quotes with personal reflection', 'text',
 '{"structure": "✨ \"{quote_text}\" - {quote_author}\n\n{personal_reflection}\n\n{application_to_business}\n\n{engagement_question}\n\n{hashtags}", "placeholders": ["quote_text", "quote_author", "personal_reflection", "application_to_business", "engagement_question", "hashtags"]}',
 '{"quote_text": {"type": "string", "max_length": 200}, "quote_author": {"type": "string", "max_length": 50}, "personal_reflection": {"type": "text", "max_length": 300}, "application_to_business": {"type": "text", "max_length": 300}, "engagement_question": {"type": "string", "max_length": 150}, "hashtags": {"type": "array", "max_items": 4}}',
 '{"tone": "reflective", "voice": "thoughtful", "emoji_usage": "moderate", "hashtag_count": "2-4"}',
 'general', 'inspirational', 0.7);

-- Link templates to relevant topics
INSERT INTO template_topics (template_id, topic_id, relevance_score) VALUES
(1, 1, 0.9), (1, 4, 0.8), (1, 7, 0.7),
(2, 10, 0.9), (2, 4, 0.8), (2, 1, 0.7),
(3, 5, 0.8), (3, 6, 0.7), (3, 7, 0.9),
(4, 8, 0.7), (4, 9, 0.6), (4, 1, 0.5),
(5, 1, 0.8), (5, 4, 0.7), (5, 9, 0.6),
(6, 1, 0.6), (6, 2, 0.5), (6, 5, 0.4),
(7, 2, 0.7), (7, 5, 0.6), (7, 1, 0.5),
(8, 4, 0.8), (8, 10, 0.9), (8, 8, 0.6);

COMMIT;