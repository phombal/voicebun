-- Create phone_numbers table to store purchased phone numbers and their ownership
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Phone number details
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    country_code VARCHAR(2),
    phone_number_type VARCHAR(20), -- local, toll-free, mobile, etc.
    locality VARCHAR(100), -- City/region where the number is based
    
    -- Ownership information
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Telnyx integration data
    telnyx_order_id VARCHAR(100) UNIQUE, -- Telnyx number order ID
    telnyx_phone_number_id VARCHAR(100) UNIQUE, -- Telnyx phone number resource ID
    connection_id VARCHAR(100), -- Telnyx connection ID for routing calls
    messaging_profile_id VARCHAR(100), -- Telnyx messaging profile ID
    billing_group_id VARCHAR(100), -- Telnyx billing group ID
    customer_reference VARCHAR(200), -- Custom reference for tracking
    
    -- Status and metadata
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, suspended, cancelled
    is_active BOOLEAN DEFAULT true,
    
    -- Configuration for voice agent integration
    voice_agent_enabled BOOLEAN DEFAULT false,
    inbound_enabled BOOLEAN DEFAULT true,
    outbound_enabled BOOLEAN DEFAULT false,
    recording_enabled BOOLEAN DEFAULT true,
    
    -- Timestamps
    purchased_at TIMESTAMP WITH TIME ZONE,
    activated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_id ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_project_id ON phone_numbers(project_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_status ON phone_numbers(status);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_telnyx_order_id ON phone_numbers(telnyx_order_id);

-- Create updated_at trigger
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

-- Add RLS (Row Level Security) policies
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own phone numbers
CREATE POLICY "Users can view their own phone numbers" ON phone_numbers
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own phone numbers
CREATE POLICY "Users can insert their own phone numbers" ON phone_numbers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own phone numbers
CREATE POLICY "Users can update their own phone numbers" ON phone_numbers
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own phone numbers
CREATE POLICY "Users can delete their own phone numbers" ON phone_numbers
    FOR DELETE USING (auth.uid() = user_id);

-- Optional: Create a view for easier querying of active phone numbers with project details
CREATE OR REPLACE VIEW active_phone_numbers AS
SELECT 
    pn.*,
    p.name as project_name,
    p.description as project_description,
    u.email as user_email
FROM phone_numbers pn
JOIN projects p ON pn.project_id = p.id
JOIN auth.users u ON pn.user_id = u.id
WHERE pn.is_active = true AND pn.status = 'active';

-- Create a function to get phone numbers for a specific project
CREATE OR REPLACE FUNCTION get_project_phone_numbers(project_uuid UUID)
RETURNS TABLE(
    id UUID,
    phone_number VARCHAR(20),
    country_code VARCHAR(2),
    phone_number_type VARCHAR(20),
    locality VARCHAR(100),
    status VARCHAR(20),
    voice_agent_enabled BOOLEAN,
    inbound_enabled BOOLEAN,
    outbound_enabled BOOLEAN,
    recording_enabled BOOLEAN,
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
        pn.voice_agent_enabled,
        pn.inbound_enabled,
        pn.outbound_enabled,
        pn.recording_enabled,
        pn.purchased_at,
        pn.activated_at
    FROM phone_numbers pn
    WHERE pn.project_id = project_uuid 
    AND pn.is_active = true
    AND auth.uid() = pn.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to assign a phone number to a voice agent configuration
CREATE OR REPLACE FUNCTION assign_phone_number_to_agent(
    phone_number_uuid UUID,
    enable_voice_agent BOOLEAN DEFAULT true,
    enable_inbound BOOLEAN DEFAULT true,
    enable_outbound BOOLEAN DEFAULT false,
    enable_recording BOOLEAN DEFAULT true
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE phone_numbers 
    SET 
        voice_agent_enabled = enable_voice_agent,
        inbound_enabled = enable_inbound,
        outbound_enabled = enable_outbound,
        recording_enabled = enable_recording,
        updated_at = NOW()
    WHERE id = phone_number_uuid 
    AND user_id = auth.uid()
    AND status = 'active';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 