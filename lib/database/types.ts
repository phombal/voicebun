// Database types for Supabase schema
export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserProfile, 'id' | 'created_at'>>;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'last_accessed_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at'>>;
      };
      chat_sessions: {
        Row: ChatSession;
        Insert: Omit<ChatSession, 'id' | 'started_at' | 'message_count'>;
        Update: Partial<Omit<ChatSession, 'id' | 'started_at'>>;
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Omit<ChatMessage, 'id' | 'timestamp'>;
        Update: Partial<Omit<ChatMessage, 'id' | 'timestamp'>>;
      };
      project_files: {
        Row: ProjectFile;
        Insert: Omit<ProjectFile, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ProjectFile, 'id' | 'created_at'>>;
      };
      file_snapshots: {
        Row: FileSnapshot;
        Insert: Omit<FileSnapshot, 'id' | 'created_at'>;
        Update: Partial<Omit<FileSnapshot, 'id' | 'created_at'>>;
      };
      project_snapshots: {
        Row: ProjectSnapshot;
        Insert: Omit<ProjectSnapshot, 'id' | 'created_at'>;
        Update: Partial<Omit<ProjectSnapshot, 'id' | 'created_at'>>;
      };
      code_changes: {
        Row: CodeChange;
        Insert: Omit<CodeChange, 'id' | 'created_at'>;
        Update: Partial<Omit<CodeChange, 'id' | 'created_at'>>;
      };
      user_preferences: {
        Row: UserPreferences;
        Insert: Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserPreferences, 'id' | 'created_at'>>;
      };
      project_collaborators: {
        Row: ProjectCollaborator;
        Insert: Omit<ProjectCollaborator, 'id' | 'invited_at'>;
        Update: Partial<Omit<ProjectCollaborator, 'id' | 'invited_at'>>;
      };
    };
    Views: {
      project_overview: {
        Row: ProjectOverview;
      };
      recent_chat_activity: {
        Row: RecentChatActivity;
      };
      file_change_history: {
        Row: FileChangeHistory;
      };
    };
  };
}

// Core entity types
export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  initial_prompt: string;
  config: VoiceAgentConfig;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
}

export interface ChatSession {
  id: string;
  project_id: string;
  user_id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  message_count: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  is_checkpoint: boolean;
  context_data: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  file_name: string;
  file_type: 'file' | 'folder';
  content: string | null;
  language: string | null;
  size_bytes: number;
  version: number;
  parent_path: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface FileSnapshot {
  id: string;
  file_id: string;
  project_id: string;
  session_id: string | null;
  message_id: string | null;
  content: string;
  version: number;
  change_description: string | null;
  diff_content: string | null;
  created_at: string;
  created_by_user_id: string | null;
}

export interface ProjectSnapshot {
  id: string;
  project_id: string;
  session_id: string | null;
  message_id: string | null;
  snapshot_name: string | null;
  description: string | null;
  files_data: {
    files: Array<{
      path: string;
      name: string;
      type: string;
      content: string;
      version: number;
    }>;
  };
  created_at: string;
  created_by_user_id: string | null;
}

export interface CodeChange {
  id: string;
  project_id: string;
  session_id: string;
  message_id: string;
  file_id: string;
  change_type: 'create' | 'update' | 'delete' | 'rename';
  old_content: string | null;
  new_content: string | null;
  diff_content: string | null;
  line_changes: Record<string, any> | null;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  editor_theme: string;
  auto_save_enabled: boolean;
  notification_preferences: Record<string, any>;
  ui_preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ProjectCollaborator {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
}

// View types
export interface ProjectOverview {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  initial_prompt: string;
  config: VoiceAgentConfig;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  latest_session_date: string | null;
  total_sessions: number | null;
  total_messages: number | null;
  total_files: number | null;
}

export interface RecentChatActivity {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  is_checkpoint: boolean;
  context_data: Record<string, any>;
  metadata: Record<string, any>;
  project_id: string;
  project_name: string;
  user_name: string | null;
}

export interface FileChangeHistory {
  id: string;
  project_id: string;
  session_id: string;
  message_id: string;
  file_id: string;
  change_type: 'create' | 'update' | 'delete' | 'rename';
  old_content: string | null;
  new_content: string | null;
  diff_content: string | null;
  line_changes: Record<string, any> | null;
  created_at: string;
  file_name: string;
  file_path: string;
  project_name: string;
  message_content: string;
  change_timestamp: string;
}

// Voice Agent Config type (from your existing code)
export interface VoiceAgentConfig {
  prompt: string;
  personality: string;
  language: string;
  responseStyle: string;
  capabilities: string[];
}

// Request types for creating entities
export interface CreateProjectRequest {
  name: string;
  description?: string;
  initial_prompt: string;
  config: Record<string, any>;
}

export interface CreateSessionRequest {
  project_id: string;
  title?: string;
}

export interface CreateMessageRequest {
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  is_checkpoint?: boolean;
  context_data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateFileRequest {
  file_path: string;
  file_name: string;
  file_type: 'file' | 'folder';
  content?: string;
  language?: string;
  parent_path?: string;
}

export interface UpdateFileRequest {
  file_path: string;
  content: string;
  change_description?: string;
}

// Filter types for queries
export interface ProjectFilters {
  status?: 'active' | 'archived' | 'deleted';
  search?: string;
  created_after?: string;
  created_before?: string;
}

export interface ChatSessionFilters {
  is_active?: boolean;
  started_after?: string;
  started_before?: string;
}

export interface MessageFilters {
  role?: 'user' | 'assistant';
  is_checkpoint?: boolean;
  search?: string;
  timestamp_after?: string;
  timestamp_before?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

// View types for complex queries
export interface ProjectOverview {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  total_sessions: number | null;
  total_messages: number | null;
  total_files: number | null;
  last_activity: string | null;
}

export interface RecentChatActivity {
  id: string;
  user_id: string;
  project_id: string;
  project_name: string;
  session_id: string;
  message_role: 'user' | 'assistant';
  message_content: string;
  timestamp: string;
  is_checkpoint: boolean;
}

export interface FileChangeHistory {
  id: string;
  project_id: string;
  file_id: string;
  file_path: string;
  file_name: string;
  change_type: 'create' | 'update' | 'delete' | 'rename';
  old_content: string | null;
  new_content: string | null;
  diff_content: string | null;
  session_id: string;
  message_id: string;
  created_at: string;
  created_by_user_id: string;
  change_description: string | null;
} 