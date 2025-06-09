-- Voice Assistant Project Database Schema for Supabase
-- This schema tracks chat conversations, code changes, and project history

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent configurations table - Stores extracted agent configurations for testing
CREATE TABLE public.agent_configurations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    config_name TEXT NOT NULL,
    description TEXT,
    stt_provider TEXT NOT NULL,
    stt_model TEXT NOT NULL,
    stt_config JSONB DEFAULT '{}',
    tts_provider TEXT NOT NULL,
    tts_model TEXT NOT NULL,
    tts_config JSONB DEFAULT '{}',
    llm_provider TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    llm_config JSONB DEFAULT '{}',
    vad_provider TEXT NOT NULL DEFAULT 'silero',
    vad_config JSONB DEFAULT '{}',
    turn_detection_config JSONB DEFAULT '{}',
    function_calls JSONB DEFAULT '[]',
    tool_integrations JSONB DEFAULT '[]',
    agent_instructions TEXT NOT NULL,
    agent_personality JSONB DEFAULT '{}',
    required_env_vars JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    source_files JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table - Each voice agent project
CREATE TABLE public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    initial_prompt TEXT NOT NULL,
    config JSONB NOT NULL, -- Stores VoiceAgentConfig
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions - Each conversation session within a project
CREATE TABLE public.chat_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    title TEXT, -- Auto-generated or user-defined title
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}' -- Additional session metadata
);

-- Chat messages - Individual messages in conversations
CREATE TABLE public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_checkpoint BOOLEAN DEFAULT false, -- Marks messages that created code changes
    context_data JSONB DEFAULT '{}', -- Conversation context at this point
    metadata JSONB DEFAULT '{}' -- Additional message metadata
);

-- Project files - Current state of all files in a project
CREATE TABLE public.project_files (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, -- e.g., '/voice_agent.py', '/config/settings.py'
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('file', 'folder')),
    content TEXT, -- NULL for folders
    language TEXT, -- Programming language for syntax highlighting
    size_bytes INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    parent_path TEXT, -- For folder structure
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique file paths per project
    UNIQUE(project_id, file_path)
);

-- File snapshots - Version history for each file
CREATE TABLE public.file_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    file_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    change_description TEXT,
    diff_content TEXT, -- Stores the diff from previous version
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

-- Index for efficient version queries
CREATE INDEX idx_file_snapshots_file_version ON public.file_snapshots(file_id, version);

-- Project snapshots - Complete project state at specific points
CREATE TABLE public.project_snapshots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
    snapshot_name TEXT,
    description TEXT,
    files_data JSONB NOT NULL, -- Complete file structure and content
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

-- Code changes - Track individual code modifications
CREATE TABLE public.code_changes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    file_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'rename')),
    old_content TEXT, -- Previous content (for updates)
    new_content TEXT, -- New content
    diff_content TEXT, -- Diff representation
    line_changes JSONB, -- Detailed line-by-line changes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences and settings
CREATE TABLE public.user_preferences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE UNIQUE,
    editor_theme TEXT DEFAULT 'vs-dark',
    auto_save_enabled BOOLEAN DEFAULT true,
    notification_preferences JSONB DEFAULT '{}',
    ui_preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project collaborators (for future team features)
CREATE TABLE public.project_collaborators (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    invited_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure unique collaborator per project
    UNIQUE(project_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_projects_updated_at ON public.projects(updated_at DESC);
CREATE INDEX idx_agent_configurations_project_id ON public.agent_configurations(project_id);
CREATE INDEX idx_agent_configurations_user_id ON public.agent_configurations(user_id);
CREATE INDEX idx_agent_configurations_updated_at ON public.agent_configurations(updated_at DESC);
CREATE INDEX idx_chat_sessions_project_id ON public.chat_sessions(project_id);
CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX idx_chat_messages_timestamp ON public.chat_messages(timestamp);
CREATE INDEX idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX idx_project_files_parent_path ON public.project_files(parent_path);
CREATE INDEX idx_file_snapshots_project_id ON public.file_snapshots(project_id);
CREATE INDEX idx_code_changes_project_id ON public.code_changes(project_id);
CREATE INDEX idx_code_changes_session_id ON public.code_changes(session_id);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects policies
CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.project_collaborators 
            WHERE project_id = projects.id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.project_collaborators 
            WHERE project_id = projects.id AND user_id = auth.uid() AND role IN ('owner', 'editor')
        )
    );

-- Agent configurations policies
CREATE POLICY "Users can view agent configurations for accessible projects" ON public.agent_configurations
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_collaborators pc ON p.id = pc.project_id 
            WHERE p.id = agent_configurations.project_id AND pc.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create agent configurations for accessible projects" ON public.agent_configurations
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE id = project_id AND (
                user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = projects.id AND user_id = auth.uid() AND role IN ('owner', 'editor')
                )
            )
        )
    );

CREATE POLICY "Users can update agent configurations for editable projects" ON public.agent_configurations
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_collaborators pc ON p.id = pc.project_id 
            WHERE p.id = agent_configurations.project_id AND pc.user_id = auth.uid() AND pc.role IN ('owner', 'editor')
        )
    );

