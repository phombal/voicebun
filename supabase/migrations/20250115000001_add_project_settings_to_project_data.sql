-- Add project settings columns to project_data table
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS project_emoji TEXT DEFAULT '🤖';
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS project_photo TEXT;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS public_title TEXT;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS public_description TEXT;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS public_welcome_message TEXT;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS show_branding BOOLEAN DEFAULT true;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS custom_branding_text TEXT;
ALTER TABLE project_data ADD COLUMN IF NOT EXISTS custom_branding_url TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_project_data_project_emoji ON project_data(project_emoji);
CREATE INDEX IF NOT EXISTS idx_project_data_show_branding ON project_data(show_branding); 