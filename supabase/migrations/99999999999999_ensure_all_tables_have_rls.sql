-- Comprehensive RLS security audit and fix
-- This migration ensures all user tables have RLS enabled with proper policies

-- Enable RLS on all user tables (if not already enabled)
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_plans ENABLE ROW LEVEL SECURITY;

-- Projects table policies
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

CREATE POLICY "Users can view their own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- Project data table policies
DROP POLICY IF EXISTS "Users can view their project data" ON project_data;
DROP POLICY IF EXISTS "Users can insert their project data" ON project_data;
DROP POLICY IF EXISTS "Users can update their project data" ON project_data;
DROP POLICY IF EXISTS "Users can delete their project data" ON project_data;

CREATE POLICY "Users can view their project data" ON project_data
    FOR SELECT USING (
        auth.uid() IN (
            SELECT user_id FROM projects WHERE projects.id = project_data.project_id
        )
    );

CREATE POLICY "Users can insert their project data" ON project_data
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM projects WHERE projects.id = project_data.project_id
        )
    );

CREATE POLICY "Users can update their project data" ON project_data
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM projects WHERE projects.id = project_data.project_id
        )
    ) WITH CHECK (
        auth.uid() IN (
            SELECT user_id FROM projects WHERE projects.id = project_data.project_id
        )
    );

CREATE POLICY "Users can delete their project data" ON project_data
    FOR DELETE USING (
        auth.uid() IN (
            SELECT user_id FROM projects WHERE projects.id = project_data.project_id
        )
    );

-- Conversations table policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
        DROP POLICY IF EXISTS "Users can insert their conversations" ON conversations;
        DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
        DROP POLICY IF EXISTS "Users can delete their conversations" ON conversations;

        CREATE POLICY "Users can view their conversations" ON conversations
            FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "Users can insert their conversations" ON conversations
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their conversations" ON conversations
            FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can delete their conversations" ON conversations
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create security audit function
CREATE OR REPLACE FUNCTION audit_table_security()
RETURNS TABLE(
    table_name TEXT,
    rls_enabled BOOLEAN,
    policy_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tablename::TEXT,
        t.rowsecurity,
        COUNT(p.policyname)
    FROM pg_tables t
    LEFT JOIN pg_policies p ON t.tablename = p.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT LIKE '__%'
    GROUP BY t.tablename, t.rowsecurity
    ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION audit_table_security() TO authenticated; 