-- Chat sessions policies
CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.projects p 
            JOIN public.project_collaborators pc ON p.id = pc.project_id 
            WHERE p.id = chat_sessions.project_id AND pc.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create chat sessions for accessible projects" ON public.chat_sessions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE id = project_id AND (
                user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = projects.id AND user_id = auth.uid()
                )
            )
        )
    );

-- Chat messages policies
CREATE POLICY "Users can view messages in accessible sessions" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions cs
            JOIN public.projects p ON cs.project_id = p.id
            WHERE cs.id = chat_messages.session_id AND (
                p.user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = p.id AND user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can create messages in accessible sessions" ON public.chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.chat_sessions cs
            JOIN public.projects p ON cs.project_id = p.id
            WHERE cs.id = session_id AND (
                p.user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = p.id AND user_id = auth.uid()
                )
            )
        )
    );

-- Project files policies
CREATE POLICY "Users can view files in accessible projects" ON public.project_files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE id = project_id AND (
                user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = projects.id AND user_id = auth.uid()
                )
            )
        )
    );

CREATE POLICY "Users can modify files in editable projects" ON public.project_files
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE id = project_id AND (
                user_id = auth.uid() OR 
                EXISTS (
                    SELECT 1 FROM public.project_collaborators 
                    WHERE project_id = projects.id AND user_id = auth.uid() AND role IN ('owner', 'editor')
                )
            )
        )
    );

-- Similar policies for other tables...
-- (File snapshots, project snapshots, code changes, etc.)

-- Functions for automatic updates

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_configurations_updated_at BEFORE UPDATE ON public.agent_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_files_updated_at BEFORE UPDATE ON public.project_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically update message count in chat sessions
CREATE OR REPLACE FUNCTION update_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.chat_sessions 
        SET message_count = message_count + 1 
        WHERE id = NEW.session_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.chat_sessions 
        SET message_count = message_count - 1 
        WHERE id = OLD.session_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Trigger for message count
CREATE TRIGGER update_message_count AFTER INSERT OR DELETE ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION update_session_message_count();

-- Function to create automatic snapshots on significant changes
CREATE OR REPLACE FUNCTION create_automatic_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Create a project snapshot when a checkpoint message is created
    IF NEW.is_checkpoint = true AND NEW.role = 'assistant' THEN
        INSERT INTO public.project_snapshots (
            project_id,
            session_id,
            message_id,
            snapshot_name,
            description,
            files_data,
            created_by_user_id
        )
        SELECT 
            cs.project_id,
            NEW.session_id,
            NEW.id,
            'Auto-snapshot: ' || to_char(NEW.timestamp, 'YYYY-MM-DD HH24:MI'),
            'Automatic snapshot created from checkpoint message',
            jsonb_build_object(
                'files', 
                jsonb_agg(
                    jsonb_build_object(
                        'path', pf.file_path,
                        'name', pf.file_name,
                        'type', pf.file_type,
                        'content', pf.content,
                        'version', pf.version
                    )
                )
            ),
            NEW.user_id
        FROM public.chat_sessions cs
        JOIN public.project_files pf ON pf.project_id = cs.project_id
        WHERE cs.id = NEW.session_id AND pf.is_deleted = false
        GROUP BY cs.project_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for automatic snapshots
CREATE TRIGGER create_checkpoint_snapshot AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION create_automatic_snapshot();

-- Views for common queries

-- View for project overview with latest activity
CREATE VIEW public.project_overview AS
SELECT 
    p.*,
    cs.latest_session_date,
    cs.total_sessions,
    cm.total_messages,
    pf.total_files
FROM public.projects p
LEFT JOIN (
    SELECT 
        project_id,
        MAX(started_at) as latest_session_date,
        COUNT(*) as total_sessions
    FROM public.chat_sessions
    GROUP BY project_id
) cs ON p.id = cs.project_id
LEFT JOIN (
    SELECT 
        cs.project_id,
        COUNT(cm.*) as total_messages
    FROM public.chat_sessions cs
    JOIN public.chat_messages cm ON cs.id = cm.session_id
    GROUP BY cs.project_id
) cm ON p.id = cm.project_id
LEFT JOIN (
    SELECT 
        project_id,
        COUNT(*) as total_files
    FROM public.project_files
    WHERE is_deleted = false AND file_type = 'file'
    GROUP BY project_id
) pf ON p.id = pf.project_id;

-- View for recent chat activity
CREATE VIEW public.recent_chat_activity AS
SELECT 
    cm.*,
    cs.project_id,
    p.name as project_name,
    up.full_name as user_name
FROM public.chat_messages cm
JOIN public.chat_sessions cs ON cm.session_id = cs.id
JOIN public.projects p ON cs.project_id = p.id
JOIN public.user_profiles up ON cm.user_id = up.id
ORDER BY cm.timestamp DESC;

-- View for file change history
CREATE VIEW public.file_change_history AS
SELECT 
    cc.*,
    pf.file_name,
    pf.file_path,
    p.name as project_name,
    cm.content as message_content,
    cm.timestamp as change_timestamp
FROM public.code_changes cc
JOIN public.project_files pf ON cc.file_id = pf.id
JOIN public.projects p ON cc.project_id = p.id
JOIN public.chat_messages cm ON cc.message_id = cm.id
ORDER BY cc.created_at DESC; 