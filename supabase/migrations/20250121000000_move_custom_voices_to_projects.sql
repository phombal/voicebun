-- Migration: Move custom_voices from project_data to projects table
-- Date: 2025-01-21

-- Step 1: Add custom_voices column to projects table
ALTER TABLE projects 
ADD COLUMN custom_voices JSONB DEFAULT '[]'::jsonb;

-- Step 2: Create index for querying custom voices on projects table
CREATE INDEX idx_projects_custom_voices ON projects USING GIN (custom_voices);

-- Step 3: Migrate existing custom_voices data from project_data to projects
UPDATE projects 
SET custom_voices = COALESCE(
  (
    SELECT pd.custom_voices 
    FROM project_data pd 
    WHERE pd.project_id = projects.id 
      AND pd.is_active = true 
      AND pd.custom_voices IS NOT NULL
    ORDER BY pd.updated_at DESC 
    LIMIT 1
  ), 
  '[]'::jsonb
);

-- Step 4: Remove custom_voices column from project_data table
ALTER TABLE project_data 
DROP COLUMN IF EXISTS custom_voices;

-- Step 5: Add comment documenting the custom_voices column structure
COMMENT ON COLUMN projects.custom_voices IS 'Array of custom voice clones. Structure: [{"id": "voice_id", "displayName": "Voice Name", "createdAt": "2025-01-21T12:00:00Z"}]'; 