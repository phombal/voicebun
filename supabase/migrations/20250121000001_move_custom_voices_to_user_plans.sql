-- Migration: Move custom_voices from projects to user_plans table
-- Date: 2025-01-21

-- Step 1: Add custom_voices column to user_plans table
ALTER TABLE user_plans 
ADD COLUMN custom_voices JSONB DEFAULT '[]'::jsonb;

-- Step 2: Create index for querying custom voices on user_plans table
CREATE INDEX idx_user_plans_custom_voices ON user_plans USING GIN (custom_voices);

-- Step 3: Migrate existing custom_voices data from projects to user_plans
UPDATE user_plans 
SET custom_voices = COALESCE(
  (
    SELECT JSONB_AGG(DISTINCT voice)
    FROM (
      SELECT JSONB_ARRAY_ELEMENTS(p.custom_voices) as voice
      FROM projects p
      WHERE p.user_id = user_plans.user_id 
        AND p.custom_voices IS NOT NULL
        AND JSONB_ARRAY_LENGTH(p.custom_voices) > 0
    ) voices
  ), 
  '[]'::jsonb
);

-- Step 4: Remove custom_voices column from projects table
ALTER TABLE projects 
DROP COLUMN IF EXISTS custom_voices;

-- Step 5: Add comment documenting the custom_voices column structure
COMMENT ON COLUMN user_plans.custom_voices IS 'Array of custom voice clones for the user. Structure: [{"id": "voice_id", "displayName": "Voice Name", "createdAt": "2025-01-21T12:00:00Z"}]'; 