-- Add category column to projects table for tagging/categorization
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category TEXT;

-- Add index for better query performance on category filtering
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

-- Add a comment explaining the valid categories
COMMENT ON COLUMN projects.category IS 'Project category for filtering: Healthcare, Education, Customer Service, Personal Assistant, Sales & Marketing, Entertainment, Productivity, or NULL for uncategorized'; 