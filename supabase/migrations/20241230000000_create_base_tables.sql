-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  initial_prompt TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  category TEXT,
  project_emoji TEXT,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_data table
CREATE TABLE IF NOT EXISTS project_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- System Prompt & Instructions
  system_prompt TEXT NOT NULL DEFAULT '',
  agent_instructions TEXT,
  first_message_mode TEXT NOT NULL DEFAULT 'wait' CHECK (first_message_mode IN ('wait', 'speak_first', 'speak_first_with_model_generated_message')),
  
  -- Base Model Configuration
  llm_provider TEXT NOT NULL DEFAULT 'openai' CHECK (llm_provider IN ('openai', 'anthropic', 'google', 'azure', 'xai')),
  llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  llm_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.7,
  llm_max_response_length INTEGER NOT NULL DEFAULT 150 CHECK (llm_max_response_length IN (150, 300, 500, 1000)),
  
  -- Speech-to-Text Configuration
  stt_provider TEXT NOT NULL DEFAULT 'deepgram' CHECK (stt_provider IN ('deepgram')),
  stt_language TEXT NOT NULL DEFAULT 'en' CHECK (stt_language IN ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh')),
  stt_quality TEXT NOT NULL DEFAULT 'standard' CHECK (stt_quality IN ('standard', 'enhanced', 'premium')),
  stt_processing_mode TEXT NOT NULL DEFAULT 'streaming' CHECK (stt_processing_mode IN ('streaming', 'batch')),
  stt_noise_suppression BOOLEAN NOT NULL DEFAULT false,
  stt_auto_punctuation BOOLEAN NOT NULL DEFAULT true,
  
  -- Text-to-Speech Configuration
  tts_provider TEXT NOT NULL DEFAULT 'cartesia' CHECK (tts_provider IN ('cartesia', 'openai', 'clone_voice')),
  tts_voice TEXT NOT NULL DEFAULT 'neutral',
  
  -- Phone Configuration
  phone_number TEXT,
  phone_inbound_enabled BOOLEAN NOT NULL DEFAULT false,
  phone_outbound_enabled BOOLEAN NOT NULL DEFAULT false,
  phone_recording_enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Performance Settings
  response_latency_priority TEXT NOT NULL DEFAULT 'balanced' CHECK (response_latency_priority IN ('speed', 'balanced', 'quality')),
  
  -- Knowledge Base Files
  knowledge_base_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Functions & Tools
  functions_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_functions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Webhooks
  webhooks_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  webhook_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Community Publishing Fields
  project_emoji TEXT,
  project_photo TEXT,
  public_title TEXT,
  public_description TEXT,
  public_welcome_message TEXT,
  show_branding BOOLEAN DEFAULT true,
  custom_branding_text TEXT,
  custom_branding_url TEXT,
  
  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create phone_numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  country_code TEXT,
  phone_number_type TEXT,
  locality TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  telnyx_order_id TEXT,
  telnyx_phone_number_id TEXT,
  connection_id TEXT,
  messaging_profile_id TEXT,
  billing_group_id TEXT,
  customer_reference TEXT,
  dispatch_rule_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  voice_agent_enabled BOOLEAN NOT NULL DEFAULT false,
  inbound_enabled BOOLEAN NOT NULL DEFAULT false,
  outbound_enabled BOOLEAN NOT NULL DEFAULT false,
  recording_enabled BOOLEAN NOT NULL DEFAULT false,
  purchased_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS projects_visibility_idx ON projects(visibility);
CREATE INDEX IF NOT EXISTS projects_category_idx ON projects(category);

CREATE INDEX IF NOT EXISTS project_data_project_id_idx ON project_data(project_id);
CREATE INDEX IF NOT EXISTS project_data_user_id_idx ON project_data(user_id);
CREATE INDEX IF NOT EXISTS project_data_is_active_idx ON project_data(is_active);

CREATE INDEX IF NOT EXISTS phone_numbers_user_id_idx ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS phone_numbers_project_id_idx ON phone_numbers(project_id);
CREATE INDEX IF NOT EXISTS phone_numbers_status_idx ON phone_numbers(status);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for projects
DO $$ BEGIN
  CREATE POLICY "Users can view their own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view public projects" ON projects
    FOR SELECT USING (visibility = 'public');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create RLS policies for project_data
DO $$ BEGIN
  CREATE POLICY "Users can view their own project data" ON project_data
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own project data" ON project_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own project data" ON project_data
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own project data" ON project_data
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create RLS policies for phone_numbers
DO $$ BEGIN
  CREATE POLICY "Users can view their own phone numbers" ON phone_numbers
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own phone numbers" ON phone_numbers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own phone numbers" ON phone_numbers
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own phone numbers" ON phone_numbers
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create functions to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_project_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_phone_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

DROP TRIGGER IF EXISTS update_project_data_updated_at ON project_data;
CREATE TRIGGER update_project_data_updated_at
  BEFORE UPDATE ON project_data
  FOR EACH ROW
  EXECUTE FUNCTION update_project_data_updated_at();

DROP TRIGGER IF EXISTS update_phone_numbers_updated_at ON phone_numbers;
CREATE TRIGGER update_phone_numbers_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_numbers_updated_at(); 