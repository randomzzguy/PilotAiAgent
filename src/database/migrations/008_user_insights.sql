-- Migration: Add user_insights table for storing user performance insights and recommendations
-- Created: 2024-01-31
-- Description: This table stores various insights about user posting patterns, performance metrics, and recommendations

CREATE TABLE IF NOT EXISTS user_insights (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    insight_data JSONB NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_insights_user_id ON user_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_user_insights_type ON user_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_user_insights_created_at ON user_insights(created_at);
CREATE INDEX IF NOT EXISTS idx_user_insights_confidence ON user_insights(confidence_score);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_user_insights_user_type ON user_insights(user_id, insight_type);

-- Create unique constraint for certain insight types that should only have one record per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_insights_unique_next_optimal 
    ON user_insights(user_id, insight_type) 
    WHERE insight_type = 'next_optimal_time';

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_insights_updated_at
    BEFORE UPDATE ON user_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_user_insights_updated_at();

-- Add comments for documentation
COMMENT ON TABLE user_insights IS 'Stores user performance insights, recommendations, and analytics data';
COMMENT ON COLUMN user_insights.insight_type IS 'Type of insight: performance_analysis, next_optimal_time, content_recommendations, etc.';
COMMENT ON COLUMN user_insights.insight_data IS 'JSON data containing the actual insight information';
COMMENT ON COLUMN user_insights.confidence_score IS 'Confidence level of the insight (0.0 to 1.0)';

-- Insert some example insight types for reference
INSERT INTO user_insights (user_id, insight_type, insight_data, confidence_score, created_at)
SELECT 
    1 as user_id,
    'example_insight_types' as insight_type,
    jsonb_build_object(
        'available_types', jsonb_build_array(
            'performance_analysis',
            'next_optimal_time', 
            'content_recommendations',
            'engagement_patterns',
            'posting_frequency_suggestions',
            'audience_insights',
            'competitor_analysis',
            'seasonal_trends'
        ),
        'description', 'This record documents the available insight types in the system'
    ) as insight_data,
    1.0 as confidence_score,
    CURRENT_TIMESTAMP as created_at
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT DO NOTHING;