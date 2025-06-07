-- Views for aggregated data and analytics

-- Drop existing views first to avoid column conflicts
DROP VIEW IF EXISTS project_overview CASCADE;
DROP VIEW IF EXISTS recent_chat_activity CASCADE;
DROP VIEW IF EXISTS file_change_history CASCADE;
DROP VIEW IF EXISTS user_activity_summary CASCADE;
DROP VIEW IF EXISTS project_collaboration_overview CASCADE;
DROP VIEW IF EXISTS file_version_history CASCADE;

-- Project overview with aggregated statistics
CREATE VIEW project_overview AS
SELECT 
  p.id,
  p.user_id,
  p.name,
  p.description,
  p.status,
  p.created_at,
  p.updated_at,
  p.last_accessed_at,
  COALESCE(session_stats.total_sessions, 0) as total_sessions,
  COALESCE(message_stats.total_messages, 0) as total_messages,
  COALESCE(file_stats.total_files, 0) as total_files,
  GREATEST(
    p.updated_at,
    session_stats.last_session,
    message_stats.last_message
  ) as last_activity
FROM projects p
LEFT JOIN (
  SELECT 
    project_id,
    COUNT(*) as total_sessions,
    MAX(started_at) as last_session
  FROM chat_sessions
  GROUP BY project_id
) session_stats ON p.id = session_stats.project_id
LEFT JOIN (
  SELECT 
    cs.project_id,
    COUNT(cm.*) as total_messages,
    MAX(cm.timestamp) as last_message
  FROM chat_sessions cs
  LEFT JOIN chat_messages cm ON cs.id = cm.session_id
  GROUP BY cs.project_id
) message_stats ON p.id = message_stats.project_id
LEFT JOIN (
  SELECT 
    project_id,
    COUNT(*) as total_files
  FROM project_files
  WHERE is_deleted = false
  GROUP BY project_id
) file_stats ON p.id = file_stats.project_id
WHERE p.status != 'deleted';

-- Recent chat activity across all projects for a user
CREATE VIEW recent_chat_activity AS
SELECT 
  cm.id,
  cm.user_id,
  cs.project_id,
  p.name as project_name,
  cm.session_id,
  cm.role as message_role,
  LEFT(cm.content, 200) as message_content, -- Truncate for performance
  cm.timestamp,
  cm.is_checkpoint
FROM chat_messages cm
JOIN chat_sessions cs ON cm.session_id = cs.id
JOIN projects p ON cs.project_id = p.id
WHERE p.status = 'active'
ORDER BY cm.timestamp DESC;

-- File change history with project and session context
CREATE VIEW file_change_history AS
SELECT 
  cc.id,
  cc.project_id,
  cc.file_id,
  pf.file_path,
  pf.file_name,
  cc.change_type,
  cc.old_content,
  cc.new_content,
  cc.diff_content,
  cc.session_id,
  cc.message_id,
  cc.created_at,
  up.full_name as created_by_user_name,
  cm.user_id as created_by_user_id,
  fs.change_description
FROM code_changes cc
JOIN project_files pf ON cc.file_id = pf.id
LEFT JOIN chat_messages cm ON cc.message_id = cm.id
LEFT JOIN user_profiles up ON cm.user_id = up.id
LEFT JOIN file_snapshots fs ON fs.file_id = cc.file_id 
  AND fs.session_id = cc.session_id 
  AND fs.message_id = cc.message_id
ORDER BY cc.created_at DESC;

-- User activity summary
CREATE VIEW user_activity_summary AS
SELECT 
  up.id as user_id,
  up.full_name,
  COUNT(DISTINCT p.id) as total_projects,
  COUNT(DISTINCT cs.id) as total_sessions,
  COUNT(DISTINCT cm.id) as total_messages,
  COUNT(DISTINCT pf.id) as total_files,
  COUNT(DISTINCT cc.id) as total_changes,
  MAX(cm.timestamp) as last_activity
FROM user_profiles up
LEFT JOIN projects p ON up.id = p.user_id AND p.status = 'active'
LEFT JOIN chat_sessions cs ON p.id = cs.project_id
LEFT JOIN chat_messages cm ON cs.id = cm.session_id
LEFT JOIN project_files pf ON p.id = pf.project_id AND pf.is_deleted = false
LEFT JOIN code_changes cc ON p.id = cc.project_id
GROUP BY up.id, up.full_name;

-- Project collaboration overview (for future team features)
CREATE VIEW project_collaboration_overview AS
SELECT 
  p.id as project_id,
  p.name as project_name,
  p.user_id as owner_id,
  owner.full_name as owner_name,
  COUNT(DISTINCT pc.user_id) as total_collaborators,
  COUNT(DISTINCT cs.id) as total_sessions,
  COUNT(DISTINCT cm.id) as total_messages,
  MAX(cm.timestamp) as last_activity
FROM projects p
JOIN user_profiles owner ON p.user_id = owner.id
LEFT JOIN project_collaborators pc ON p.id = pc.project_id AND pc.role IN ('owner', 'editor', 'viewer')
LEFT JOIN chat_sessions cs ON p.id = cs.project_id
LEFT JOIN chat_messages cm ON cs.id = cm.session_id
WHERE p.status = 'active'
GROUP BY p.id, p.name, p.user_id, owner.full_name;

-- File version history with snapshot details
CREATE VIEW file_version_history AS
SELECT 
  fs.id as snapshot_id,
  fs.file_id,
  pf.file_path,
  pf.file_name,
  pf.project_id,
  p.name as project_name,
  fs.version,
  fs.change_description,
  fs.created_at,
  fs.created_by_user_id,
  up.full_name as created_by_user_name,
  cs.title as session_title,
  LENGTH(fs.content) as content_size,
  LENGTH(fs.diff_content) as diff_size
FROM file_snapshots fs
JOIN project_files pf ON fs.file_id = pf.id
JOIN projects p ON pf.project_id = p.id
LEFT JOIN user_profiles up ON fs.created_by_user_id = up.id
LEFT JOIN chat_sessions cs ON fs.session_id = cs.id
ORDER BY fs.file_id, fs.version DESC; 