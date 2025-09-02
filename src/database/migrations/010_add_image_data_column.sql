-- Migration: Add image_data column to generated_content table
-- Created: 2024-01-31
-- Description: Adds image_data column to store generated image information

BEGIN;

-- Add image_data column to generated_content table
ALTER TABLE generated_content 
ADD COLUMN IF NOT EXISTS image_data JSONB;

-- Add index for image_data queries
CREATE INDEX IF NOT EXISTS idx_generated_content_image_data 
    ON generated_content USING GIN(image_data) 
    WHERE image_data IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN generated_content.image_data IS 'JSON structure containing generated image URLs, prompts, and metadata';

COMMIT;