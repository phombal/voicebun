-- Add category column to project_data table for tagging/categorization
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS category TEXT;

-- Add index for better query performance on category filtering
CREATE INDEX IF NOT EXISTS idx_project_data_category ON project_data(category);

-- Add a comment explaining the valid categories
COMMENT ON COLUMN project_data.category IS 'Project category for filtering: Healthcare, Education, Customer Service, Personal Assistant, Sales & Marketing, Entertainment, Productivity, or NULL for uncategorized'; 