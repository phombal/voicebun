-- Add project_emoji column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_emoji TEXT;

-- Add index for better query performance on emoji filtering
CREATE INDEX IF NOT EXISTS idx_projects_emoji ON projects(project_emoji);

-- Add a comment explaining the project emoji field
COMMENT ON COLUMN projects.project_emoji IS 'Project emoji for display and categorization, typically corresponds to the project category'; 