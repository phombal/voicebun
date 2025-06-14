// Database types for Supabase schema
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'last_accessed_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at'>>;
      };
      project_data: {
        Row: ProjectData;
        Insert: Omit<ProjectData, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ProjectData, 'id' | 'created_at'>>;
      };
      phone_numbers: {
        Row: PhoneNumber;
        Insert: Omit<PhoneNumber, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PhoneNumber, 'id' | 'created_at'>>;
      };
      user_plans: {
        Row: UserPlan;
        Insert: Omit<UserPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<UserPlan, 'id' | 'created_at'>>;
      };
    };
    Views: {
      // No views currently
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

export interface UserPlan {
  id: string;
  user_id: string;
  plan_name: 'free' | 'professional' | 'enterprise';
  subscription_status: 'active' | 'inactive' | 'cancelled' | 'past_due' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  conversation_minutes_used: number;
  conversation_minutes_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AgentConfiguration {
  id: string;
  project_id: string;
  user_id: string;
  config_name: string;
  description: string | null;
  stt_provider: string;
  stt_model: string;
  stt_config: Record<string, unknown>;
  tts_provider: string;
  tts_model: string;
  tts_config: Record<string, unknown>;
  llm_provider: string;
  llm_model: string;
  llm_config: Record<string, unknown>;
  vad_provider: string;
  vad_config: Record<string, unknown>;
  turn_detection_config: Record<string, unknown>;
  function_calls: unknown[];
  tool_integrations: unknown[];
  agent_instructions: string;
  agent_personality: Record<string, unknown>;
  required_env_vars: string[];
  dependencies: string[];
  source_files: Record<string, string>;
  is_active: boolean;
  version: number;
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
  metadata: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  is_checkpoint: boolean;
  context_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
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
  line_changes: Record<string, unknown> | null;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  editor_theme: string;
  auto_save_enabled: boolean;
  notification_preferences: Record<string, unknown>;
  ui_preferences: Record<string, unknown>;
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

export interface PhoneNumber {
  id: string;
  phone_number: string;
  country_code: string | null;
  phone_number_type: string | null;
  locality: string | null;
  user_id: string;
  project_id: string | null; // Allow null for unassigned numbers
  telnyx_order_id: string | null;
  telnyx_phone_number_id: string | null;
  connection_id: string | null;
  messaging_profile_id: string | null;
  billing_group_id: string | null;
  customer_reference: string | null;
  dispatch_rule_id: string | null; // LiveKit SIP dispatch rule ID
  status: string;
  is_active: boolean;
  voice_agent_enabled: boolean;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  recording_enabled: boolean;
  purchased_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
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
  context_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
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
  line_changes: Record<string, unknown> | null;
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

// Project Data Configuration - detailed settings that users can update
export interface ProjectData {
  id: string;
  project_id: string;
  user_id: string;
  
  // System Prompt & Instructions
  system_prompt: string;
  agent_instructions: string | null;
  first_message_mode: 'wait' | 'speak_first' | 'speak_first_with_model_generated_message';
  
  // Base Model Configuration
  llm_provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'xai';
  llm_model: string;
  llm_temperature: number;
  llm_max_response_length: 150 | 300 | 500 | 1000;
  
  // Speech-to-Text Configuration
  stt_provider: 'deepgram';
  stt_language: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh';
  stt_quality: 'standard' | 'enhanced' | 'premium';
  stt_processing_mode: 'streaming' | 'batch';
  stt_noise_suppression: boolean;
  stt_auto_punctuation: boolean;
  
  // Text-to-Speech Configuration
  tts_provider: 'cartesia' | 'elevenlabs' | 'openai';
  tts_voice: 'neutral' | 'male' | 'british_male' | 'deep_male' | 'female' | 'soft_female';
  
  // Phone Configuration
  phone_number: string | null;
  phone_inbound_enabled: boolean;
  phone_outbound_enabled: boolean;
  phone_recording_enabled: boolean;
  
  // Performance Settings
  response_latency_priority: 'speed' | 'balanced' | 'quality';
  
  // Knowledge Base Files
  knowledge_base_files: Array<{
    name: string;
    type: 'pdf' | 'txt' | 'docx' | 'csv' | 'json';
    content: string;
    size: number;
  }>;
  
  // Functions & Tools
  functions_enabled: boolean;
  custom_functions: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  
  // Webhooks
  webhooks_enabled: boolean;
  webhook_url: string | null;
  webhook_events: string[];
  
  // Metadata
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Configuration input type (without metadata fields)
export interface ProjectDataConfig {
  system_prompt: string;
  agent_instructions?: string;
  first_message_mode?: 'wait' | 'speak_first' | 'speak_first_with_model_generated_message';
  llm_provider?: 'openai' | 'anthropic' | 'google' | 'azure' | 'xai';
  llm_model?: string;
  llm_temperature?: number;
  llm_max_response_length?: 150 | 300 | 500 | 1000;
  stt_provider?: 'deepgram';
  stt_language?: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh';
  stt_quality?: 'standard' | 'enhanced' | 'premium';
  stt_processing_mode?: 'streaming' | 'batch';
  stt_noise_suppression?: boolean;
  stt_auto_punctuation?: boolean;
  tts_provider?: 'cartesia' | 'elevenlabs' | 'openai';
  tts_voice?: 'neutral' | 'male' | 'british_male' | 'deep_male' | 'female' | 'soft_female';
  phone_number?: string;
  phone_inbound_enabled?: boolean;
  phone_outbound_enabled?: boolean;
  phone_recording_enabled?: boolean;
  response_latency_priority?: 'speed' | 'balanced' | 'quality';
  knowledge_base_files?: Array<{
    name: string;
    type: 'pdf' | 'txt' | 'docx' | 'csv' | 'json';
    content: string;
    size: number;
  }>;
  functions_enabled?: boolean;
  custom_functions?: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  webhooks_enabled?: boolean;
  webhook_url?: string;
  webhook_events?: string[];
}

// Request types for creating entities
export interface CreateProjectRequest {
  name: string;
  description?: string;
  initial_prompt: string;
  config: Record<string, unknown>;
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
  context_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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