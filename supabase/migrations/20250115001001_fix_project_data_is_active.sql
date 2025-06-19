-- Fix existing project_data records that are missing is_active flag
-- Set is_active to true for records where it's NULL or false (assuming they should be active)
UPDATE project_data 
SET is_active = true 
WHERE is_active IS NULL OR is_active = false;

-- Add a default value for is_active column if it doesn't have one
ALTER TABLE project_data ALTER COLUMN is_active SET DEFAULT true;

-- Add version default if it doesn't exist
UPDATE project_data 
SET version = 1 
WHERE version IS NULL;

ALTER TABLE project_data ALTER COLUMN version SET DEFAULT 1; 