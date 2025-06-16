-- Create or replace the increment_phone_number_count function
CREATE OR REPLACE FUNCTION increment_phone_number_count(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update user plan
  INSERT INTO user_plans (user_id, phone_number_count, phone_number_limit, plan_name, subscription_status, conversation_minutes_used, conversation_minutes_limit, cancel_at_period_end)
  VALUES (user_id, 1, 1, 'free', 'active', 0, 5, false)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    phone_number_count = LEAST(user_plans.phone_number_count + 1, user_plans.phone_number_limit),
    updated_at = NOW();
END;
$$;

-- Create or replace the decrement_phone_number_count function
CREATE OR REPLACE FUNCTION decrement_phone_number_count(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update existing user plan
  UPDATE user_plans 
  SET 
    phone_number_count = GREATEST(phone_number_count - 1, 0),
    updated_at = NOW()
  WHERE user_plans.user_id = decrement_phone_number_count.user_id;
END;
$$;

-- Create or replace the sync_phone_number_count function
CREATE OR REPLACE FUNCTION sync_phone_number_count(user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  actual_count INTEGER;
BEGIN
  -- Count actual active phone numbers for the user
  SELECT COUNT(*) INTO actual_count
  FROM phone_numbers 
  WHERE phone_numbers.user_id = sync_phone_number_count.user_id 
    AND is_active = true;
  
  -- Update user plan with actual count
  INSERT INTO user_plans (user_id, phone_number_count, phone_number_limit, plan_name, subscription_status, conversation_minutes_used, conversation_minutes_limit, cancel_at_period_end)
  VALUES (user_id, actual_count, 1, 'free', 'active', 0, 5, false)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    phone_number_count = actual_count,
    updated_at = NOW();
END;
$$; 