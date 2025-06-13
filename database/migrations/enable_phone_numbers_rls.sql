-- Migration: Enable RLS on phone_numbers table and make project_id nullable
-- Run this script to update your existing phone_numbers table

-- First, make project_id nullable (if it's currently NOT NULL)
ALTER TABLE phone_numbers 
ALTER COLUMN project_id DROP NOT NULL;

-- Change the foreign key constraint to SET NULL on delete
ALTER TABLE phone_numbers 
DROP CONSTRAINT IF EXISTS phone_numbers_project_id_fkey;

ALTER TABLE phone_numbers 
ADD CONSTRAINT phone_numbers_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- Add missing columns if they don't exist
ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
ADD COLUMN IF NOT EXISTS phone_number_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS locality VARCHAR(100),
ADD COLUMN IF NOT EXISTS connection_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS messaging_profile_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS billing_group_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS customer_reference VARCHAR(200),
ADD COLUMN IF NOT EXISTS dispatch_rule_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS inbound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS outbound_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recording_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

-- Create additional indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_dispatch_rule_id ON phone_numbers(dispatch_rule_id);

-- Enable RLS (Row Level Security)
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Users can insert their own phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Users can update their own phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Users can delete their own phone numbers" ON phone_numbers;

-- Create RLS Policies: Users can only access their own phone numbers
CREATE POLICY "Users can view their own phone numbers" ON phone_numbers
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own phone numbers" ON phone_numbers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own phone numbers" ON phone_numbers
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own phone numbers" ON phone_numbers
    FOR DELETE USING (auth.uid() = user_id);

-- Create helper functions for phone number management

-- Function to get unassigned phone numbers for a user
CREATE OR REPLACE FUNCTION get_unassigned_phone_numbers()
RETURNS TABLE(
    id UUID,
    phone_number VARCHAR(20),
    country_code VARCHAR(2),
    phone_number_type VARCHAR(20),
    locality VARCHAR(100),
    status VARCHAR(20),
    purchased_at TIMESTAMP WITH TIME ZONE,
    activated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pn.id,
        pn.phone_number,
        pn.country_code,
        pn.phone_number_type,
        pn.locality,
        pn.status,
        pn.purchased_at,
        pn.activated_at
    FROM phone_numbers pn
    WHERE pn.project_id IS NULL 
    AND pn.is_active = true
    AND pn.status = 'active'
    AND auth.uid() = pn.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign a phone number to a project
CREATE OR REPLACE FUNCTION assign_phone_number_to_project(
    phone_number_uuid UUID,
    target_project_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    project_owner UUID;
BEGIN
    -- Check if the project belongs to the current user
    SELECT user_id INTO project_owner 
    FROM projects 
    WHERE id = target_project_id;
    
    IF project_owner != auth.uid() THEN
        RETURN FALSE;
    END IF;
    
    -- Update the phone number assignment
    UPDATE phone_numbers 
    SET 
        project_id = target_project_id,
        updated_at = NOW()
    WHERE id = phone_number_uuid 
    AND user_id = auth.uid()
    AND status = 'active';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unassign a phone number from a project
CREATE OR REPLACE FUNCTION unassign_phone_number_from_project(
    phone_number_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE phone_numbers 
    SET 
        project_id = NULL,
        voice_agent_enabled = FALSE,
        dispatch_rule_id = NULL,
        updated_at = NOW()
    WHERE id = phone_number_uuid 
    AND user_id = auth.uid();
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 
 