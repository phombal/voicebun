-- Simplified phone_numbers table
-- Drop existing table and recreate (be careful in production!)
DROP TABLE IF EXISTS phone_numbers CASCADE;

-- Create simplified phone_numbers table
CREATE TABLE phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Essential phone number info
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    
    -- Ownership (simplified)
    user_id UUID NOT NULL,
    project_id UUID, -- Allow NULL for unassigned numbers
    
    -- Telnyx basics (optional)
    telnyx_order_id VARCHAR(100),
    telnyx_phone_number_id VARCHAR(100),
    
    -- Simple status
    status VARCHAR(20) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    
    -- Voice agent settings (simplified)
    voice_agent_enabled BOOLEAN DEFAULT false, -- Default to false for unassigned numbers
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Basic indexes
CREATE INDEX idx_phone_numbers_user_id ON phone_numbers(user_id);
CREATE INDEX idx_phone_numbers_project_id ON phone_numbers(project_id);
CREATE INDEX idx_phone_numbers_phone_number ON phone_numbers(phone_number);

-- Simple updated_at trigger
CREATE OR REPLACE FUNCTION update_phone_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_phone_numbers_updated_at
    BEFORE UPDATE ON phone_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_phone_numbers_updated_at();

-- NO RLS - Allow all operations for now to avoid auth issues
-- This makes it much simpler for server-side operations 