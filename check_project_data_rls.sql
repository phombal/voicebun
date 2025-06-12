-- Check if RLS is enabled and what policies exist for project_data table
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'project_data';

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'project_data';

-- Check if the table exists and its structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'project_data' 
ORDER BY ordinal_position; 