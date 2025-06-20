-- Add custom_voices column to project_data table
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS custom_voices JSONB DEFAULT '[]'::jsonb;

-- Create index for better performance when querying custom voices
CREATE INDEX IF NOT EXISTS idx_project_data_custom_voices ON project_data USING GIN (custom_voices);

-- Add comment to document the column structure
COMMENT ON COLUMN project_data.custom_voices IS 'Array of custom voice clones created by the user. Each voice object contains: {id: string, displayName: string, createdAt: string}'; 