-- Create user_plans table
CREATE TABLE IF NOT EXISTS user_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free' CHECK (plan_name IN ('free', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  conversation_minutes_used INTEGER DEFAULT 0,
  conversation_minutes_limit INTEGER DEFAULT 5, -- Free plan default
  phone_number_count INTEGER DEFAULT 0,
  phone_number_limit INTEGER DEFAULT 1, -- Free plan default
  custom_voices JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on user_id to ensure one plan per user
CREATE UNIQUE INDEX IF NOT EXISTS user_plans_user_id_idx ON user_plans(user_id);

-- Create index on stripe_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS user_plans_stripe_customer_id_idx ON user_plans(stripe_customer_id);

-- Create index on stripe_subscription_id for faster lookups
CREATE INDEX IF NOT EXISTS user_plans_stripe_subscription_id_idx ON user_plans(stripe_subscription_id);

-- Enable RLS
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$ BEGIN
  CREATE POLICY "Users can view their own plan" ON user_plans
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own plan" ON user_plans
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own plan" ON user_plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_user_plans_updated_at ON user_plans;
CREATE TRIGGER update_user_plans_updated_at
  BEFORE UPDATE ON user_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_user_plans_updated_at();

-- Create default free plan for existing users
INSERT INTO user_plans (user_id, plan_name, subscription_status, conversation_minutes_limit)
SELECT 
  id,
  'free',
  'inactive',
  5
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_plans)
ON CONFLICT (user_id) DO NOTHING;

-- Create function to automatically create user plan for new users
CREATE OR REPLACE FUNCTION create_user_plan_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert user plan with proper error handling
  INSERT INTO public.user_plans (
    user_id,
    plan_name,
    subscription_status,
    conversation_minutes_used,
    conversation_minutes_limit,
    phone_number_count,
    phone_number_limit,
    cancel_at_period_end
  ) VALUES (
    NEW.id,
    'free',
    'active',
    0,
    5,
    0,
    1,
    false
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create user plan for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove the trigger for now - we'll rely on client-side creation
DROP TRIGGER IF EXISTS create_user_plan_on_signup ON auth.users; 