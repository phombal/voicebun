-- Add project_name column to project_data table
ALTER TABLE project_data 
ADD COLUMN project_name VARCHAR(255);

-- Add index for project_name for better query performance
CREATE INDEX idx_project_data_project_name ON project_data(project_name);

-- Add comment to describe the column
COMMENT ON COLUMN project_data.project_name IS 'User-defined name for the project (editable)'; 