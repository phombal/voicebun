import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './auth';
import { 
  Database, 
  Project, 
  ProjectData,
  ProjectDataConfig,
  CreateProjectRequest,
  ProjectFilters,
  PaginationParams,
  PhoneNumber,
  UserPlan
} from './types';

export class ClientDatabaseService {
  private supabase: SupabaseClient<Database>;

  constructor() {
    this.supabase = supabase;
  }

  // Auth helpers
  async getCurrentUser() {
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getCurrentUserId(): Promise<string> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');
    return user.id;
  }

  // Project Management (Client-side only)
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: request.name,
        description: request.description || null,
        initial_prompt: request.initial_prompt,
        config: request.config,
        visibility: request.visibility || 'private'
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getUserProjects(
    filters: ProjectFilters = {},
    pagination: PaginationParams = {}
  ): Promise<Project[]> {
    const userId = await this.getCurrentUserId();

    let query = this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'deleted');

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }
    if (filters.created_after) {
      query = query.gte('created_at', filters.created_after);
    }
    if (filters.created_before) {
      query = query.lte('created_at', filters.created_before);
    }

    // Apply sorting
    const { sort_by = 'updated_at', sort_order = 'desc' } = pagination;
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  async updateProject(projectId: string, updates: Partial<Omit<Project, 'id' | 'created_at'>>): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateProjectAccess(projectId: string): Promise<void> {
    await this.updateProject(projectId, { last_accessed_at: new Date().toISOString() });
  }

  async deleteProject(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ status: 'deleted' })
      .eq('id', projectId);
    
    if (error) throw error;
  }

  // Project Data Management (Client-side only)
  async createProjectData(projectId: string, data: ProjectDataConfig): Promise<ProjectData> {
    const userId = await this.getCurrentUserId();
    
    // First, deactivate any existing active records for this project
    await this.supabase
      .from('project_data')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('is_active', true);
    
    const { data: projectData, error } = await this.supabase
      .from('project_data')
      .insert({
        project_id: projectId,
        user_id: userId,
        version: 1,
        is_active: true,
        // Map the config data to the ProjectData format
        system_prompt: data.system_prompt || '',
        agent_instructions: data.agent_instructions || null,
        first_message_mode: data.first_message_mode || 'wait',
        llm_provider: data.llm_provider || 'openai',
        llm_model: data.llm_model || 'gpt-4o-mini',
        llm_temperature: data.llm_temperature || 0.7,
        llm_max_response_length: data.llm_max_response_length || 150,
        stt_provider: data.stt_provider || 'deepgram',
        stt_language: data.stt_language || 'en',
        stt_quality: data.stt_quality || 'standard',
        stt_processing_mode: data.stt_processing_mode || 'streaming',
        stt_noise_suppression: data.stt_noise_suppression || false,
        stt_auto_punctuation: data.stt_auto_punctuation || true,
        tts_provider: data.tts_provider || 'cartesia',
        tts_voice: data.tts_voice || 'neutral',
        phone_number: data.phone_number || null,
        phone_inbound_enabled: data.phone_inbound_enabled || false,
        phone_outbound_enabled: data.phone_outbound_enabled || false,
        phone_recording_enabled: data.phone_recording_enabled || false,
        response_latency_priority: data.response_latency_priority || 'balanced',
        knowledge_base_files: data.knowledge_base_files || [],
        functions_enabled: data.functions_enabled || false,
        custom_functions: data.custom_functions || [],
        webhooks_enabled: data.webhooks_enabled || false,
        webhook_url: data.webhook_url || null,
        webhook_events: data.webhook_events || []
      })
      .select()
      .single();
    
    if (error) throw error;
    return projectData;
  }

  async getProjectData(projectId: string): Promise<ProjectData | null> {
    const { data, error } = await this.supabase
      .from('project_data')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  }

  async updateProjectData(projectId: string, updates: Partial<ProjectDataConfig>): Promise<ProjectData> {
    const userId = await this.getCurrentUserId();
    
    // First, deactivate all existing active records for this project
    await this.supabase
      .from('project_data')
      .update({ is_active: false })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('is_active', true);

    // Get the current highest version number
    const { data: currentVersionData } = await this.supabase
      .from('project_data')
      .select('version')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (currentVersionData && currentVersionData.length > 0 ? currentVersionData[0].version : 0) + 1;
    
    const recordData = {
      project_id: projectId,
      user_id: userId,
      // Map the config updates to the ProjectData format
      system_prompt: updates.system_prompt || '',
      agent_instructions: updates.agent_instructions || null,
      first_message_mode: updates.first_message_mode || 'wait',
      llm_provider: updates.llm_provider || 'openai',
      llm_model: updates.llm_model || 'gpt-4o-mini',
      llm_temperature: updates.llm_temperature || 0.7,
      llm_max_response_length: updates.llm_max_response_length || 150,
      stt_provider: updates.stt_provider || 'deepgram',
      stt_language: updates.stt_language || 'en',
      stt_quality: updates.stt_quality || 'standard',
      stt_processing_mode: updates.stt_processing_mode || 'streaming',
      stt_noise_suppression: updates.stt_noise_suppression || false,
      stt_auto_punctuation: updates.stt_auto_punctuation || true,
      tts_provider: updates.tts_provider || 'cartesia',
      tts_voice: updates.tts_voice || 'neutral',
      phone_number: updates.phone_number || null,
      phone_inbound_enabled: updates.phone_inbound_enabled || false,
      phone_outbound_enabled: updates.phone_outbound_enabled || false,
      phone_recording_enabled: updates.phone_recording_enabled || false,
      response_latency_priority: updates.response_latency_priority || 'balanced',
      knowledge_base_files: updates.knowledge_base_files || [],
      functions_enabled: updates.functions_enabled || false,
      custom_functions: updates.custom_functions || [],
      webhooks_enabled: updates.webhooks_enabled || false,
      webhook_url: updates.webhook_url || null,
      webhook_events: updates.webhook_events || [],
      version: nextVersion,
      is_active: true
    };
    
    // Always insert a new record (no longer updating existing)
    console.log('➕ Creating new configuration version...');
    const { data, error } = await this.supabase
      .from('project_data')
      .insert(recordData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getProjectDataHistory(projectId: string): Promise<ProjectData[]> {
    const { data, error } = await this.supabase
      .from('project_data')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  // Phone Number Management (Client-side only)
  async getUserPhoneNumbers(): Promise<PhoneNumber[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getUnassignedPhoneNumbers(): Promise<PhoneNumber[]> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('project_id', null)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async getProjectPhoneNumbers(projectId: string): Promise<PhoneNumber[]> {
    const { data, error } = await this.supabase
      .from('phone_numbers')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  // User Plan Management (Client-side only)
  async getUserPlan(): Promise<UserPlan | null> {
    const userId = await this.getCurrentUserId();
    
    const { data, error } = await this.supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateUserPlan(userId: string, updates: Partial<UserPlan>): Promise<UserPlan> {
    const { data, error } = await this.supabase
      .from('user_plans')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateConversationMinutes(userId: string, minutesUsed: number): Promise<UserPlan> {
    const { data, error } = await this.supabase
      .from('user_plans')
      .update({ 
        conversation_minutes_used: minutesUsed,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}

// Export a singleton instance for convenience
export const clientDb = new ClientDatabaseService(); 