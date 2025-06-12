-- Add dispatch_rule_id to phone_numbers table
-- This will store the LiveKit SIP dispatch rule ID associated with each phone number

ALTER TABLE phone_numbers 
ADD COLUMN dispatch_rule_id VARCHAR(100) NULL;

-- Add an index for the dispatch_rule_id for performance
CREATE INDEX IF NOT EXISTS idx_phone_numbers_dispatch_rule_id ON phone_numbers(dispatch_rule_id);

-- Add a comment to document the field
COMMENT ON COLUMN phone_numbers.dispatch_rule_id IS 'LiveKit SIP dispatch rule ID associated with this phone number'; 