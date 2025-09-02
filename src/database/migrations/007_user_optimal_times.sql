-- Migration: Add user_optimal_times table for caching personalized optimal posting times
-- Created: 2024
-- Description: Stores calculated optimal posting times for each user based on their historical performance

CREATE TABLE IF NOT EXISTS user_optimal_times (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    optimal_times_data JSONB NOT NULL,
    confidence_level VARCHAR(20) DEFAULT 'medium',
    data_points_count INTEGER DEFAULT 0,
    analysis_period_days INTEGER DEFAULT 90,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on user_id to ensure one record per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_optimal_times_user_id ON user_optimal_times(user_id);

-- Create index on updated_at for cache invalidation queries
CREATE INDEX IF NOT EXISTS idx_user_optimal_times_updated_at ON user_optimal_times(updated_at);

-- Create index on confidence_level for filtering
CREATE INDEX IF NOT EXISTS idx_user_optimal_times_confidence ON user_optimal_times(confidence_level);

-- Add comments for documentation
COMMENT ON TABLE user_optimal_times IS 'Stores personalized optimal posting times calculated from user analytics';
COMMENT ON COLUMN user_optimal_times.optimal_times_data IS 'JSON structure containing weekday/weekend times, content-specific times, and scores';
COMMENT ON COLUMN user_optimal_times.confidence_level IS 'Confidence in the data: low (<20 posts), medium (20-50 posts), high (>50 posts)';
COMMENT ON COLUMN user_optimal_times.data_points_count IS 'Number of historical posts used in the analysis';
COMMENT ON COLUMN user_optimal_times.analysis_period_days IS 'Number of days back analyzed for the calculation';

-- Example of optimal_times_data structure:
/*
{
  "weekdays": {
    "morning": { "hour": 8, "minute": 0, "score": 0.85, "confidence": "high" },
    "midday": { "hour": 13, "minute": 30, "score": 0.72, "confidence": "medium" },
    "evening": { "hour": 19, "minute": 0, "score": 0.91, "confidence": "high" }
  },
  "weekends": {
    "morning": { "hour": 10, "minute": 0, "score": 0.68, "confidence": "medium" },
    "afternoon": { "hour": 15, "minute": 0, "score": 0.75, "confidence": "high" },
    "evening": { "hour": 20, "minute": 0, "score": 0.88, "confidence": "high" }
  },
  "contentSpecific": {
    "article": { "hour": 9, "minute": 0, "score": 0.82, "confidence": "high" },
    "image": { "hour": 18, "minute": 0, "score": 0.89, "confidence": "high" },
    "video": { "hour": 20, "minute": 0, "score": 0.93, "confidence": "medium" }
  },
  "confidence": "high",
  "specialPeriod": null
}
*/